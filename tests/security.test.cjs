const { test } = require("node:test");
const assert = require("node:assert/strict");
const { gzipSync } = require("node:zlib");
const { createHash } = require("node:crypto");
const {
  parseInventory,
  importInventory,
  purlComponent,
  refreshInventory,
} = require("../electron/inventory.cjs");
const {
  inRange,
  normalizeGhsa,
  normalizeNvd,
  matchAdvisories,
  applyFindings,
  syncGhsa,
  syncNvd,
} = require("../electron/security.cjs");
const { project, repository, importData } = require("../electron/core.cjs");
const advisory = (overrides = {}) => ({
  ghsa_id: "GHSA-aaaa-bbbb-cccc",
  cve_id: "CVE-2026-12345",
  summary: "Test advisory",
  severity: "high",
  cvss: { score: 7.5 },
  published_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T01:00:00Z",
  vulnerabilities: [
    {
      package: { ecosystem: "npm", name: "sample" },
      vulnerable_version_range: ">= 1.0.0, < 2.0.0",
      first_patched_version: "2.0.0",
    },
  ],
  ...overrides,
});
const nvd = (extra = {}) => ({
  cve: {
    id: "CVE-2026-12346",
    descriptions: [{ lang: "en", value: "WordPress advisory" }],
    metrics: {
      cvssMetricV31: [{ type: "Primary", cvssData: { baseScore: 9.8 } }],
    },
    configurations: [
      {
        nodes: [
          {
            operator: "OR",
            cpeMatch: [
              {
                vulnerable: true,
                criteria: "cpe:2.3:a:wordpress:wordpress:*:*:*:*:*:*:*:*",
                versionStartIncluding: "6.0",
                versionEndExcluding: "6.4.1",
              },
            ],
          },
        ],
      },
    ],
    ...extra,
  },
});
test("inventory parser preserves exact package identity and rejects malformed rows", () => {
  const result = parseInventory(
    "npm | @sanity/client | 8.0.0\nnuget | Umbraco.Cms | 15.0.0\nmaven | org.example:lib | 2.0\ncms | WordPress | 6.4 | wordpress:wordpress",
  );
  assert.equal(result.length, 4);
  assert.equal(result[0].name, "@sanity/client");
  assert.throws(() => parseInventory("npm | missing-version"));
  assert.throws(() => parseInventory("cms | WP | 6.4 | wildcard:*"));
});
test("imports npm lockfile including nested scoped dependencies", () => {
  const result = importInventory({
    lockfileVersion: 3,
    packages: {
      "": { name: "root" },
      "node_modules/@sanity/client": { version: "8.0.0" },
      "node_modules/a/node_modules/sample": { version: "1.5.0" },
    },
  });
  assert.equal(result.components.length, 2);
  assert.equal(result.components[0].name, "@sanity/client");
  assert.equal(result.components[1].name, "sample");
});
test("imports NuGet lockfiles and skips unresolved/project references", () => {
  const result = importInventory({
    version: 1,
    dependencies: {
      net8: {
        "Sample.Package": { type: "Direct", resolved: "1.2.3" },
        "Project.Ref": { type: "Project" },
        Unknown: { type: "Direct" },
      },
    },
  });
  assert.equal(result.components.length, 1);
  assert.equal(result.components[0].ecosystem, "nuget");
  assert.equal(result.skipped, 1);
});
test("imports Java CycloneDX and SPDX package URLs", () => {
  const result = importInventory({
    bomFormat: "CycloneDX",
    components: [
      {
        purl: "pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1",
        version: "2.14.1",
      },
    ],
  });
  assert.equal(
    result.components[0].name,
    "org.apache.logging.log4j:log4j-core",
  );
  const parsed = purlComponent("pkg:npm/%40sanity/client@8.0.0");
  assert.equal(parsed.name, "@sanity/client");
  const spdx = importInventory({
    spdxVersion: "SPDX-2.3",
    packages: [
      {
        versionInfo: "1.2.3",
        externalRefs: [
          {
            referenceType: "purl",
            referenceLocator: "pkg:nuget/Test.Package@1.2.3",
          },
        ],
      },
    ],
  });
  assert.equal(spdx.components[0].ecosystem, "nuget");
});
test("matches npm semver ranges and stable NuGet/Java numeric versions conservatively", () => {
  assert.equal(inRange("1.5.0", ">= 1.0.0, < 2.0.0", "npm"), true);
  assert.equal(inRange("2.0.0", "< 2.0.0", "npm"), false);
  assert.equal(inRange("1.2.3.4", ">= 1.2, < 1.3", "nuget"), true);
  assert.equal(inRange("2.14.1", ">= 2.0, < 2.15.0", "maven"), true);
  assert.equal(inRange("2.0-SNAPSHOT", "< 3.0", "maven"), null);
  assert.equal(inRange("?", "< 3.0", "maven"), null);
});
test("local advisory match includes CVE, severity, score and fix; patched versions are excluded", () => {
  const record = normalizeGhsa(advisory());
  const p = {
    inventory: parseInventory("npm | sample | 1.5.0\nnpm | sample | 2.0.0"),
  };
  const result = matchAdvisories(p, [record]);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].advisory, "CVE-2026-12345");
  assert.equal(result.findings[0].severity, "high");
  assert.equal(result.findings[0].score, 7.5);
  assert.equal(result.findings[0].fixed, "2.0.0");
  assert.equal(result.findings[0].confidence, "affected");
  assert.match(result.findings[0].url, /github.com\/advisories/);
});
test("NuGet names match case-insensitively without fuzzy package matching", () => {
  const record = normalizeGhsa(
    advisory({
      vulnerabilities: [
        {
          package: { ecosystem: "nuget", name: "Sample.Package" },
          vulnerable_version_range: "< 2.0.0",
        },
      ],
    }),
  );
  assert.equal(
    matchAdvisories(
      { inventory: parseInventory("nuget | sample.package | 1.0.0") },
      [record],
    ).findings.length,
    1,
  );
  assert.equal(
    matchAdvisories(
      { inventory: parseInventory("nuget | sample.package.extra | 1.0.0") },
      [record],
    ).findings.length,
    0,
  );
});
test("CMS CPE matching respects exclusive boundaries and marks conditional applicability for review", () => {
  const record = normalizeNvd(nvd());
  const p = {
    inventory: parseInventory("cms | WordPress | 6.4.0 | wordpress:wordpress"),
  };
  assert.equal(matchAdvisories(p, [record]).findings[0].confidence, "affected");
  assert.equal(record.severity, "critical");
  assert.equal(
    matchAdvisories(
      {
        inventory: parseInventory(
          "cms | WordPress | 6.4.1 | wordpress:wordpress",
        ),
      },
      [record],
    ).findings.length,
    0,
  );
  const conditional = nvd();
  conditional.cve.configurations[0].nodes[0].operator = "AND";
  assert.equal(
    matchAdvisories(p, [normalizeNvd(conditional)]).findings[0].confidence,
    "review",
  );
  assert.equal(
    matchAdvisories({ inventory: parseInventory("cms | Wix | ?") }, [record])
      .unmapped,
    1,
  );
});
test("withdrawn records disappear and fresh notifications are deduplicated", () => {
  const p = {
      watchSecurity: true,
      events: [],
      inventory: parseInventory("npm | sample | 1.0.0"),
    },
    notifications = [];
  const opts = { notify: (_, s) => notifications.push(s) };
  applyFindings(p, [], opts);
  applyFindings(p, [normalizeGhsa(advisory())], opts);
  applyFindings(p, [normalizeGhsa(advisory())], opts);
  assert.equal(notifications.length, 1);
  assert.equal(p.events.length, 1);
  applyFindings(
    p,
    [normalizeGhsa(advisory({ withdrawn_at: "2026-11-02" }))],
    opts,
  );
  assert.equal(p.security.findings.length, 0);
});
test("global advisory job sends no package inventory or authorization and follows pagination", async () => {
  const cache = { records: [] };
  let calls = 0;
  await syncGhsa(cache, {
    fetcher: async (url, options) => {
      calls++;
      assert.equal(options.headers.Authorization, undefined);
      assert.ok(!url.includes("affects="));
      if (calls === 1)
        assert.match(
          new URL(url).searchParams.get("modified"),
          /^>=\d{4}-\d{2}-\d{2}$/,
        );
      assert.equal(options.body, undefined);
      return new Response(JSON.stringify([advisory()]), {
        headers:
          calls === 1
            ? {
                link: '<https://api.github.com/advisories?after=next>; rel="next"',
              }
            : {},
      });
    },
  });
  assert.equal(calls, 2);
  assert.equal(cache.ghsa.status, "ready");
  assert.equal(cache.records.length, 1);
});
test("feed failures retain old data and do not claim freshness", async () => {
  const cache = {
    records: [normalizeGhsa(advisory())],
    ghsa: { checkedAt: "2026-01-01" },
  };
  await syncGhsa(cache, {
    fetcher: async () => new Response("rate limit", { status: 429 }),
  });
  assert.equal(cache.ghsa.status, "error");
  assert.equal(cache.ghsa.checkedAt, "2026-01-01");
  assert.equal(cache.records.length, 1);
});
test("NVD downloader validates checksum and matches entirely locally", async () => {
  const raw = Buffer.from(JSON.stringify({ vulnerabilities: [nvd()] })),
    hash = createHash("sha256").update(raw).digest("hex"),
    cache = { records: [] };
  await syncNvd(cache, {
    fetcher: async (url, options) => {
      assert.equal(options.headers, undefined);
      assert.ok(!url.includes("wordpress"));
      return url.endsWith(".meta")
        ? new Response(`sha256:${hash}\nlastModifiedDate:2026-11-02T00:00:00Z`)
        : new Response(gzipSync(raw));
    },
  });
  assert.equal(cache.nvd.status, "ready");
  assert.equal(cache.records[0].id, "CVE-2026-12346");
  const old = cache.records;
  await syncNvd(cache, {
    fetcher: async (url) =>
      url.endsWith(".meta")
        ? new Response("sha256:invalid")
        : new Response(gzipSync(raw)),
  });
  assert.equal(cache.nvd.status, "error");
  assert.equal(cache.records, old);
});
test("repository inventory refresh retains snapshots when permissions expire", async () => {
  const p = {
    repo: "https://github.com/a/b",
    autoInventory: true,
    detectedInventory: [{ ecosystem: "npm", name: "saved", version: "1.0.0" }],
  };
  await refreshInventory(p, {
    repository,
    github: async () => {
      throw new Error("Access expired");
    },
  });
  assert.equal(p.detectedInventory[0].name, "saved");
  assert.match(p.inventoryError, /Access expired/);
});
test("security inventory survives project import/export independently of auth", () => {
  const p = project({
    name: "Old site",
    url: "https://example.com",
    watchSecurity: true,
    inventoryText: "composer | drupal/core | 10.1.0 | drupal:drupal",
  });
  const [copy] = importData({
    version: 1,
    projects: [
      {
        ...p,
        detectedInventory: [
          { ecosystem: "npm", name: "sanity", version: "4.0.0" },
        ],
      },
    ],
  });
  assert.equal(copy.inventory[0].name, "drupal/core");
  assert.equal(copy.detectedInventory[0].name, "sanity");
  assert.equal(copy.watchSecurity, true);
  assert.equal(copy.access, "disconnected");
});

