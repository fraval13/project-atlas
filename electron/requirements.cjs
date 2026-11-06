const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
function commandVersion(command) {
  return new Promise((resolve) =>
    execFile(
      command === "npm.cmd" ? process.execPath : command,
      command === "npm.cmd"
        ? [
            process.env.npm_execpath ||
              path.join(
                path.dirname(process.execPath),
                "node_modules/npm/bin/npm-cli.js",
              ),
            "--version",
          ]
        : ["--version"],
      { timeout: 4000, maxBuffer: 8192, windowsHide: true },
      (error, stdout) =>
        resolve({
          ok: !error,
          version: error ? "" : stdout.trim().split("\n")[0],
        }),
    ),
  );
}
async function storageProbe(directory) {
  let temporary;
  try {
    temporary = await fs.mkdtemp(path.join(directory, ".atlas-check-"));
    const target = path.join(temporary, "probe");
    await fs.writeFile(target, "atlas");
    if ((await fs.readFile(target, "utf8")) !== "atlas")
      throw new Error("Read verification failed");
  } finally {
    if (temporary) await fs.rm(temporary, { recursive: true, force: true });
  }
}
async function checkDesktop({
  directory,
  safeStorage,
  notifications,
  workspaceError = "",
  githubAccounts = [],
  versions = process.versions,
  platform = process.platform,
  run = commandVersion,
  probe = storageProbe,
}) {
  const checks = [];
  checks.push({
    id: "runtime",
    name: "Bundled application runtime",
    status:
      versions.electron && Number(versions.node?.split(".")[0]) >= 24
        ? "ready"
        : "missing",
    required: true,
    detail: `Electron ${versions.electron || "unavailable"} · Node ${versions.node || "unavailable"}`,
    remedy:
      "Reinstall the supported Atlas application. A packaged desktop app includes its runtime.",
  });
  try {
    await probe(directory);
    checks.push({
      id: "storage",
      name: "Local workspace storage",
      status: "ready",
      required: true,
      detail: "Read/write access verified.",
      remedy: "",
    });
  } catch {
    checks.push({
      id: "storage",
      name: "Local workspace storage",
      status: "missing",
      required: true,
      detail: "Atlas cannot read and write its data directory.",
      remedy: `Restore read/write access and free disk space for ${directory}, then check again.`,
    });
  }
  if (workspaceError)
    checks.push({
      id: "workspace",
      name: "Saved workspace",
      status: "missing",
      required: true,
      detail: workspaceError,
      remedy:
        "Restore access or repair/restore projects.json, then check again. Existing data has not been overwritten.",
    });
  let secure = false;
  try {
    secure =
      safeStorage.isEncryptionAvailable() &&
      !(
        platform === "linux" &&
        safeStorage.getSelectedStorageBackend() === "basic_text"
      );
  } catch {}
  checks.push({
    id: "keyring",
    name: "Secure credential store",
    status: secure ? "ready" : "missing",
    required: false,
    detail: secure
      ? "OS-backed credential encryption is available."
      : "Repository credentials cannot be saved securely. Website monitoring and local CVE matching still work.",
    remedy:
      "Enable and unlock your OS keyring (for example GNOME Keyring or KWallet on Linux). If the backend changed, restart Atlas and check again.",
  });
  let notificationSupport = false;
  try {
    notificationSupport = notifications.isSupported();
  } catch {}
  checks.push({
    id: "notifications",
    name: "Desktop notifications",
    status: notificationSupport ? "ready" : "missing",
    required: false,
    detail: notificationSupport
      ? "Notification API is supported; OS notification preferences still apply."
      : "Desktop notifications are unavailable in this environment. In-app results still work.",
    remedy:
      "Enable desktop notification support and check system permissions. Restart the desktop session if needed, then check again.",
  });
  for (const account of githubAccounts)
    checks.push({
      id: `${account.provider || "github"}:${account.host}`,
      name: `${{ github: "GitHub", azure: "Azure DevOps", bitbucket: "Bitbucket" }[account.provider || "github"]} access · ${account.host}`,
      status: account.available ? "ready" : "missing",
      required: false,
      host: account.host,
      provider: account.provider || "github",
      detail: account.available
        ? "Token stored securely. Repository permissions and SSO are verified when monitoring runs."
        : "No usable token stored. Public repositories can be monitored anonymously; private repositories require access.",
      remedy:
        "Optionally create a read-only personal access token and save it here. Website monitoring does not require a token.",
    });
  const git = await run("git");
  checks.push({
    id: "git",
    name: "Git CLI",
    status: git.ok ? "ready" : "missing",
    required: false,
    detail: git.ok
      ? `${git.version} · optional tool`
      : "Optional: Repository connections use the API and do not require Git.",
    remedy:
      "Install Git and ensure it is on PATH if you want to use local Git tooling, then check again.",
  });
  return { checkedAt: new Date().toISOString(), checks };
}
async function checkDevelopment({
  root,
  dev = false,
  versions = process.versions,
  platform = process.platform,
  run = commandVersion,
  accessible = async (target) => {
    try {
      await fs.access(target);
      return true;
    } catch {
      return false;
    }
  },
}) {
  const checks = [
    {
      id: "node",
      name: "Node.js 24+",
      required: true,
      status: Number(versions.node?.split(".")[0]) >= 24 ? "ready" : "missing",
      detail: versions.node || "Not available",
      remedy: "Install Node.js 24 or newer and reopen the terminal.",
    },
  ];
  if (dev) {
    const npm = await run(platform === "win32" ? "npm.cmd" : "npm");
    checks.push({
      id: "npm",
      name: "npm development tools",
      required: true,
      status: npm.ok ? "ready" : "missing",
      detail: npm.version || "Not found on PATH.",
      remedy: "Install npm with Node.js and reopen the terminal.",
    });
  }
  const manifest = JSON.parse(
    await fs.readFile(path.join(root, "package.json"), "utf8"),
  );
  const names = [
    ...Object.keys(manifest.dependencies || {}),
    ...(dev ? Object.keys(manifest.devDependencies || {}) : ["electron"]),
  ];
  const missing = [];
  for (const name of names)
    if (
      !(await accessible(path.join(root, "node_modules", name, "package.json")))
    )
      missing.push(name);
  checks.push({
    id: "packages",
    name: "Project packages",
    required: true,
    status: missing.length ? "missing" : "ready",
    detail: missing.length
      ? `Missing: ${missing.join(", ")}`
      : "Declared packages are installed.",
    remedy: "Run npm install in the project folder, then check again.",
  });
  const executable = path.join(
    root,
    "node_modules/electron/dist",
    platform === "win32"
      ? "electron.exe"
      : platform === "darwin"
        ? "Electron.app/Contents/MacOS/Electron"
        : "electron",
  );
  checks.push({
    id: "electron",
    name: "Electron runtime binary",
    required: true,
    status: (await accessible(executable)) ? "ready" : "missing",
    detail: executable,
    remedy:
      "Run npx install-electron to download the Electron runtime, then check again.",
  });
  if (!dev)
    checks.push({
      id: "renderer",
      name: "Built application interface",
      required: true,
      status: (await accessible(path.join(root, "dist/index.html")))
        ? "ready"
        : "missing",
      detail: "Production renderer in dist/.",
      remedy: "Run npm run build, then check again.",
    });
  const git = await run("git");
  checks.push({
    id: "git",
    name: "Git CLI (optional)",
    required: false,
    status: git.ok ? "ready" : "missing",
    detail: git.ok
      ? git.version
      : "Not installed. Repository API connections still work.",
    remedy: "Install Git and add it to PATH for local Git tooling.",
  });
  return { checkedAt: new Date().toISOString(), checks, executable };
}
module.exports = {
  commandVersion,
  storageProbe,
  checkDesktop,
  checkDevelopment,
};
