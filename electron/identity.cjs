const path = require("node:path");
function configureStorage(app) {
  // Preserve the workspace when moving from source to the branded installed app.
  if (app.isPackaged)
    app.setPath("userData", path.join(app.getPath("appData"), "project-atlas"));
}
module.exports = { configureStorage };
