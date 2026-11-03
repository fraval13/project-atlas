const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
function nativeCommand(kind, file) {
  if (!path.isAbsolute(file))
    throw new Error("The downloaded installer path is invalid.");
  const commands = {
    deb: ["/usr/bin/apt-get", "install", "-y", file],
    rpm: ["/usr/bin/dnf", "install", "-y", file],
    pacman: ["/usr/bin/pacman", "-U", "--noconfirm", file],
  };
  if (!commands[kind]) throw new Error("Unsupported native package format.");
  return commands[kind];
}
function loadUpdater() {
  const sdk = require("electron-updater");
  if (process.platform !== "linux") return sdk.autoUpdater;
  if (process.env.APPIMAGE) return new sdk.AppImageUpdater();
  const marker = path.join(process.resourcesPath, "package-type");
  const kind = fs.existsSync(marker)
    ? fs.readFileSync(marker, "utf8").trim()
    : "";
  const Base =
    sdk[
      { deb: "DebUpdater", rpm: "RpmUpdater", pacman: "PacmanUpdater" }[kind]
    ];
  if (!Base) return sdk.autoUpdater;
  return new (class extends Base {
    doDownloadUpdate(options) {
      if (kind !== "pacman") return super.doDownloadUpdate(options);
      const provider = options.updateInfoAndProvider.provider;
      const file = provider
        .resolveFiles(options.updateInfoAndProvider.info)
        .find((f) => f.url.pathname.endsWith(".pkg.tar.zst"));
      if (!file)
        throw new Error("No Arch package is available for this update.");
      return this.executeDownload({
        fileExtension: "pkg.tar.zst",
        fileInfo: file,
        downloadUpdateOptions: options,
        task: async (target, downloadOptions) => {
          downloadOptions.onProgress = (progress) =>
            this.emit("download-progress", progress);
          await this.httpExecutor.download(file.url, target, downloadOptions);
        },
      });
    }
    doInstall(options) {
      try {
        const file = this.downloadedUpdateHelper?.file;
        if (!file) throw new Error("Download the update before installing it.");
        if (!fs.existsSync("/usr/bin/pkexec"))
          throw new Error(
            "Install pkexec/Polkit to authorize package updates, or install the package with your system package manager.",
          );
        const result = spawnSync("/usr/bin/pkexec", nativeCommand(kind, file), {
          shell: false,
          encoding: "utf8",
          timeout: 600000,
          env: { ...process.env, PATH: "/usr/sbin:/usr/bin:/sbin:/bin" },
        });
        if (result.error || result.status !== 0)
          throw new Error(
            "The system package update was cancelled or failed. Atlas remains open. You can retry or install through your package manager.",
          );
        if (options.isForceRunAfter) this.app.relaunch();
        return true;
      } catch (error) {
        this.dispatchError(error);
        return false;
      }
    }
  })();
}
function updateFailure(error, operation) {
  if (operation === "check") {
    const text = String(error?.code || "") + " " + String(error?.message || "");
    const missing =
      /ERR_UPDATER_NO_PUBLISHED_VERSIONS|ERR_UPDATER_CHANNEL_FILE_NOT_FOUND|No published versions/.test(
        text,
      );
    return {
      phase: "unavailable",
      error: missing
        ? "No main-channel update has been published yet. You can check again later."
        : /\b(?:401|403|404)\b/.test(text)
          ? "The Atlas release feed is unavailable. It may be private or not published yet. Try again later."
          : "Could not check for updates. Check your connection and try again.",
    };
  }
  const allowed = new Set([
    "Monitoring is running. Try restarting in a moment.",
    "Install pkexec/Polkit to authorize package updates, or install the package with your system package manager.",
    "The system package update was cancelled or failed. Atlas remains open. You can retry or install through your package manager.",
  ]);
  return {
    phase: "error",
    error: allowed.has(error?.message)
      ? error.message
      : operation === "download"
        ? "Could not download or verify the update. Check your connection and retry."
        : "Could not install the update. Retry or install the latest package from GitHub Releases.",
  };
}
function createUpdates({
  isPackaged,
  version,
  makeUpdater = loadUpdater,
  beforeInstall = async () => {},
}) {
  let state = {
      phase: isPackaged ? "idle" : "unsupported",
      currentVersion: version,
      availableVersion: "",
      percent: 0,
      downloaded: false,
      error: "",
      channel: "main",
    },
    updater,
    checking,
    downloading,
    installing,
    operation = "check";
  const set = (patch) => {
    state = { ...state, ...patch };
  };
  function engine() {
    if (updater) return updater;
    updater = makeUpdater();
    updater.channel = "main";
    updater.allowPrerelease = true;
    updater.allowDowngrade = false;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.on("checking-for-update", () =>
      set({ phase: "checking", error: "" }),
    );
    updater.on("update-available", (info) =>
      set({
        phase: "available",
        availableVersion: info.version,
        error: "",
        percent: 0,
        downloaded: false,
      }),
    );
    updater.on("update-not-available", () =>
      set({ phase: "current", error: "", availableVersion: "" }),
    );
    updater.on("download-progress", (p) =>
      set({
        phase: "downloading",
        percent: Math.max(0, Math.min(100, Number(p.percent) || 0)),
      }),
    );
    updater.on("update-downloaded", (info) =>
      set({
        phase: "downloaded",
        availableVersion: info.version,
        percent: 100,
        downloaded: true,
        error: "",
      }),
    );
    updater.on("error", (error) => set(updateFailure(error, operation)));
    return updater;
  }
  const enabled = () => {
    if (!isPackaged)
      throw new Error("Install an Atlas package to use automatic updates.");
  };
  return {
    state: () => ({ ...state }),
    check: async () => {
      if (!isPackaged) return { ...state };
      if (checking) return checking;
      if (downloading || installing || state.downloaded) return { ...state };
      checking = (async () => {
        await Promise.resolve();
        try {
          operation = "check";
          set({ phase: "checking", error: "" });
          await engine().checkForUpdates();
        } catch (error) {
          set(updateFailure(error, "check"));
        } finally {
          checking = null;
        }
        return { ...state };
      })();
      return checking;
    },
    download: async () => {
      enabled();
      if (downloading) return downloading;
      if (checking || installing)
        throw new Error("An update operation is already running.");
      if (!state.availableVersion)
        throw new Error("Check for an available update first.");
      if (state.downloaded) return { ...state };
      downloading = (async () => {
        await Promise.resolve();
        try {
          operation = "download";
          set({ phase: "downloading", error: "", percent: 0 });
          await engine().downloadUpdate();
        } catch (error) {
          set(updateFailure(error, "download"));
        } finally {
          downloading = null;
        }
        return { ...state };
      })();
      return downloading;
    },
    install: async () => {
      enabled();
      if (installing)
        throw new Error("Update installation is already running.");
      if (!state.downloaded) throw new Error("Download the update first.");
      installing = true;
      try {
        operation = "install";
        set({ phase: "installing", error: "" });
        await beforeInstall();
        engine().quitAndInstall(false, true);
      } catch (error) {
        set(updateFailure(error, "install"));
      } finally {
        installing = false;
      }
      return { ...state };
    },
  };
}
module.exports = { createUpdates, nativeCommand, updateFailure };