test("manual CPE mapping overrides an automatically discovered package identity", () => {
  const p = {
    inventory: parseInventory("npm | sample | 1.0.0 | example:sample"),
    detectedInventory: [{ ecosystem: "npm", name: "sample", version: "1.0.0" }],
  };
  const record = normalizeNvd(nvd());
  record.affected = [{ cpe: "example:sample", version: "1.0.0" }];
  assert.equal(matchAdvisories(p, [record]).findings.length, 1);
});

test("minimatch advisory matches every affected version and excludes the patched release", () => {
  const record = normalizeGhsa(
    advisory({
      ghsa_id: "GHSA-g3hv-75wg-m249",
      cve_id: "CVE-2026-118764",
      vulnerabilities: [
        {
          package: { ecosystem: "npm", name: "minimatch" },
          vulnerable_version_range: "< 11.0.1",
          first_patched_version: "11.0.1",
        },
      ],
    }),
  );
  const inventory = ["3.1.5", "5.1.9", "9.0.9", "10.2.6", "11.0.1"].map(
    (version) => ({ ecosystem: "npm", name: "minimatch", version }),
  );
  const result = matchAdvisories({ inventory }, [record]);
  assert.deepEqual(
    result.findings.map((f) => f.version),
    ["3.1.5", "5.1.9", "9.0.9", "10.2.6"],
  );
  const lock = require("../package-lock.json");
  const { components } = importInventory(lock, "package-lock.json");
  assert.ok(
    components.some((c) => c.name === "minimatch" && c.version === "11.0.1"),
  );
  assert.deepEqual(
    matchAdvisories({ inventory: components }, [record]).findings,
    [],
  );
});

