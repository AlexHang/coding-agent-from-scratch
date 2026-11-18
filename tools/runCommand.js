const fs = require("fs/promises");
const { spawn } = require("child_process");
const {
  getProjectRoot,
  resolveInsideProject,
  toProjectRelative,
} = require("./resolvePath");

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 300_000;
const MAX_OUTPUT_CHARS = 1024 * 1024;

function assertTimeout(timeoutMs) {
  if (timeoutMs === undefined) {
    return DEFAULT_TIMEOUT_MS;
  }

  if (
    typeof timeoutMs !== "number" ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAX_TIMEOUT_MS
  ) {
    throw new Error("timeoutMs must be a number between 1 and 300000");
  }

  return timeoutMs;
}

async function resolveCwd(cwd) {
  const absoluteCwd = cwd === undefined ? getProjectRoot() : resolveInsideProject(cwd);
  const stat = await fs.stat(absoluteCwd);

  if (!stat.isDirectory()) {
    throw new Error(`cwd is not a directory: ${cwd}`);
  }

  return absoluteCwd;
}

function runCommand({ command, cwd, timeoutMs } = {}) {
  if (typeof command !== "string" || command.trim() === "") {
    return Promise.reject(new Error("command is required"));
  }

  const timeout = assertTimeout(timeoutMs);

  return resolveCwd(cwd).then(
    (absoluteCwd) =>
      new Promise((resolve, reject) => {
        const child = spawn(command, {
          cwd: absoluteCwd,
          shell: true,
          env: process.env,
        });

        let stdout = "";
        let stderr = "";
        let settled = false;
        const timer = setTimeout(() => {
          child.kill("SIGTERM");
          finish(() => reject(new Error(`command timed out after ${timeout}ms`)));
        }, timeout);

        function finish(settle) {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(timer);
          settle();
        }

        function capture(current, chunk, streamName) {
          const next = current + chunk.toString("utf8");
          if (next.length > MAX_OUTPUT_CHARS) {
            child.kill("SIGTERM");
            finish(() =>
              reject(new Error(`${streamName} exceeded ${MAX_OUTPUT_CHARS} characters`))
            );
            return null;
          }
          return next;
        }

        child.stdout.on("data", (chunk) => {
          const next = capture(stdout, chunk, "stdout");
          if (next !== null) {
            stdout = next;
          }
        });

        child.stderr.on("data", (chunk) => {
          const next = capture(stderr, chunk, "stderr");
          if (next !== null) {
            stderr = next;
          }
        });

        child.on("error", (error) => finish(() => reject(error)));

        child.on("close", (exitCode, signal) => {
          finish(() =>
            resolve({
              command,
              cwd: toProjectRelative(absoluteCwd),
              exitCode,
              signal,
              stdout,
              stderr,
            })
          );
        });
      })
  );
}

module.exports = { runCommand };
