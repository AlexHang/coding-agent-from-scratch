const fs = require("fs/promises");
const path = require("path");
const { resolveInsideProject, toProjectRelative } = require("./resolvePath");

async function writeFile({ path: filePath, content } = {}) {
  if (typeof content !== "string") {
    throw new Error("content must be a string");
  }

  const absolutePath = resolveInsideProject(filePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");

  return {
    path: toProjectRelative(absolutePath),
    bytesWritten: Buffer.byteLength(content, "utf8"),
  };
}

module.exports = { writeFile };
