const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "atlas",
  Object.fromEntries(
    [
      "state",
      "markActivitySeen",
      "updateState",
      "checkUpdate",
      "downloadUpdate",
      "installUpdate",
      "systemCheck",
      "securityRefresh",
      "importInventory",
      "importFeed",
      "saveProject",
      "deleteProject",
      "refresh",
      "refreshProject",
      "scanRepositoryTechnologies",
      "scanLocalTechnologies",
      "accounts",
      "connect",
      "disconnect",
      "exportData",
      "importData",
      "openExternal",
    ].map((name) => [
      name,
      (...args) => ipcRenderer.invoke(`atlas:${name}`, ...args),
    ]),
  ),
);
