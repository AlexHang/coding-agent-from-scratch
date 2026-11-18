const fs = require("fs/promises");
const { resolveInsideProject, toProjectRelative } = require("./resolvePath");

async function deleteFile({ path: filePath } = {}) {
  const absolutePath = resolveInsideProject(filePath);
  const stat = await fs.lstat(absolutePath);

  if (stat.isDirectory()) {
    throw new Error(`not a file: ${filePath}`);
  }

  await fs.unlink(absolutePath);
  return {
    path: toProjectRelative(absolutePath),
    deleted: true,
  };
}

module.exports = { deleteFile };
