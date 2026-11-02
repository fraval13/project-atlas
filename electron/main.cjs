const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  safeStorage,
  Tray,
  Menu,
  nativeImage,
  Notification,
  shell,
} = require("electron");
const { configureStorage } = require("./identity.cjs");
configureStorage(app);
const { createUpdates } = require("./updates.cjs");
const crypto = require("node:crypto");
const { checkDesktop } = require("./requirements.cjs");
const { checkWebsite, checkRepository } = require("./monitor.cjs");
const { refreshInventory, importInventory } = require("./inventory.cjs");
const {
  syncGhsa,
  syncNvd,
  applyFindings,
  importFeed,
} = require("./security.cjs");
const fs = require("node:fs/promises");
const path = require("node:path");
const { project, repository, importData, webUrl } = require("./core.cjs");
let win,
  tray,
  quitting = false,
  workspaceReady = false,
  workspaceError = "",
  busy = false,
  securityBusy = false,
  securityAttemptAt = 0,
  feedCache = { records: [] },
  state = { version: 1, projects: [], updatedAt: null },
  secrets = {};
const file = (name) => path.join(app.getPath("userData"), name);
let writes = Promise.resolve();
async function persist() {
  if (!workspaceReady)
    throw new Error(
      "Resolve the workspace startup issue and check again before saving.",
    );
  const data = JSON.stringify(state, null, 2);
  const pending = writes
    .catch(() => {})
    .then(async () => {
      await fs.writeFile(file("projects.tmp"), data);
      await fs.rename(file("projects.tmp"), file("projects.json"));
    });
  writes = pending;
  return pending;
}
function token(host) {
  try {
    return secrets[host]
      ? safeStorage.decryptString(Buffer.from(secrets[host], "base64"))
      : "";
  } catch {
    return "";
  }
}
async function github(repo, route, project) {
  const credential = token(repo.host);
  if (!credential)
    throw new Error(
      "Connect an account to resume repository monitoring. Your history is preserved.",
    );
  const response = await fetch(`${repo.api}${route}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${credential}`,
    },
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  const expiry = response.headers.get("github-authentication-token-expiration");
  if (project && expiry && Number.isFinite(Date.parse(expiry)))
    project.tokenExpiresAt = new Date(expiry).toISOString();
  if (!response.ok) {
    if (response.headers.get("x-github-sso"))
      throw new Error(
        "SAML SSO authorization required. Authorize this token for your organization in GitHub token settings.",
      );
    throw new Error(
      response.status === 401
        ? "Authentication expired. Reconnect your account."
        : `GitHub returned ${response.status}. Check repository permissions, organization approval, and SSO authorization.`,
    );
  }
  return response.json();
}
function notify(p, body) {
  if (p.notify && Notification.isSupported())
    new Notification({ title: p.name, body }).show();
}
async function poll(force = false) {
  if (busy || !workspaceReady) return state;
  busy = true;
  try {
    const pending = [...state.projects];
    const worker = async () => {
      while (pending.length) {
        const p = pending.shift();
        const repoDue =
          force ||
          !p.repoAttemptAt ||
          Date.now() - Date.parse(p.repoAttemptAt) >= 300000;
        if (repoDue && p.repo && p.watchRepo)
          p.repoAttemptAt = new Date().toISOString();
        await Promise.all([
          checkWebsite(p, { notify }),
          repoDue ? checkRepository(p, { github, notify }) : Promise.resolve(),
        ]);
        p.events = p.events.slice(0, 100);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(4, pending.length) }, worker),
    );
    state.updatedAt = new Date().toISOString();
    await persist();
    return state;
  } finally {
    busy = false;
  }
}
async function securityJob(force = false) {
  if (
    !workspaceReady ||
    securityBusy ||
    !state.projects.some((p) => p.watchSecurity)
  )
    return state;
  if (!force && Date.now() - securityAttemptAt < 3600000) return state;
  securityBusy = true;
  securityAttemptAt = Date.now();
  state.feedInfo = { ...state.feedInfo, syncing: true };
  try {
    await Promise.all([syncGhsa(feedCache), syncNvd(feedCache)]);
    await fs.writeFile(file("security-cache.tmp"), JSON.stringify(feedCache));
    await fs.rename(file("security-cache.tmp"), file("security-cache.json"));
    for (const p of state.projects.filter((p) => p.watchSecurity)) {
      if (
        p.repo &&
        p.autoInventory &&
        (force ||
          !p.inventoryCheckedAt ||
          Date.now() - Date.parse(p.inventoryCheckedAt) > 86400000)
      )
        await refreshInventory(p, { github, repository });
      if (
        feedCache.records.length ||
        feedCache.ghsa?.status === "ready" ||
        feedCache.nvd?.status === "ready"
      )
        applyFindings(p, feedCache.records, { notify });
      p.events = p.events.slice(0, 100);
    }
    state.feedInfo = {
      ghsa: feedCache.ghsa,
      nvd: feedCache.nvd,
      recordCount: feedCache.records.length,
      syncing: false,
    };
    await persist();
    return state;
  } finally {
    securityBusy = false;
    state.feedInfo = { ...state.feedInfo, syncing: false };
  }
}
function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 980,
    minHeight: 700,
    backgroundColor: "#0d1019",
    title: "Project Atlas",
    icon: path.join(__dirname, "assets/tray.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  if (process.argv.includes("--dev")) win.loadURL("http://127.0.0.1:5173");
  else win.loadFile(path.join(__dirname, "../dist/index.html"));
  win.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });
}
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  win?.show();
  win?.focus();
});
async function loadWorkspace() {
  try {
    let loaded;
    try {
      loaded = JSON.parse(await fs.readFile(file("projects.json"), "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      loaded = { version: 1, projects: [], updatedAt: null };
    }
    if (loaded?.version !== 1 || !Array.isArray(loaded.projects))
      throw new Error("Unsupported or damaged projects.json.");
    for (const p of loaded.projects) {
      if (
        !p ||
        typeof p.id !== "string" ||
        !Array.isArray(p.events) ||
        !Array.isArray(p.prs)
      )
        throw new Error("Damaged project entry in projects.json.");
      p.access = "disconnected";
      p.status = "unknown";
    }
    state = loaded;
    workspaceReady = true;
    workspaceError = "";
  } catch (error) {
    workspaceReady = false;
    workspaceError = `Saved workspace could not be loaded (${error.code || error.message}).`;
  }
}
app.whenReady().then(async () => {
  await loadWorkspace();
  try {
    secrets = JSON.parse(await fs.readFile(file("credentials.json"), "utf8"));
  } catch {}
  try {
    feedCache = JSON.parse(
      await fs.readFile(file("security-cache.json"), "utf8"),
    );
    if (!Array.isArray(feedCache.records)) feedCache = { records: [] };
  } catch {}
  const handle = (name, fn) =>
    ipcMain.handle(`atlas:${name}`, (event, ...args) => {
      if (
        event.sender !== win?.webContents ||
        event.senderFrame !== win.webContents.mainFrame
      )
        throw new Error("Invalid IPC sender");
      if (
        !workspaceReady &&
        ![
          "state",
          "systemCheck",
          "accounts",
          "openExternal",
          "updateState",
          "checkUpdate",
          "downloadUpdate",
          "installUpdate",
        ].includes(name)
      )
        throw new Error(
          "Resolve the workspace startup issue and click Check again before changing projects.",
        );
      return fn(...args);
    });
  const updates = createUpdates({
    isPackaged: !!app.isPackaged,
    version: require("../package.json").version,
    beforeInstall: async () => {
      if (busy || securityBusy)
        throw new Error("Monitoring is running. Try restarting in a moment.");
      await writes;
      if (workspaceReady) await persist();
    },
  });
  handle("updateState", () => updates.state());
  handle("checkUpdate", () => updates.check());
  handle("downloadUpdate", () => updates.download());
  handle("installUpdate", () => updates.install());
  handle("state", () => state);
  let diagnosticsTask;
  handle("systemCheck", () => {
    if (diagnosticsTask) return diagnosticsTask;
    diagnosticsTask = (async () => {
      if (!workspaceReady) await loadWorkspace();
      return checkDesktop({
        directory: app.getPath("userData"),
        safeStorage,
        notifications: Notification,
        workspaceError,
      });
    })().finally(() => {
      diagnosticsTask = null;
    });
    return diagnosticsTask;
  });
  handle("saveProject", async (input) => {
    if (busy || securityBusy)
      throw new Error("Monitoring is running. Try again in a moment.");
    const clean = project(input),
      old = state.projects.find((p) => p.id === clean.id);
    if (old) {
      const sameRepo = old.repo === clean.repo,
        sameUrl = old.url === clean.url;
      Object.assign(old, clean, {
        events: old.events,
        security: old.security,
        detectedInventory: sameRepo ? old.detectedInventory : [],
        inventoryCheckedAt: sameRepo ? old.inventoryCheckedAt : null,
        inventoryError: sameRepo ? old.inventoryError : "",
        prs: sameRepo ? old.prs : [],
        detectedTechnologies: old.detectedTechnologies,
        repoInitialized: sameRepo && old.repoInitialized,
        access: sameRepo ? old.access : "disconnected",
        repoError: sameRepo ? old.repoError : "",
        tokenExpiresAt: sameRepo ? old.tokenExpiresAt : "",
        status: sameUrl ? old.status : "unknown",
        latency: sameUrl ? old.latency : null,
        checkedAt: sameUrl ? old.checkedAt : null,
      });
    } else state.projects.push(clean);
    await persist();
    if (clean.watchSecurity)
      setTimeout(() => securityJob(true).catch(console.error), 500);
    return state;
  });
  handle("deleteProject", async (id) => {
    if (busy || securityBusy)
      throw new Error("Monitoring is running. Try again shortly.");
    state.projects = state.projects.filter((p) => p.id !== id);
    await persist();
    return state;
  });
  handle("refresh", async () => {
    await poll(true);
    await securityJob(true);
    return state;
  });
  handle("securityRefresh", () => securityJob(true));
  handle("importInventory", async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [{ name: "Dependency inventory", extensions: ["json", "lock"] }],
    });
    if (result.canceled) return null;
    const stat = await fs.stat(result.filePaths[0]);
    if (stat.size > 20000000)
      throw new Error("Inventory must be smaller than 20 MB.");
    return importInventory(
      JSON.parse(await fs.readFile(result.filePaths[0], "utf8")),
      path.basename(result.filePaths[0]),
    );
  });
  handle("importFeed", async () => {
    if (securityBusy) throw new Error("Feed sync is already running.");
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [{ name: "NVD or GitHub advisory feed", extensions: ["json"] }],
    });
    if (result.canceled) return state;
    if (securityBusy) throw new Error("Feed sync is already running.");
    const stat = await fs.stat(result.filePaths[0]);
    if (stat.size > 250000000)
      throw new Error("Feed must be smaller than 250 MB.");
    securityBusy = true;
    try {
      const records = importFeed(
        JSON.parse(await fs.readFile(result.filePaths[0], "utf8")),
      );
      const merged = new Map(feedCache.records.map((r) => [r.id, r]));
      for (const r of records) merged.set(r.id, r);
      feedCache.records = [...merged.values()];
      feedCache.importedAt = new Date().toISOString();
      await fs.writeFile(
        file("security-cache.json"),
        JSON.stringify(feedCache),
      );
      for (const p of state.projects)
        applyFindings(p, feedCache.records, { notify });
      state.feedInfo = {
        ...state.feedInfo,
        recordCount: feedCache.records.length,
        importedAt: feedCache.importedAt,
      };
      await persist();
      return state;
    } finally {
      securityBusy = false;
    }
  });
  handle("accounts", () =>
    Object.keys(secrets).map((host) => ({ host, available: !!token(host) })),
  );
  handle("connect", async (host, value) => {
    if (busy || securityBusy)
      throw new Error("Monitoring is running. Try again shortly.");
    const repo = repository(`https://${host}/owner/repository`);
    if (repo.host !== host || typeof value !== "string" || !value.trim())
      throw new Error("Enter a valid host and token.");
    if (
      !safeStorage.isEncryptionAvailable() ||
      (process.platform === "linux" &&
        safeStorage.getSelectedStorageBackend() === "basic_text")
    )
      throw new Error(
        "No secure OS credential store available. Unlock your system keyring and restart Atlas.",
      );
    if (!Object.hasOwn(secrets, host))
      Object.defineProperty(secrets, host, {
        value: "",
        writable: true,
        enumerable: true,
        configurable: true,
      });
    secrets[host] = safeStorage.encryptString(value.trim()).toString("base64");
    await fs.writeFile(file("credentials.json"), JSON.stringify(secrets), {
      mode: 0o600,
    });
    for (const p of state.projects)
      if (p.repo && repository(p.repo).host === host) {
        p.tokenExpiresAt = "";
        p.access = "disconnected";
        p.repoAttemptAt = null;
      }
    await persist();
    return true;
  });
  handle("disconnect", async (host) => {
    if (busy || securityBusy)
      throw new Error("Monitoring is running. Try again shortly.");
    delete secrets[host];
    await fs.writeFile(file("credentials.json"), JSON.stringify(secrets), {
      mode: 0o600,
    });
    for (const p of state.projects)
      if (p.repo && repository(p.repo).host === host) p.access = "disconnected";
    await persist();
    return state;
  });
  handle("exportData", async () => {
    const result = await dialog.showSaveDialog(win, {
      defaultPath: "atlas-projects.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!result.canceled)
      await fs.writeFile(
        result.filePath,
        JSON.stringify({ version: 1, projects: state.projects }, null, 2),
      );
    return !result.canceled;
  });
  handle("importData", async () => {
    if (busy || securityBusy)
      throw new Error("Monitoring is running. Try again shortly.");
    const result = await dialog.showOpenDialog(win, {
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (result.canceled) return state;
    if (busy || securityBusy)
      throw new Error("Monitoring is running. Try again shortly.");
    const stat = await fs.stat(result.filePaths[0]);
    if (stat.size > 10000000)
      throw new Error("Import must be smaller than 10 MB.");
    const incoming = importData(
      JSON.parse(await fs.readFile(result.filePaths[0], "utf8")),
    );
    if (busy || securityBusy)
      throw new Error("Monitoring is running. Try again shortly.");
    for (const p of incoming) {
      if (state.projects.some((old) => old.id === p.id))
        p.id = crypto.randomUUID();
      state.projects.push(p);
    }
    await persist();
    return state;
  });
  handle("openExternal", (value) => shell.openExternal(webUrl(value)));
  createWindow();
  tray = new Tray(
    nativeImage.createFromPath(path.join(__dirname, "assets/tray.png")),
  );
  tray.setToolTip("Project Atlas · monitoring projects");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Project Atlas", click: () => win.show() },
      { label: "Refresh now", click: () => poll(true).catch(console.error) },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("double-click", () => win.show());
  setInterval(() => poll().catch(console.error), 60000);
  setInterval(() => securityJob().catch(console.error), 60000);
  securityJob().catch(console.error);
  poll().catch(console.error);
  if (app.isPackaged) {
    setTimeout(() => updates.check().catch(console.error), 10000);
    const updateTimer = setInterval(
      () => updates.check().catch(console.error),
      3600000,
    );
    updateTimer.unref();
  }
});
app.on("before-quit", () => {
  quitting = true;
});
app.on("window-all-closed", () => {});
app.on("activate", () => win?.show());
