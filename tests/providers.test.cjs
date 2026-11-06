const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseRepository, accountScope } = require("../electron/repository.cjs");
const { migrateAccounts, createAccounts } = require("../electron/accounts.cjs");
const {
  requestRepository,
  providerGet,
  verifyAccount,
} = require("../electron/providers.cjs");
const { scanRepository } = require("../electron/technologies.cjs");
const { refreshInventory } = require("../electron/inventory.cjs");
const { checkRepository } = require("../electron/monitor.cjs");
const response = (data, status = 200) =>
  new Response(JSON.stringify(data), { status });
const gh = parseRepository("https://github.com/team/app");
const azure = parseRepository(
  "https://dev.azure.com/acme/My%20Project/_git/app",
);
const bb = parseRepository("https://bitbucket.org/team/app");
const sha = "a".repeat(40);
const record = (id, repo = gh) => ({
  id,
  provider: repo.provider,
  scope: repo.scope,
  host: repo.host,
  label: id,
  encrypted: id,
});

test("provider URLs normalize Azure aliases and reject credential, path and scope confusion", () => {
  assert.equal(
    azure.api,
    "https://dev.azure.com/acme/My%20Project/_apis/git/repositories/app",
  );
  assert.deepEqual(
    parseRepository("https://acme.visualstudio.com/My%20Project/_git/app"),
    azure,
  );
  assert.equal(bb.api, "https://api.bitbucket.org/2.0");
  assert.equal(
    parseRepository("https://enterprise.example/team/app.git").provider,
    "github",
  );
  for (const url of [
    "http://github.com/a/b",
    "https://token@bitbucket.org/a/b",
    "https://dev.azure.com/a/b/_git/c?token=x",
    "https://dev.azure.com/a/b/_git/c%2Fd",
    "https://dev.azure.com:8443/a/b/_git/c",
  ])
    assert.throws(() => parseRepository(url));
  assert.throws(() => accountScope("github", "bitbucket.org"));
  assert.throws(() => accountScope("azure", "https://evil.test/acme"));
  assert.throws(() =>
    accountScope("bitbucket", "https://email:password@bitbucket.org"),
  );
});

test("old host credentials migrate without decrypting or losing the Enterprise account", () => {
  const records = migrateAccounts({
    "github.com": "encrypted-one",
    "enterprise.example": "encrypted-two",
  });
  assert.equal(records.length, 2);
  assert.equal(records[0].encrypted, "encrypted-one");
  assert.equal(records[1].scope, "https://enterprise.example");
  assert.deepEqual(migrateAccounts({ version: 2, accounts: records }), records);
});

test("automatic account fallback remembers working access, reselects after revocation and isolates providers and organizations", async () => {
  let records = [
    record("personal"),
    record("work"),
    record(
      "enterprise",
      parseRepository("https://enterprise.example/team/app"),
    ),
    record("azure", azure),
    record(
      "other-org",
      parseRepository("https://dev.azure.com/other/p/_git/r"),
    ),
    record("bitbucket", bb),
  ];
  let working = "work";
  const tried = [];
  const accounts = createAccounts({
    records: () => records,
    decrypt: (x) => x,
    request: async (_repo, _route, { credential, project }) => {
      tried.push(credential);
      if (credential !== working) {
        project.usesSaml = true;
        throw Object.assign(new Error("No access"), { status: 403 });
      }
      project.tokenExpiresAt = "2027-01-01";
      return { ok: true };
    },
  });
  const project = {};
  await accounts.request(gh, "/repos/team/app", project);
  assert.deepEqual(tried, ["personal", "work"]);
  assert.equal(project.repositoryAccount, "work");
  assert.equal(project.usesSaml, undefined);
  tried.length = 0;
  await accounts.request(gh, "/repos/team/app", project);
  assert.deepEqual(tried, ["work"]);
  working = "personal";
  tried.length = 0;
  await accounts.request(gh, "/repos/team/app", project);
  assert.deepEqual(tried, ["work", "personal"]);
  assert.deepEqual(
    accounts.candidates(azure).map((a) => a.id),
    ["azure"],
  );
  assert.deepEqual(
    accounts.candidates(bb).map((a) => a.id),
    ["bitbucket"],
  );
  records = records.filter((a) => a.id !== "personal");
  assert.deepEqual(
    accounts.candidates(gh).map((a) => a.id),
    ["work"],
  );
  assert.ok(!JSON.stringify(accounts.list()).includes("encrypted"));
});

