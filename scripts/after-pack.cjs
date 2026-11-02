const fs = require("node:fs/promises");
const path = require("node:path");
module.exports = async function afterPack(context) {
  if (context.electronPlatformName === "linux") {
    // electron-builder stages its AppRun first, then copies appOutDir over it.
    // Supply Atlas's launcher so AppImage never silently adds --no-sandbox.
    await fs.copyFile(
      path.join(context.packager.projectDir, "build/AppRun"),
      path.join(context.appOutDir, "AppRun"),
    );
    await fs.chmod(path.join(context.appOutDir, "AppRun"), 0o755);
  }
};
