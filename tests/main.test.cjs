const { test } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

test("desktop bridge persists notes/inventory, excludes credentials, rejects foreign IPC, and keeps window alive in tray", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-ipc-"));
  const handlers = new Map(),
    appHandlers = new Map(),
    timers = [];
  let startup,
    window,
    tray,
    quit = false;
  const originalLoad = Module._load,
    originalInterval = global.setInterval;
  class FakeWindow {
    constructor(options) {
      this.options = options;
      this.events = new Map();
      this.visible = true;
      this.webContents = {
        mainFrame: {},
        setWindowOpenHandler: (fn) => {
          this.popup = fn;
        },
        on: (name, fn) => this.events.set(name, fn),
      };
      window = this;
    }
    on(name, fn) {
      this.events.set(name, fn);
    }
    setMenu(menu) {
      this.menu = menu;
    }
    loadFile(file) {
      this.loaded = file;
    }
    show() {
      this.visible = true;
    }
    hide() {
      this.visible = false;
    }
    focus() {}
  }
  class FakeTray {
    constructor(image) {
      this.image = image;
      tray = this;
    }
    setToolTip() {}
    setContextMenu(menu) {
      this.menu = menu;
    }
    on() {}
  }
  const electron = {
    app: {
      getPath: () => directory,
      requestSingleInstanceLock: () => true,
      on: (name, fn) => appHandlers.set(name, fn),
      whenReady: () => ({
        then: (fn) => {
          startup = Promise.resolve().then(fn);
          return startup;
        },
      }),
      quit: () => {
        quit = true;
      },
    },
    BrowserWindow: FakeWindow,
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    dialog: {
      showErrorBox: (title, message) => {
        throw new Error(title + message);
      },
      showSaveDialog: async () => ({
        canceled: false,
        filePath: path.join(directory, "export.json"),
      }),
      showOpenDialog: async () => ({
        canceled: false,
        filePaths: [path.join(directory, "export.json")],
      }),
    },
    safeStorage: {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => "gnome_libsecret",
      encryptString: (value) =>
        Buffer.from("encrypted:" + Buffer.from(value).toString("base64")),
      decryptString: (buffer) =>
        Buffer.from(
          buffer.toString().replace("encrypted:", ""),
          "base64",
        ).toString(),
    },
    Tray: FakeTray,
    Menu: { buildFromTemplate: (value) => value },
    nativeImage: { createFromPath: (value) => value },
    Notification: { isSupported: () => false },
    shell: { openExternal: async () => {} },
  };
  const inventoryRefreshes = [];
  const feedCredentials = [];
  Module._load = function (request, ...args) {
    if (
      request === "./github.cjs" &&
      args[0]?.filename === path.resolve(__dirname, "../electron/main.cjs")
    )
      return {
        requestGithub: async (_repo, _route, options) => {
          if (options.credential === "invalid-token")
            throw new Error("GitHub token is invalid");
          return { login: "test-account" };
        },
      };
    if (
      request === "./security.cjs" &&
      args[0]?.filename === path.resolve(__dirname, "../electron/main.cjs")
    ) {
      return {
        ...originalLoad.call(this, request, ...args),
        syncGhsa: async (cache, options) => {
          feedCredentials.push(options?.credential);
          cache.ghsa = { status: "ready" };
        },
        syncNvd: async (cache, options) => {
          assert.equal(options, undefined);
          cache.nvd = { status: "ready" };
        },
      };
    }
    if (
      request === "./inventory.cjs" &&
      args[0]?.filename === path.resolve(__dirname, "../electron/main.cjs")
    ) {
      return {
        ...originalLoad.call(this, request, ...args),
        refreshInventory: async (p) => {
          inventoryRefreshes.push(p.id);
          p.detectedInventory = [
            { ecosystem: "npm", name: "minimatch", version: "11.0.1" },
          ];
        },
      };
    }
    return request === "electron"
      ? electron
      : originalLoad.call(this, request, ...args);
  };
  global.setInterval = (fn, ms) => {
    timers.push({ fn, ms });
    return timers.length;
  };
  try {
    require("../electron/main.cjs");
    await startup;
    // Allow the initial empty-workspace atomic write to finish.
    await new Promise((resolve) => setTimeout(resolve, 30));
    const invoke = (name, ...args) =>
      handlers.get(`atlas:${name}`)(
        {
          sender: window.webContents,
          senderFrame: window.webContents.mainFrame,
        },
        ...args,
      );
    if (process.platform === "win32") assert.equal(window.menu, null);
    assert.equal(window.options.webPreferences.contextIsolation, true);
    assert.equal(window.options.webPreferences.sandbox, true);
    assert.equal(window.options.webPreferences.nodeIntegration, false);
    assert.equal(window.popup().action, "deny");
    assert.throws(
      () => handlers.get("atlas:state")({ sender: {}, senderFrame: {} }),
      /Invalid IPC sender/,
    );
    let state = await invoke("saveProject", {
      name: "Remembered project",
      url: "https://example.com",
      watchSite: false,
      notes: "Built the consultant dashboard",
      inventoryText: "nuget | Sample.Package | 1.0.0",
    });
    assert.equal(state.projects[0].inventory[0].ecosystem, "nuget");
    await invoke("connect", "github.com", "super-secret-token");
    const credentials = await fs.readFile(
      path.join(directory, "credentials.json"),
      "utf8",
    );
    assert.ok(!credentials.includes("super-secret-token"));
    await assert.rejects(
      invoke("connect", "github.com", "invalid-token"),
      /token is invalid/,
    );
    assert.equal(
      await fs.readFile(path.join(directory, "credentials.json"), "utf8"),
      credentials,
    );
    await invoke("exportData");
    const exported = await fs.readFile(
      path.join(directory, "export.json"),
      "utf8",
    );
    assert.ok(!exported.includes("super-secret-token"));
    assert.ok(!exported.includes("encrypted:"));
    assert.match(exported, /Built the consultant dashboard/);
    state = await invoke("importData");
    assert.equal(state.projects.length, 2);
    assert.notEqual(state.projects[0].id, state.projects[1].id);
    assert.equal(state.projects[1].notes, "Built the consultant dashboard");
    for (const p of state.projects) {
      p.repo = "https://github.com/acme/app";
      p.watchRepo = false;
      p.watchSite = false;
      p.watchSecurity = true;
      p.autoInventory = true;
      p.security = {
        findings: [{ id: "obsolete-finding" }],
        initialized: true,
      };
    }
    state = await invoke("refreshProject", state.projects[0].id);
    assert.deepEqual(inventoryRefreshes, [state.projects[0].id]);
    assert.deepEqual(feedCredentials, ["super-secret-token"]);
    assert.deepEqual(state.projects[0].security.findings, []);
    assert.equal(state.projects[1].security.findings[0].id, "obsolete-finding");
    for (const p of state.projects) p.watchSecurity = false;
    let prevented = false;
    window.events.get("close")({
      preventDefault: () => {
        prevented = true;
      },
    });
    assert.equal(prevented, true);
    assert.equal(window.visible, false);
    assert.equal(quit, false);
    assert.equal(timers.length, 2);
    tray.menu.find((item) => item.label === "Open Project Atlas").click();
    assert.equal(window.visible, true);
    await invoke("disconnect", "github.com");
    assert.deepEqual(await invoke("accounts"), []);
    const persisted = JSON.parse(
      await fs.readFile(path.join(directory, "projects.json"), "utf8"),
    );
    assert.equal(persisted.projects[0].notes, "Built the consultant dashboard");
    const diagnostic = await invoke("systemCheck");
    assert.equal(
      diagnostic.checks.find((c) => c.id === "storage").status,
      "ready",
    );
    assert.equal(
      diagnostic.checks.find((c) => c.id === "keyring").status,
      "ready",
    );
    await fs.writeFile(path.join(directory, "projects.json"), "{broken");
    delete require.cache[require.resolve("../electron/main.cjs")];
    require("../electron/main.cjs");
    await startup;
    const brokenReport = await invoke("systemCheck");
    assert.equal(
      brokenReport.checks.find((c) => c.id === "workspace").status,
      "missing",
    );
    await assert.rejects(
      async () =>
        invoke("saveProject", {
          name: "Do not overwrite",
          url: "https://example.com",
        }),
      /startup issue/,
    );
    assert.equal(
      await fs.readFile(path.join(directory, "projects.json"), "utf8"),
      "{broken",
    );
    await fs.writeFile(
      path.join(directory, "projects.json"),
      JSON.stringify(persisted),
    );
    const repaired = await invoke("systemCheck");
    assert.ok(!repaired.checks.some((c) => c.id === "workspace"));
    assert.equal(
      (await invoke("state")).projects[0].notes,
      "Built the consultant dashboard",
    );
    tray.menu.find((item) => item.label === "Quit").click();
    assert.equal(quit, true);
  } finally {
    Module._load = originalLoad;
    global.setInterval = originalInterval;
    await fs.rm(directory, { recursive: true, force: true });
  }
});
