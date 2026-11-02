const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  checkDesktop,
  checkDevelopment,
  storageProbe,
} = require("../electron/requirements.cjs");
const context = {
  directory: "/test",
  versions: { electron: "45.2.1", node: "24.0.0" },
  platform: "linux",
  safeStorage: {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => "gnome_libsecret",
  },
  notifications: { isSupported: () => true },
  run: async () => ({ ok: true, version: "git version 2.0" }),
  probe: async () => {},
};
test("Git is optional and missing Git does not create a required failure", async () => {
  const report = await checkDesktop({
    ...context,
    run: async () => ({ ok: false, version: "" }),
  });
  const git = report.checks.find((c) => c.id === "git");
  assert.equal(git.status, "missing");
  assert.equal(git.required, false);
  assert.match(git.detail, /do not require Git/);
  assert.equal(
    report.checks.some((c) => c.required && c.status === "missing"),
    false,
  );
});
test("readiness detects insecure Linux keyring and missing notification support without blocking website-only use", async () => {
  const report = await checkDesktop({
    ...context,
    safeStorage: {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => "basic_text",
    },
    notifications: { isSupported: () => false },
  });
  assert.equal(report.checks.find((c) => c.id === "keyring").status, "missing");
  assert.equal(report.checks.find((c) => c.id === "keyring").required, false);
  assert.equal(
    report.checks.find((c) => c.id === "notifications").status,
    "missing",
  );
});
test("storage failure has a fix and refresh discovers that it was repaired", async () => {
  let broken = true;
  const ctx = {
    ...context,
    probe: async () => {
      if (broken) throw new Error("EACCES");
    },
  };
  let report = await checkDesktop(ctx);
  assert.equal(report.checks.find((c) => c.id === "storage").status, "missing");
  assert.match(
    report.checks.find((c) => c.id === "storage").remedy,
    /check again/,
  );
  broken = false;
  report = await checkDesktop(ctx);
  assert.equal(report.checks.find((c) => c.id === "storage").status, "ready");
});
test("workspace load errors are actionable and bundled runtime needs no external npm", async () => {
  const report = await checkDesktop({
    ...context,
    workspaceError: "Saved workspace could not be loaded.",
  });
  assert.equal(report.checks.find((c) => c.id === "workspace").required, true);
  assert.ok(!report.checks.some((c) => c.id === "npm"));
});
test("storage write/read probe cleans up its temporary files", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-storage-"));
  try {
    await storageProbe(directory);
    assert.deepEqual(await fs.readdir(directory), []);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test("checkout check lists missing packages, runtime, and renderer with remedies", async () => {
  const report = await checkDevelopment({
    root: path.join(__dirname, ".."),
    versions: { node: "22.0.0" },
    accessible: async () => false,
    run: async () => ({ ok: false, version: "" }),
  });
  assert.equal(report.checks.find((c) => c.id === "node").status, "missing");
  assert.match(
    report.checks.find((c) => c.id === "packages").remedy,
    /npm install/,
  );
  assert.equal(
    report.checks.find((c) => c.id === "electron").status,
    "missing",
  );
  assert.equal(
    report.checks.find((c) => c.id === "renderer").status,
    "missing",
  );
  assert.ok(!report.checks.some((c) => c.id === "npm"));
});
test("development checks npm but do not require a production renderer", async () => {
  const report = await checkDevelopment({
    root: path.join(__dirname, ".."),
    dev: true,
    versions: { node: "24.0.0" },
    accessible: async () => true,
    run: async (command) => ({
      ok: command === "git",
      version: "git version 2.0",
    }),
  });
  assert.equal(report.checks.find((c) => c.id === "npm").status, "missing");
  assert.ok(!report.checks.some((c) => c.id === "renderer"));
});
