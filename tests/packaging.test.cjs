const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const config = require("../electron-builder.cjs");
const { configureStorage } = require("../electron/identity.cjs");
const afterPack = require("../scripts/after-pack.cjs");
test("installer targets cover Windows, Mac, Debian, Fedora, Arch and AppImage", () => {
  assert.equal(config.win.target, "nsis");
  assert.deepEqual(config.mac.target, ["dmg", "zip"]);
  for (const target of ["deb", "rpm", "pacman", "AppImage"])
    assert.ok(config.linux.target.includes(target));
  assert.equal(config.pacman.compression, "zstd");
  assert.equal(config.nsis.deleteAppDataOnUninstall, false);
  assert.equal(config.publish.channel, "main");
  assert.equal(config.publish.provider, "github");
});
test("packaged app retains the existing workspace directory without requiring source tools", () => {
  let chosen;
  configureStorage({
    isPackaged: true,
    getPath: (name) => {
      assert.equal(name, "appData");
      return "/config";
    },
    setPath: (name, value) => {
      assert.equal(name, "userData");
      chosen = value;
    },
  });
  assert.equal(chosen, path.join("/config", "project-atlas"));
  configureStorage({
    isPackaged: false,
    setPath: () => assert.fail("Source workspace must not move"),
  });
});
test("Linux packaging replaces the auto-disabling AppImage launcher with the sandboxed launcher", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-package-"));
  try {
    await afterPack({
      electronPlatformName: "linux",
      appOutDir: directory,
      packager: { projectDir: path.join(__dirname, "..") },
    });
    const source = await fs.readFile(path.join(directory, "AppRun"), "utf8");
    assert.ok(source.includes("--disable-setuid-sandbox"));
    assert.ok(!source.includes("--no-sandbox"));
    if (process.platform !== "win32") {
      await promisify(execFile)("sh", ["-n", path.join(directory, "AppRun")]);
      assert.ok((await fs.stat(path.join(directory, "AppRun"))).mode & 0o111);
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test("package contents are explicitly limited to application code and assets", () => {
  assert.deepEqual(config.files, [
    "dist/**/*",
    "electron/**/*",
    "package.json",
  ]);
  assert.equal(config.asar, true);
});

test("template file lists and temporary cleanup work with patched minimatch", async () => {
  const { createRequire } = require("node:module");
  const fromSquirrel = createRequire(
    require.resolve("electron-builder-squirrel-windows/package.json"),
  );
  const fromInstaller = createRequire(
    fromSquirrel.resolve("electron-winstaller/package.json"),
  );
  const temp = fromInstaller("temp");
  const root = temp.mkdirSync("atlas-legacy-glob-");
  try {
    await fs.writeFile(path.join(root, "one.txt"), "test");
    const fromEjs = createRequire(require.resolve("ejs/package.json"));
    const fromJake = createRequire(fromEjs.resolve("jake/package.json"));
    const { FileList } = fromJake("filelist");
    const files = new FileList();
    files.include(path.join(root, "*.txt"));
    assert.equal(files.toArray().length, 1);
    const fromTemp = createRequire(fromInstaller.resolve("temp/package.json"));
    await new Promise((resolve, reject) =>
      fromTemp("rimraf")(root, {}, (error) =>
        error ? reject(error) : resolve(),
      ),
    );
    await assert.rejects(fs.access(root));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