test("public fallback omits credentials; network failures do not cycle through accounts", async () => {
  const tried = [];
  let networkError = false;
  const accounts = createAccounts({
    records: () => [record("private")],
    decrypt: (x) => x,
    request: async (_repo, _route, { credential }) => {
      tried.push(credential);
      if (networkError) throw new Error("Network unavailable");
      if (credential) throw Object.assign(new Error("Denied"), { status: 401 });
      return {};
    },
  });
  const p = { tokenExpiresAt: "old" };
  await accounts.request(gh, "/repos/team/app", p);
  assert.deepEqual(tried, ["private", ""]);
  assert.equal(p.repositoryAccount, "");
  assert.equal(p.tokenExpiresAt, "");
  networkError = true;
  tried.length = 0;
  await assert.rejects(
    accounts.request(gh, "/repos/team/app"),
    /Network unavailable/,
  );
  assert.deepEqual(tried, ["private"]);
});

test("provider requests never follow redirects, leak tokens in errors or accept foreign API URLs", async () => {
  let calls = 0;
  const opts = {
    credential: "secret",
    fetcher: async (_url, options) => {
      calls++;
      assert.equal(options.redirect, "error");
      return response({}, 403);
    },
  };
  await assert.rejects(
    providerGet(azure, `${azure.api}/items`, opts),
    (e) => e.status === 403 && !e.message.includes("secret"),
  );
  for (const url of [
    "https://evil.test/steal",
    "https://dev.azure.com/other/p/_apis/git/repositories/r/items",
    `${azure.api}evil/items`,
    `${azure.api.replace("https://", "https://user:pass@")} /items`,
  ])
    await assert.rejects(providerGet(azure, url, opts));
  assert.equal(calls, 1);
});

for (const repo of [azure, bb])
  test(`${repo.provider} normalizes pull requests, commits, manifests and lockfiles`, async () => {
    const content = JSON.stringify({ dependencies: { react: "1" } });
    const lock = JSON.stringify({
      lockfileVersion: 3,
      packages: { "node_modules/react": { version: "19.0.0" } },
    });
    const fetcher = async (url, options) => {
      const u = new URL(url);
      assert.equal(options.redirect, "error");
      assert.equal(
        options.headers.Authorization,
        `Basic ${Buffer.from(`${repo.provider === "azure" ? "" : "me@example.com"}:secret`).toString("base64")}`,
      );
      if (repo.provider === "azure") {
        const path = u.pathname.slice(new URL(repo.api).pathname.length);
        if (!path) return response({ defaultBranch: "refs/heads/main" });
        if (path === "/pullrequests")
          return response({
            value: [
              {
                pullRequestId: 7,
                title: "Fix",
                createdBy: { displayName: "Person" },
                creationDate: "2026-11-05T00:00:00Z",
              },
            ],
          });
        if (path === "/commits")
          return response({
            value: [
              {
                commitId: sha,
                author: { name: "Person", date: "2026-11-05T00:00:00Z" },
              },
            ],
          });
        if (path === "/items" && u.searchParams.has("includeContent"))
          return response({ content });
        if (path === "/items")
          return response({
            value: [
              { path: "/package.json", gitObjectType: "blob", objectId: sha },
              {
                path: "/package-lock.json",
                gitObjectType: "blob",
                objectId: "b".repeat(40),
              },
            ],
          });
        if (path.startsWith("/blobs/")) return new Response(lock);
      } else {
        const path = u.pathname.slice(`/2.0/repositories/${repo.path}`.length);
        if (!path)
          return response({
            mainbranch: { name: "main" },
            language: "JavaScript",
          });
        if (path.startsWith("/commit/")) return response({ hash: sha });
        if (path === "/pullrequests")
          return response({
            values: [
              {
                id: 7,
                title: "Fix",
                author: { display_name: "Person" },
                created_on: "2026-11-05T00:00:00Z",
              },
            ],
          });
        if (path === "/commits")
          return response({
            values: [
              {
                hash: sha,
                author: { user: { display_name: "Person" } },
                date: "2026-11-05T00:00:00Z",
              },
            ],
          });
        if (path.endsWith("/package.json")) return new Response(content);
        if (path.endsWith("/package-lock.json")) return new Response(lock);
        if (path.startsWith("/src/"))
          return response({
            values: [
              { type: "commit_file", path: "package.json", size: 40 },
              {
                type: "commit_file",
                path: "package-lock.json",
                size: lock.length,
              },
            ],
          });
      }
      throw new Error(`Unexpected test route ${url}`);
    };
    const request = (r, route, project) =>
      requestRepository(r, route, {
        credential: "secret",
        username: "me@example.com",
        fetcher,
        project,
      });
    const scan = await scanRepository(repo, request);
    assert.ok(scan.technologies.includes("React"));
    const p = {
      repo: repo.web,
      watchRepo: true,
      autoInventory: true,
      events: [],
      prs: [],
    };
    await checkRepository(p, { github: request });
    assert.equal(p.access, "connected");
    assert.equal(p.prs[0].number, 7);
    assert.equal(p.prs[0].author, "Person");
    assert.ok(p.prs[0].url.startsWith(repo.web));
    assert.equal(p.events[0].kind, "repository");
    await refreshInventory(p, { github: request, repository: parseRepository });
    assert.equal(p.detectedInventory[0].name, "react");
    assert.equal(p.detectedInventory[0].version, "19.0.0");
  });

