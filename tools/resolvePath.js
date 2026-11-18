const fs = require("fs");
const path = require("path");

let projectRoot = fs.realpathSync(path.resolve(__dirname, ".."));

function getProjectRoot() {
  return projectRoot;
}

function setProjectRoot(directory) {
  if (typeof directory !== "string" || directory.trim() === "") {
    throw new Error("project path is required");
  }

  const resolved = path.resolve(directory);
  try {
    fs.mkdirSync(resolved, { recursive: true });
  } catch {
    throw new Error(`project path is not a directory: ${directory}`);
  }

  let realPath;
  try {
    realPath = fs.realpathSync(resolved);
  } catch {
    throw new Error(`cannot resolve project path: ${directory}`);
  }

  if (!fs.statSync(realPath).isDirectory()) {
    throw new Error(`project path is not a directory: ${directory}`);
  }

  projectRoot = realPath;
  return projectRoot;
}

function resolveInsideProject(inputPath) {
  if (typeof inputPath !== "string" || inputPath.trim() === "") {
    throw new Error("path is required");
  }

  const resolved = path.resolve(projectRoot, inputPath);
  const suffix = [];
  let current = resolved;

  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`path not found: ${inputPath}`);
    }
    suffix.push(path.basename(current));
    current = parent;
  }

  let realCurrent;
  try {
    realCurrent = fs.realpathSync(current);
  } catch {
    throw new Error(`cannot resolve path: ${inputPath}`);
  }

  const realResolved =
    suffix.length > 0 ? path.join(realCurrent, ...suffix.reverse()) : realCurrent;
  const relative = path.relative(projectRoot, realResolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`path must stay inside the project: ${inputPath}`);
  }

  return realResolved;
}

function toProjectRelative(absolutePath) {
  const relative = path.relative(projectRoot, absolutePath);
  return relative === "" ? "." : relative;
}

module.exports = {
  get PROJECT_ROOT() {
    return projectRoot;
  },
  getProjectRoot,
  setProjectRoot,
  resolveInsideProject,
  toProjectRelative,
};
