const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  project,
  repository,
  importData,
  webUrl,
} = require("../electron/core.cjs");
const { checkWebsite, checkRepository } = require("../electron/monitor.cjs");
const website = () =>
  project({
    name: "Website only",
    url: "https://example.com",
    technologies: [" React ", ""],
  });
test("website-only projects do not require repository access", () => {
  const p = website();
  assert.equal(p.repo, "");
  assert.equal(p.watchRepo, false);
  assert.equal(p.watchSite, true);
  assert.deepEqual(p.technologies, ["React"]);
});
test("validates GitHub and custom Enterprise URLs", () => {
  assert.equal(
    repository("https://github.com/acme/app.git").api,
    "https://api.github.com",
  );
  assert.equal(
    repository("https://git.acme.test/acme/app").api,
    "https://git.acme.test/api/v3",
  );
  for (const url of [
    "http://github.com/a/b",
    "https://github.com/a/b/issues",
    "javascript:alert(1)",
    "https://secret:token@github.com/a/b",
  ])
    assert.throws(() => repository(url));
  assert.throws(() => webUrl("file:///etc/passwd"));
});
test("validates expiry settings and retains fractional day intervals", () => {
  const p = project({
    ...website(),
    repo: "https://github.com/acme/app",
    usesSaml: true,
    reauthDays: 0.5,
    warningDays: 0,
    authExpiresAt: "2026-12-01T12:00:00Z",
  });
  assert.equal(p.reauthDays, 0.5);
  assert.equal(p.warningDays, 0);
  assert.equal(p.authExpiresAt, "2026-12-01T12:00:00.000Z");
  assert.throws(() => project({ ...p, warningDays: -1 }));
  assert.throws(() => project({ ...p, reauthDays: "oops" }));
  assert.throws(() => project({ ...p, authExpiresAt: "invalid" }));
});
test("import round trips notes, history, PR snapshots and reminders, strips credentials and live actions", () => {
  const p = {
    ...website(),
    notes: "Built the dashboard",
    authExpiresAt: "2026-12-01T00:00:00Z",
    reauthDays: 30,
    warningDays: 3,
    token: "secret",
    access: "connected",
    status: "online",
    events: [
      {
        id: "x",
        text: "Merged a PR",
        kind: "repository",
        at: "2026-10-01T00:00:00Z",
      },
    ],
    prs: [
      {
        id: 1,
        number: 7,
        title: "Old PR",
        author: "alice",
        url: "javascript:alert(1)",
      },
    ],
  };
  const [result] = importData({ version: 1, projects: [p] });
  assert.equal(result.notes, p.notes);
  assert.equal(result.events[0].text, "Merged a PR");
  assert.equal(result.prs[0].title, "Old PR");
  assert.equal(result.prs[0].url, "");
  assert.equal(result.access, "disconnected");
  assert.equal(result.status, "unknown");
  assert.equal(result.warningDays, 3);
  assert.equal(result.token, undefined);
  assert.throws(() => importData({ version: 2, projects: [] }));
  assert.throws(() => importData({ version: 1, projects: [p, p] }));
});
test("website monitoring never sends an authorization header and records initial status quietly", async () => {
  const p = website(),
    notifications = [];
  await checkWebsite(p, {
    fetcher: async (url, options) => {
      assert.equal(url, p.url);
      assert.equal(options.headers, undefined);
      return { ok: true, status: 200 };
    },
    notify: (_, text) => notifications.push(text),
  });
  assert.equal(p.status, "online");
  assert.equal(p.events.length, 1);
  assert.equal(notifications.length, 0);
  await checkWebsite(p, {
    fetcher: async () => ({ ok: false, status: 503 }),
    notify: (_, text) => notifications.push(text),
  });
  assert.equal(p.status, "offline");
  assert.equal(notifications.length, 1);
});
test("network failures and protected websites are unknown, not verified downtime", async () => {
  for (const fetcher of [
    async () => {
      throw new Error("network failure");
    },
    async () => ({ ok: false, status: 403 }),
  ]) {
    const p = website();
    await checkWebsite(p, { fetcher });
    assert.equal(p.status, "unknown");
    assert.ok(p.siteError);
  }
});
test("paused website does not issue requests", async () => {
  const p = { ...website(), watchSite: false };
  await checkWebsite(p, {
    fetcher: () => {
      throw new Error("must not run");
    },
  });
  assert.equal(p.checkedAt, undefined);
});
test("loss of GitHub authorization retains history and PRs without affecting website status", async () => {
  const p = {
    ...website(),
    repo: "https://github.com/acme/app",
    watchRepo: true,
    status: "online",
    prs: [{ id: 1, title: "saved PR" }],
    events: [{ id: "saved", text: "saved event" }],
  };
  await checkRepository(p, {
    github: async () => {
      throw new Error("SAML SSO authorization required");
    },
  });
  assert.equal(p.status, "online");
  assert.equal(p.access, "disconnected");
  assert.equal(p.prs[0].title, "saved PR");
  assert.equal(p.events[0].text, "saved event");
  assert.match(p.repoError, /SAML/);
});
test("initial PR snapshot is quiet, only new PRs notify, activity deduplicates and manifest adds frameworks", async () => {
  const p = {
      ...website(),
      repo: "https://github.com/acme/app",
      watchRepo: true,
    },
    notifications = [];
  let prs = [
    {
      id: 1,
      number: 1,
      title: "First",
      user: { login: "alice" },
      html_url: "https://github.com/acme/app/pull/1",
    },
  ];
  const github = async (_repo, route) =>
    route.includes("/languages")
      ? { TypeScript: 100 }
      : route.includes("/pulls")
        ? prs
        : route.includes("/events")
          ? [
              {
                id: "e1",
                type: "PushEvent",
                actor: { login: "alice" },
                created_at: "2026-10-01T00:00:00Z",
              },
            ]
          : route.includes("/git/trees/")
            ? {
                tree: [
                  {
                    type: "blob",
                    mode: "100644",
                    path: "package.json",
                    size: 100,
                  },
                ],
              }
            : route.endsWith("/acme/app")
              ? { default_branch: "main" }
              : {
                  encoding: "base64",
                  content: Buffer.from(
                    JSON.stringify({ dependencies: { react: "19", pg: "8" } }),
                  ).toString("base64"),
                  size: 100,
                };
  const opts = { github, notify: (_, text) => notifications.push(text) };
  await checkRepository(p, opts);
  assert.equal(notifications.length, 0);
  assert.ok(p.detectedTechnologies.includes("React"));
  assert.ok(p.detectedTechnologies.includes("PostgreSQL"));
  prs = [...prs, { ...prs[0], id: 2, number: 2, title: "Second" }];
  await checkRepository(p, opts);
  assert.equal(notifications.length, 1);
  assert.equal(p.events.length, 1);
  assert.equal(p.prs.length, 2);
});
test("countdown warning boundary, expiry, unknown and earliest deadline", async () => {
  const { expiration } = await import("../src/expiry.ts");
  const now = Date.parse("2026-11-01T00:00:00Z");
  assert.equal(expiration({}, now), null);
  assert.equal(expiration({ authExpiresAt: "bad" }, now), null);
  assert.equal(
    expiration({ authExpiresAt: "2026-11-09T00:00:00Z", warningDays: 7 }, now)
      .warning,
    false,
  );
  assert.equal(
    expiration({ authExpiresAt: "2026-11-08T00:00:00Z", warningDays: 7 }, now)
      .warning,
    true,
  );
  assert.equal(
    expiration({ authExpiresAt: "2026-10-31T00:00:00Z" }, now).expired,
    true,
  );
  const actual = expiration(
    {
      authExpiresAt: "2026-11-15T00:00:00Z",
      tokenExpiresAt: "2026-11-03T12:00:00Z",
    },
    now,
  );
  assert.equal(actual.label, "2d 12h remaining");
  assert.equal(actual.source, "GitHub token expiry");
});

test("SAML reminders are cleared when explicitly disabled", () => {
  const p = project({
    ...website(),
    repo: "https://github.com/acme/app",
    usesSaml: false,
    authExpiresAt: "2026-12-01T00:00:00Z",
    reauthDays: 30,
  });
  assert.equal(p.usesSaml, false);
  assert.equal(p.authExpiresAt, "");
  assert.equal(p.reauthDays, null);
});
test("anonymous repository monitoring is distinct from authenticated access", async () => {
  const p = {
    ...website(),
    repo: "https://github.com/acme/app",
    watchRepo: true,
    status: "offline",
  };
  await checkRepository(p, {
    authenticated: false,
    github: async (_, route) =>
      route.includes("/languages")
        ? { TypeScript: 1 }
        : route.includes("/pulls") || route.includes("/events")
          ? []
          : Promise.reject(new Error("No manifests")),
  });
  assert.equal(p.access, "public");
  assert.equal(p.status, "offline");
  assert.equal(p.repoError, "");
  assert.ok(p.repoCheckedAt);
});