test("provider account verification uses the correct auth and rejects anonymous or invalid identities", async () => {
  const a = await verifyAccount(azure, "secret", "", async (url, options) => {
    assert.ok(url.startsWith(`${azure.scope}/_apis/connectionData`));
    assert.equal(
      options.headers.Authorization,
      `Basic ${Buffer.from(":secret").toString("base64")}`,
    );
    return response({
      authenticatedUser: { id: "person", providerDisplayName: "Person" },
    });
  });
  assert.equal(a.label, "Person");
  await assert.rejects(
    verifyAccount(azure, "secret", "", async () =>
      response({ authenticatedUser: {} }),
    ),
    /authenticated account/,
  );
  const b = await verifyAccount(bb, "secret", "me@example.com", async (url) => {
    assert.equal(url, "https://api.bitbucket.org/2.0/user");
    return response({ uuid: "person", display_name: "Person" });
  });
  assert.equal(b.identity, "person");
  await assert.rejects(verifyAccount(bb, "secret", ""), /email/);
});

test("Bitbucket pagination rejects another host and preserves inventory after a partial list", async () => {
  const project = {
    repo: bb.web,
    autoInventory: true,
    detectedInventory: [{ name: "previous" }],
  };
  const request = (repo, route) =>
    requestRepository(repo, route, {
      fetcher: async (url) => {
        if (url.endsWith(`/repositories/${bb.path}`))
          return response({ mainbranch: { name: "main" } });
        if (url.includes("/commit/")) return response({ hash: sha });
        return response({ values: [], next: "https://evil.test/steal" });
      },
    });
  await refreshInventory(project, {
    github: request,
    repository: parseRepository,
  });
  assert.equal(project.detectedInventory[0].name, "previous");
  assert.match(project.inventoryError, /pagination/);
});

test("Bitbucket pull requests honor the live API page limit and cap the combined list", async () => {
  let pages = 0;
  const result = await requestRepository(bb, `/repos/${bb.path}/pulls`, {
    fetcher: async (url) => {
      const u = new URL(url);
      assert.equal(u.searchParams.get("pagelen"), "50");
      pages++;
      return response({
        values: Array.from({ length: 50 }, (_, i) => ({
          id: i + (pages - 1) * 50,
          title: "PR",
          author: {},
        })),
        next: `https://api.bitbucket.org/2.0/repositories/${bb.path}/pullrequests?pagelen=50&page=${pages + 1}`,
      });
    },
  });
  assert.equal(pages, 2);
  assert.equal(result.length, 100);
});

test("Azure denied metadata does not falsely mark a repository connected", async () => {
  const p = { repo: azure.web, watchRepo: true, events: [], prs: [] };
  await checkRepository(p, {
    github: (repo, route) =>
      requestRepository(repo, route, {
        fetcher: async () => response({}, 403),
      }),
  });
  assert.equal(p.access, "disconnected");
  assert.match(p.repoError, /Azure DevOps returned 403/);
});

test("Bitbucket branch names containing slashes remain a single reference segment", async () => {
  await requestRepository(
    bb,
    `/repos/${bb.path}/contents/package.json?ref=release%2Fmain`,
    {
      fetcher: async (url) => {
        assert.equal(
          url,
          `https://api.bitbucket.org/2.0/repositories/${bb.path}/src/release%2Fmain/package.json`,
        );
        return new Response("{}");
      },
    },
  );
});

test("all-account SSO failures preserve actionable GitHub authorization guidance", async () => {
  const p = {};
  const accounts = createAccounts({
    records: () => [record("sso"), record("no-repository")],
    decrypt: (x) => x,
    request: async (_repo, _route, { credential, project }) => {
      if (credential === "sso") {
        project.usesSaml = true;
        throw Object.assign(new Error("SAML SSO authorization required"), {
          status: 403,
        });
      }
      throw Object.assign(new Error("Not found"), { status: 404 });
    },
  });
  await assert.rejects(accounts.request(gh, "/repos/team/app", p), /SAML SSO/);
  assert.equal(p.usesSaml, true);
});
