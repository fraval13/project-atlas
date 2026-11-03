const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const path = require("node:path");
const { createUpdates, nativeCommand } = require("../electron/updates.cjs");
const { mainVersion } = require("../scripts/prepare-version.cjs");
class FakeUpdater extends EventEmitter {
  async checkForUpdates() {
    this.emit("checking-for-update");
    this.emit("update-available", { version: "0.1.1-main.42" });
  }
  async downloadUpdate() {
    this.emit("download-progress", { percent: 54.5 });
    this.emit("update-downloaded", { version: "0.1.1-main.42" });
  }
  quitAndInstall(silent, relaunch) {
    this.install = { silent, relaunch };
  }
}
test("source checkouts never load or run the installed updater", async () => {
  const controller = createUpdates({
    isPackaged: false,
    version: "0.1.0",
    makeUpdater: () => assert.fail("No updater for source"),
  });
  assert.equal((await controller.check()).phase, "unsupported");
  await assert.rejects(() => controller.download(), /Install an Atlas package/);
});
test("update lifecycle requires explicit download and restart and persists before install", async () => {
  const updater = new FakeUpdater();
  let persisted = false;
  const c = createUpdates({
    isPackaged: true,
    version: "0.1.0",
    makeUpdater: () => updater,
    beforeInstall: async () => {
      persisted = true;
    },
  });
  assert.equal((await c.check()).phase, "available");
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.channel, "main");
  assert.equal(updater.allowDowngrade, false);
  assert.equal(updater.install, undefined);
  await assert.rejects(() => c.install(), /Download the update/);
  assert.equal((await c.download()).phase, "downloaded");
  assert.equal(updater.install, undefined);
  await c.install();
  assert.equal(persisted, true);
  assert.deepEqual(updater.install, { silent: false, relaunch: true });
});
test("failed downloads retain a retryable banner and can recover", async () => {
  const updater = new FakeUpdater();
  let failing = true;
  updater.downloadUpdate = async () => {
    if (failing) throw new Error("Network unavailable");
    updater.emit("update-downloaded", { version: "0.1.1-main.42" });
  };
  const c = createUpdates({
    isPackaged: true,
    version: "0.1.0",
    makeUpdater: () => updater,
  });
  await c.check();
  assert.equal((await c.download()).phase, "error");
  assert.equal(c.state().availableVersion, "0.1.1-main.42");
  failing = false;
  assert.equal((await c.download()).phase, "downloaded");
});
test("failed persistence or cancelled native install keeps the update retryable", async () => {
  const updater = new FakeUpdater();
  const c = createUpdates({
    isPackaged: true,
    version: "0.1.0",
    makeUpdater: () => updater,
    beforeInstall: async () => {
      throw new Error("Storage unavailable");
    },
  });
  await c.check();
  await c.download();
  assert.equal((await c.install()).phase, "error");
  assert.equal(c.state().downloaded, true);
  assert.equal(updater.install, undefined);
});
test("native install commands preserve package policy and avoid Arch partial upgrades", () => {
  const file = path.resolve("test path/package.pkg.tar.zst");
  assert.deepEqual(nativeCommand("pacman", file), [
    "/usr/bin/pacman",
    "-U",
    "--noconfirm",
    file,
  ]);
  assert.ok(!nativeCommand("rpm", file).includes("--nogpgcheck"));
  assert.ok(!nativeCommand("deb", file).includes("--allow-unauthenticated"));
  assert.throws(() => nativeCommand("pacman", "relative-path"));
});
test("main build versions increase monotonically and sort after the base release", () => {
  const semver = require("semver");
  assert.equal(mainVersion("0.1.0", 42), "0.1.1-main.42");
  assert.ok(semver.gt(mainVersion("0.1.0", 43), mainVersion("0.1.0", 42)));
  assert.ok(semver.gt(mainVersion("0.1.0", 42), "0.1.0"));
  assert.throws(() => mainVersion("0.1.0", "bad"));
});

test("a synchronous updater initialization failure can be retried", async () => {
  let attempts = 0;
  const c = createUpdates({
    isPackaged: true,
    version: "0.1.0",
    makeUpdater: () => {
      if (++attempts === 1)
        throw new Error("Unavailable updater configuration");
      return new FakeUpdater();
    },
  });
  assert.equal((await c.check()).phase, "unavailable");
  assert.equal((await c.check()).phase, "available");
  assert.equal(attempts, 2);
});

test("update failures never expose HTTP headers or cookies", () => {
  const { updateFailure } = require("../electron/updates.cjs");
  for (const operation of ["check", "download", "install"]) {
    const result = updateFailure(
      new Error(
        '404 GET https://github.com/private/releases.atom Headers: {"set-cookie":"secret-cookie"}',
      ),
      operation,
    );
    assert.doesNotMatch(result.error, /secret-cookie|Headers|releases.atom/);
    assert.equal(result.phase, operation === "check" ? "unavailable" : "error");
  }
});
