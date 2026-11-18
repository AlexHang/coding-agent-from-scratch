const { setProjectRoot } = require("./resolvePath");
const { readFile } = require("./readFile");
const { writeFile } = require("./writeFile");
const { deleteFile } = require("./deleteFile");
const { runCommand } = require("./runCommand");

const toolDefinitions = [
  {
    name: "read_file",
    description: "Read a UTF-8 text file inside the project.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path relative to the project root.",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "write_file",
    description: "Create or overwrite a UTF-8 text file inside the project.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path relative to the project root.",
        },
        content: {
          type: "string",
          description: "Full file contents to write.",
        },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_file",
    description: "Delete a file inside the project.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path relative to the project root.",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "run_command",
    description: "Run a shell command on this machine. The working directory defaults to the project root.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Shell command to run.",
        },
        cwd: {
          type: "string",
          description: "Working directory relative to the project root.",
        },
        timeoutMs: {
          type: "number",
          description: "Timeout in milliseconds, from 1 to 300000. Defaults to 30000.",
        },
      },
      required: ["command"],
      additionalProperties: false,
    },
  },
];

const tools = {
  read_file: readFile,
  write_file: writeFile,
  delete_file: deleteFile,
  run_command: runCommand,
};

async function executeTool(name, args = {}) {
  const tool = tools[name];
  if (!tool) {
    return {
      ok: false,
      error: `unknown tool: ${name}`,
    };
  }

  try {
    const result = await tool(args);
    return { ok: true, ...result };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

module.exports = {
  toolDefinitions,
  tools,
  executeTool,
  setProjectRoot,
  readFile,
  writeFile,
  deleteFile,
  runCommand,
};