test("refreshing an updated repository inventory removes obsolete CVE findings", async () => {
  const record = normalizeGhsa(
    advisory({
      vulnerabilities: [
        {
          package: { ecosystem: "npm", name: "minimatch" },
          vulnerable_version_range: "< 11.0.1",
          first_patched_version: "11.0.1",
        },
      ],
    }),
  );
  const p = {
    repo: "https://github.com/acme/app",
    autoInventory: true,
    watchSecurity: true,
    detectedInventory: [
      { ecosystem: "npm", name: "minimatch", version: "9.0.9" },
    ],
    events: [],
  };
  applyFindings(p, [record]);
  assert.equal(p.security.findings.length, 1);
  const lock = {
    lockfileVersion: 3,
    packages: { "node_modules/minimatch": { version: "11.0.1" } },
  };
  await refreshInventory(p, {
    repository,
    github: async (_, route) =>
      route.includes("/git/trees/")
        ? { tree: [{ type: "blob", path: "package-lock.json", sha: "abc" }] }
        : {
            size: 100,
            content: Buffer.from(JSON.stringify(lock)).toString("base64"),
          },
  });
  applyFindings(p, [record]);
  assert.deepEqual(p.security.findings, []);
  assert.equal(p.detectedInventory[0].version, "11.0.1");
});

test("glob cancellation advisory excludes the patched release and the unaffected legacy branch", () => {
  const record = normalizeGhsa(
    advisory({
      ghsa_id: "GHSA-3g3m-2fjr-6pw4",
      cve_id: "CVE-2026-118773",
      vulnerabilities: [
        {
          package: { ecosystem: "npm", name: "glob" },
          vulnerable_version_range: ">= 9.0.0, <= 14.0.1",
          first_patched_version: "14.0.2",
        },
      ],
    }),
  );
  const inventory = ["7.2.3", "9.0.0", "13.0.6", "14.0.1", "14.0.2"].map(
    (version) => ({ ecosystem: "npm", name: "glob", version }),
  );
  assert.deepEqual(
    matchAdvisories({ inventory }, [record]).findings.map((f) => f.version),
    ["9.0.0", "13.0.6", "14.0.1"],
  );
  const { components } = importInventory(
    require("../package-lock.json"),
    "package-lock.json",
  );
  assert.ok(
    components.some((c) => c.name === "glob" && c.version === "14.0.2"),
  );
  assert.deepEqual(
    matchAdvisories({ inventory: components }, [record]).findings,
    [],
  );
});
