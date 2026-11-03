const { test } = require("node:test");
const assert = require("node:assert/strict");
const { checkWebsite } = require("../electron/monitor.cjs");
const { project, importData } = require("../electron/core.cjs");
const backend = () => ({
  name: "Backend",
  url: "https://api.example.com/health",
  monitorKind: "health",
  watchSite: true,
  events: [],
  status: "unknown",
});
test("backend health supports common .NET, Spring and JSON health responses", async () => {
  for (const body of [
    "Healthy",
    '{"status":"healthy"}',
    '{"status":"UP"}',
    '{"healthy":true}',
    "OK",
    "",
  ]) {
    const p = backend();
    await checkWebsite(p, {
      fetcher: async (_, options) => {
        assert.equal(options.headers, undefined);
        assert.equal(options.credentials, "omit");
        return new Response(body, { status: 200 });
      },
    });
    assert.equal(p.status, "online");
    assert.equal(p.healthStatus, "healthy");
    assert.match(p.events[0].text, /Backend is healthy/);
  }
});
test("explicit unhealthy and degraded bodies are respected even with HTTP 200", async () => {
  for (const body of [
    "Unhealthy",
    '{"status":"DOWN"}',
    '{"healthy":false}',
    '{"status":"OUT_OF_SERVICE"}',
  ]) {
    const p = backend();
    await checkWebsite(p, { fetcher: async () => new Response(body) });
    assert.equal(p.status, "offline");
    assert.equal(p.healthStatus, "unhealthy");
  }
  const p = backend();
  await checkWebsite(p, { fetcher: async () => new Response("Degraded") });
  assert.equal(p.status, "unknown");
  assert.equal(p.healthStatus, "degraded");
});
test("HTTP failures distinguish server health from access, malformed and unrelated endpoints", async () => {
  for (const status of [401, 403, 404]) {
    const p = backend();
    await checkWebsite(p, {
      fetcher: async () => new Response("", { status }),
    });
    assert.equal(p.status, "unknown");
  }
  const p = backend();
  await checkWebsite(p, {
    fetcher: async () => new Response("", { status: 503 }),
  });
  assert.equal(p.healthStatus, "unhealthy");
  for (const body of [
    "<html>Healthy site</html>",
    '{"status":',
    '{"value":"hello"}',
    "x".repeat(65537),
  ]) {
    const p = backend();
    await checkWebsite(p, { fetcher: async () => new Response(body) });
    assert.equal(p.status, "unknown");
    assert.notEqual(p.healthStatus, "healthy");
    assert.ok(p.siteError);
  }
});
test("health network errors stay unverified and state transitions notify only after first check", async () => {
  const p = backend(),
    messages = [];
  let body = "Healthy";
  const options = {
    fetcher: async () => new Response(body),
    notify: (_, message) => messages.push(message),
  };
  await checkWebsite(p, options);
  assert.equal(messages.length, 0);
  body = "Unhealthy";
  await checkWebsite(p, options);
  assert.equal(messages[0], "Backend is unhealthy");
  await checkWebsite(p, {
    fetcher: async () => {
      throw new Error("network unavailable");
    },
  });
  assert.equal(p.status, "unknown");
  assert.equal(p.healthStatus, "unknown");
});
test("health mode and resume preferences survive validated export/import without enabling paused checks", () => {
  const p = project({
    name: "Health",
    url: "https://api.example.com/health",
    monitorKind: "health",
    watchSite: false,
    watchRepo: false,
    watchSecurity: false,
    watchResume: { watchSite: true, watchRepo: true, watchSecurity: true },
  });
  const [restored] = importData({ version: 1, projects: [p] });
  assert.equal(restored.monitorKind, "health");
  assert.equal(restored.watchSite, false);
  assert.equal(restored.watchResume.watchSite, true);
  assert.equal(restored.watchResume.watchRepo, false);
  assert.equal(restored.watchResume.watchSecurity, true);
});

test("health refreshes only log actual state transitions, including degraded health", async () => {
  const p = backend();
  let body = "Healthy";
  const options = { fetcher: async () => new Response(body) };
  await checkWebsite(p, options);
  await checkWebsite(p, options);
  assert.equal(p.events.length, 1);
  body = "Degraded";
  await checkWebsite(p, options);
  await checkWebsite(p, options);
  assert.equal(p.events.length, 2);
  body = "Healthy";
  await checkWebsite(p, options);
  assert.equal(p.events.length, 3);
});
