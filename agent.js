const fs = require("fs");
const path = require("path");
const readline = require("readline/promises");
const OpenAI = require("openai");
const { executeTool, setProjectRoot, toolDefinitions } = require("./tools");

const USAGE = `Usage: node agent.js --path <directory> --prompt <text>

The harness implements the prompt in the given directory.
It prints each model response and keeps going until the model stops calling tools.

Options:
  --path, -p     Directory where the project is implemented
  --prompt       What the agent should build
  --help, -h     Show this help
`;

const MAX_TURNS = 40;

function parseArgs(argv) {
  let projectPath;
  const promptParts = [];
  let promptFlag;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }

    if (arg === "--path" || arg === "-p") {
      projectPath = argv[index + 1];
      if (projectPath === undefined) {
        throw new Error("Missing value for --path");
      }
      index += 1;
      continue;
    }

    if (arg === "--prompt") {
      promptFlag = argv[index + 1];
      if (promptFlag === undefined) {
        throw new Error("Missing value for --prompt");
      }
      index += 1;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (projectPath === undefined) {
      projectPath = arg;
      continue;
    }

    promptParts.push(arg);
  }

  const prompt = promptFlag !== undefined ? promptFlag : promptParts.join(" ");
  return {
    help: false,
    path: projectPath,
    prompt: prompt === "" ? undefined : prompt,
  };
}

function messageText(message) {
  const content = message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part?.text === "string" ? part.text : "")).join("");
  }
  return "";
}

function toApiTools(definitions) {
  return definitions.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function parseToolArguments(value) {
  if (value === undefined || value === "") {
    return {};
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value;
  }

  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("tool arguments were not valid JSON");
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("tool arguments must be an object");
  }

  return parsed;
}

async function executeModelToolCall(toolCall) {
  if (toolCall.type && toolCall.type !== "function") {
    return { ok: false, error: `unsupported tool call type: ${toolCall.type}` };
  }

  const name = toolCall.function?.name;
  if (typeof name !== "string" || name.trim() === "") {
    return { ok: false, error: "tool call is missing a name" };
  }

  try {
    const args = parseToolArguments(toolCall.function?.arguments);
    return await executeTool(name, args);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function writeModelText(stdout, text, started) {
  const body = text.endsWith("\n") ? text : `${text}\n`;
  stdout.write(started ? `\n${body}` : body);
}

async function runHarness({
  client,
  model,
  systemPrompt,
  userPrompt,
  projectPath,
  definitions = toolDefinitions,
  maxTurns = MAX_TURNS,
  stdout = process.stdout,
  stderr = process.stderr,
}) {
  const root = setProjectRoot(projectPath);
  stderr.write(`Project: ${root}\n`);

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
  const tools = toApiTools(definitions);
  let printed = false;

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const completion = await client.chat.completions.create({
      model,
      messages,
      tools,
    });
    const choice = completion.choices[0];
    if (!choice) {
      throw new Error("The model returned no choice.");
    }
    if (choice.finish_reason === "length") {
      throw new Error("The model response was cut off before it finished.");
    }

    const message = choice.message ?? {};
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    const text = messageText(message);

    messages.push({
      role: "assistant",
      content: message.content ?? null,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    });

    if (text.trim()) {
      writeModelText(stdout, text, printed);
      printed = true;
    } else if (toolCalls.length === 0 && typeof message.refusal === "string" && message.refusal.trim()) {
      writeModelText(stdout, message.refusal, printed);
      return;
    } else if (toolCalls.length === 0) {
      throw new Error("The model returned an empty response.");
    }

    if (toolCalls.length === 0) {
      return;
    }

    for (const toolCall of toolCalls) {
      if (typeof toolCall.id !== "string" || toolCall.id === "") {
        throw new Error("The model returned a tool call without an id.");
      }

      const result = await executeModelToolCall(toolCall);
      const name = toolCall.function?.name || "tool";
      if (result.ok) {
        stderr.write(`[tool] ${name}\n`);
      } else {
        stderr.write(`[tool] ${name} failed: ${result.error}\n`);
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }
  }

  throw new Error(`Stopped after ${maxTurns} model turns before the task was done.`);
}

async function askForMissing(options) {
  let projectPath = options.path;
  let prompt = options.prompt;

  if (projectPath && prompt) {
    return { projectPath, prompt };
  }

  if (!process.stdin.isTTY) {
    throw new Error(USAGE.trim());
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  try {
    if (!projectPath) {
      projectPath = (await rl.question("Project path: ")).trim();
    }
    if (!prompt) {
      prompt = (await rl.question("Prompt: ")).trim();
    }
  } finally {
    rl.close();
  }

  if (!projectPath || !prompt) {
    throw new Error("A project path and a prompt are required.");
  }

  return { projectPath, prompt };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(USAGE);
    return;
  }

  require("dotenv").config({ path: path.join(__dirname, ".env") });
  const apiKey = process.env.OPEN_AI_API_KEY;
  const model = process.env.OPEN_AI_MODEL;
  delete process.env.OPEN_AI_API_KEY;

  if (!apiKey) {
    throw new Error("OPEN_AI_API_KEY is missing from .env");
  }
  if (!model) {
    throw new Error("OPEN_AI_MODEL is missing from .env");
  }

  const systemPrompt = fs.readFileSync(path.join(__dirname, "prompts", "system.md"), "utf8");
  const { projectPath, prompt } = await askForMissing(args);
  const client = new OpenAI({ apiKey });

  await runHarness({
    client,
    model,
    systemPrompt,
    userPrompt: prompt,
    projectPath,
  });
}

module.exports = {
  parseArgs,
  runHarness,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
