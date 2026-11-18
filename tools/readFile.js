const fs = require("fs/promises");
const { resolveInsideProject, toProjectRelative } = require("./resolvePath");

const MAX_BYTES = 1024 * 1024;

async function readFile({ path: filePath } = {}) {
  const absolutePath = resolveInsideProject(filePath);
  const stat = await fs.stat(absolutePath);

  if (!stat.isFile()) {
    throw new Error(`not a file: ${filePath}`);
  }

  if (stat.size > MAX_BYTES) {
    throw new Error(`file is larger than 1MB: ${filePath}`);
  }

  const content = await fs.readFile(absolutePath, "utf8");
  return {
    path: toProjectRelative(absolutePath),
    content,
  };
}

module.exports = { readFile };
