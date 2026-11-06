const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("atlas", {
  onMonitoring: (callback) => {
    const listener = (_event, active) => callback(active);
    ipcRenderer.on("atlas:monitoring", listener);
    return () => ipcRenderer.removeListener("atlas:monitoring", listener);
  },
  ...Object.fromEntries(
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
});
