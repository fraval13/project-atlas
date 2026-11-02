const semver = require("semver");
const { gunzipSync } = require("node:zlib");
const crypto = require("node:crypto");
const { normalizeInventory } = require("./inventory.cjs");
function numericCompare(a, b) {
  if (!/^v?\d+(?:\.\d+)*$/i.test(a) || !/^v?\d+(?:\.\d+)*$/i.test(b))
    return null;
  const aa = a.replace(/^v/i, "").split(".").map(BigInt),
    bb = b.replace(/^v/i, "").split(".").map(BigInt);
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    const x = aa[i] || 0n,
      y = bb[i] || 0n;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}
function inRange(version, range, ecosystem) {
  if (!range || version === "?") return null;
  if (ecosystem === "npm") {
    if (
      !semver.valid(version) ||
      !semver.validRange(range.replaceAll(",", " "))
    )
      return null;
    return semver.satisfies(version, range.replaceAll(",", " "));
  }
  // Complex ecosystem-specific qualifiers are deliberately review-required.
  let unknown = false;
  for (const alternative of range.split("||")) {
    let matches = true;
    for (const raw of alternative.split(",")) {
      const clause = raw.trim();
      if (clause === "*") continue;
      const match = clause.match(/^(>=|<=|>|<|=)?\s*(v?\d+(?:\.\d+)*)$/i);
      if (!match) {
        unknown = true;
        matches = false;
        break;
      }
      const c = numericCompare(version, match[2]);
      if (c === null) {
        unknown = true;
        matches = false;
        break;
      }
      if (
        !{ "=": c === 0, ">": c > 0, ">=": c >= 0, "<": c < 0, "<=": c <= 0 }[
          match[1] || "="
        ]
      )
        matches = false;
    }
    if (matches) return true;
  }
  return unknown ? null : false;
}
function severity(score) {
  return score >= 9
    ? "critical"
    : score >= 7
      ? "high"
      : score >= 4
        ? "medium"
        : score > 0
          ? "low"
          : "unknown";
}
function normalizeGhsa(a) {
  if (typeof a?.ghsa_id !== "string")
    throw new Error("Invalid advisory record");
  const score =
    a.cvss_severities?.cvss_v4?.score ??
    a.cvss_severities?.cvss_v3?.score ??
    a.cvss?.score ??
    null;
  return {
    id: a.ghsa_id,
    cve: a.cve_id || "",
    source: "GitHub advisories",
    url: `https://github.com/advisories/${encodeURIComponent(a.ghsa_id)}`,
    title: String(a.summary || a.ghsa_id).slice(0, 1000),
    severity: ["critical", "high", "medium", "low"].includes(a.severity)
      ? a.severity
      : severity(score),
    score,
    at: a.published_at || "",
    modified: a.updated_at || "",
    withdrawn: !!a.withdrawn_at,
    affected: (a.vulnerabilities || []).map((v) => ({
      ecosystem: v.package?.ecosystem,
      name: v.package?.name,
      range: v.vulnerable_version_range,
      fixed: v.first_patched_version || "",
    })),
  };
}
function normalizeNvd(wrapper) {
  const a = wrapper.cve || wrapper;
  if (typeof a?.id !== "string" || !a.id.startsWith("CVE-"))
    throw new Error("Invalid NVD record");
  const ratings =
    a.metrics?.cvssMetricV40 ||
    a.metrics?.cvssMetricV31 ||
    a.metrics?.cvssMetricV30 ||
    a.metrics?.cvssMetricV2 ||
    [];
  const metric = ratings.find((m) => m.type === "Primary") || ratings[0];
  const score = metric?.cvssData?.baseScore ?? null;
  const affected = [];
  const visit = (nodes, conditional = false, depth = 0) => {
    if (depth > 10) return;
    for (const n of nodes || []) {
      const uncertain = conditional || n.operator === "AND" || !!n.negate;
      for (const c of n.cpeMatch || [])
        if (c.vulnerable) {
          const bits = c.criteria?.split(/(?<!\\):/);
          if (bits?.length >= 6 && bits[0] === "cpe" && bits[2] === "a")
            affected.push({
              cpe: `${bits[3]}:${bits[4]}`.replace(/\\/g, "").toLowerCase(),
              version: bits[5],
              start: c.versionStartIncluding,
              startExclusive: c.versionStartExcluding,
              end: c.versionEndIncluding,
              endExclusive: c.versionEndExcluding,
              conditional:
                uncertain ||
                bits.slice(6).some((value) => value !== "*" && value !== "-"),
            });
        }
      visit(n.nodes || n.children, uncertain, depth + 1);
    }
  };
  for (const configuration of a.configurations || [])
    visit(
      configuration.nodes,
      configuration.operator === "AND" || !!configuration.negate,
    );
  return {
    id: a.id,
    cve: a.id,
    source: "NVD",
    url: `https://nvd.nist.gov/vuln/detail/${a.id}`,
    title: (a.descriptions?.find((d) => d.lang === "en")?.value || a.id).slice(
      0,
      1000,
    ),
    severity: severity(score),
    score,
    at: a.published || "",
    modified: a.lastModified || "",
    withdrawn: a.vulnStatus === "Rejected",
    affected,
  };
}
function matchAdvisories(project, records) {
  const inventory = normalizeInventory([
      ...(project.detectedInventory || []),
      ...(project.inventory || []),
    ]),
    findings = new Map();
  const index = new Map();
  for (const advisory of records) {
    if (advisory.withdrawn) continue;
    for (const affected of advisory.affected) {
      const key =
        advisory.source === "NVD"
          ? `cpe:${affected.cpe}`
          : `${affected.ecosystem}:${affected.ecosystem === "nuget" ? affected.name?.toLowerCase() : affected.name}`;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push({ advisory, affected });
    }
  }
  let unmapped = 0;
  for (const component of inventory) {
    if (component.ecosystem === "cms" && !component.cpe) unmapped++;
    const componentKey = `${component.ecosystem}:${component.ecosystem === "nuget" ? component.name.toLowerCase() : component.name}`;
    const candidates = [
      ...(index.get(componentKey) || []),
      ...(component.cpe ? index.get(`cpe:${component.cpe}`) || [] : []),
    ];
    for (const { advisory: a, affected } of candidates) {
      let result = false;
      if (a.source === "NVD") {
        if (!component.cpe || component.cpe !== affected.cpe) continue;
        const conditions = [];
        if (
          affected.version &&
          affected.version !== "*" &&
          affected.version !== "-"
        )
          conditions.push(`= ${affected.version}`);
        if (affected.start) conditions.push(`>= ${affected.start}`);
        if (affected.startExclusive)
          conditions.push(`> ${affected.startExclusive}`);
        if (affected.end) conditions.push(`<= ${affected.end}`);
        if (affected.endExclusive)
          conditions.push(`< ${affected.endExclusive}`);
        result = conditions.length
          ? inRange(component.version, conditions.join(", "), "other")
          : null;
        if (affected.conditional && result === true) result = null;
      } else {
        if (component.ecosystem !== affected.ecosystem) continue;
        const name =
          component.ecosystem === "nuget"
            ? component.name.toLowerCase()
            : component.name;
        if (
          name !==
          (component.ecosystem === "nuget"
            ? affected.name?.toLowerCase()
            : affected.name)
        )
          continue;
        result = inRange(
          component.version,
          affected.range,
          component.ecosystem,
        );
      }
      if (result === false) continue;
      const id = `${a.cve || a.id}:${component.ecosystem}:${component.name}@${component.version}`;
      const finding = {
        id,
        advisory: a.cve || a.id,
        source: a.source,
        url: a.url,
        title: a.title,
        severity: a.severity,
        score: a.score,
        at: a.at,
        package: component.name,
        ecosystem: component.ecosystem,
        version: component.version,
        range: affected.range || "See CPE applicability in advisory",
        fixed: affected.fixed || "",
        confidence: result === true ? "affected" : "review",
      };
      if (!findings.has(id) || findings.get(id).confidence === "review")
        findings.set(id, finding);
    }
  }
  return {
    findings: [...findings.values()],
    componentCount: inventory.length,
    unmapped,
  };
}
function applyFindings(
  p,
  records,
  { notify = () => {}, now = () => new Date() } = {},
) {
  if (!p.watchSecurity) return;
  const result = matchAdvisories(p, records),
    old = new Set((p.security?.findings || []).map((f) => f.id));
  const fresh = result.findings.filter((f) => !old.has(f.id));
  if (p.security?.initialized && fresh.length) {
    const text = `${fresh.length} new vulnerability match${fresh.length === 1 ? "" : "es"} · ${fresh[0].advisory} (${fresh[0].severity})`;
    notify(p, text);
    p.events.unshift({
      id: crypto.randomUUID(),
      kind: "security",
      text,
      at: now().toISOString(),
    });
  }
  p.security = { ...result, initialized: true, checkedAt: now().toISOString() };
}
async function readResponse(response, limit) {
  if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}`);
  if (Number(response.headers.get("content-length")) > limit)
    throw new Error("Feed exceeds download limit");
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw new Error("Feed exceeds download limit");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function syncGhsa(
  cache,
  { fetcher = fetch, now = () => new Date() } = {},
) {
  const started = now().toISOString(),
    since = cache.ghsa?.lastComplete
      ? new Date(Date.parse(cache.ghsa.lastComplete) - 86400000).toISOString()
      : new Date(now().getTime() - 30 * 86400000).toISOString();
  let url =
    cache.ghsa?.next ||
    `https://api.github.com/advisories?type=reviewed&modified=${encodeURIComponent(">=" + since.slice(0, 10))}&per_page=100&sort=updated&direction=desc`;
  cache.ghsa = {
    ...cache.ghsa,
    coverageStart: cache.ghsa?.coverageStart || since,
    cycleStarted: cache.ghsa?.next
      ? cache.ghsa.cycleStarted || started
      : started,
    error: "",
    status: "syncing",
  };
  const records = new Map((cache.records || []).map((r) => [r.id, r]));
  try {
    for (let page = 0; url && page < 20; page++) {
      if (!url.startsWith("https://api.github.com/advisories?"))
        throw new Error("Invalid advisory pagination URL");
      const response = await fetcher(url, {
        headers: { Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(30000),
        redirect: "error",
      });
      const rows = JSON.parse(
        (await readResponse(response, 20000000)).toString(),
      );
      if (!Array.isArray(rows)) throw new Error("Invalid advisory response");
      for (const row of rows) {
        const record = normalizeGhsa(row);
        records.set(record.id, record);
      }
      url =
        response.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ||
        "";
      cache.ghsa.next = url;
    }
    cache.ghsa.status = url ? "partial" : "ready";
    cache.ghsa.checkedAt = started;
    if (!url) cache.ghsa.lastComplete = cache.ghsa.cycleStarted;
  } catch (e) {
    cache.ghsa.status = "error";
    cache.ghsa.error = e.message;
  }
  cache.records = [...records.values()];
}
async function syncNvd(
  cache,
  { fetcher = fetch, now = () => new Date() } = {},
) {
  cache.nvd = { ...cache.nvd, error: "", status: "syncing" };
  try {
    const metaResponse = await fetcher(
      "https://nvd.nist.gov/feeds/json/cve/2.0/nvdcve-2.0-modified.meta",
      { signal: AbortSignal.timeout(30000), redirect: "error" },
    );
    const meta = (await readResponse(metaResponse, 10000)).toString(),
      sha = meta.match(/^sha256:(\w+)/m)?.[1],
      modified = meta.match(/^lastModifiedDate:(.+)/m)?.[1]?.trim();
    if (!sha) throw new Error("Feed metadata is missing its checksum");
    if (cache.nvd.sha !== sha) {
      const response = await fetcher(
        "https://nvd.nist.gov/feeds/json/cve/2.0/nvdcve-2.0-modified.json.gz",
        { signal: AbortSignal.timeout(90000), redirect: "error" },
      );
      const raw = gunzipSync(await readResponse(response, 50000000), {
        maxOutputLength: 250000000,
      });
      if (
        crypto.createHash("sha256").update(raw).digest("hex").toLowerCase() !==
        sha.toLowerCase()
      )
        throw new Error("NVD feed checksum did not match");
      const body = JSON.parse(raw.toString());
      if (!Array.isArray(body.vulnerabilities))
        throw new Error("Invalid NVD feed");
      const records = new Map((cache.records || []).map((r) => [r.id, r]));
      for (const row of body.vulnerabilities) {
        const record = normalizeNvd(row);
        records.set(record.id, record);
      }
      cache.records = [...records.values()];
      cache.nvd.sha = sha;
    }
    const gap =
      cache.nvd.checkedAt &&
      now().getTime() - Date.parse(cache.nvd.checkedAt) > 8 * 86400000;
    cache.nvd.status = "ready";
    cache.nvd.modified = modified;
    cache.nvd.checkedAt = now().toISOString();
    cache.nvd.coverageStart =
      cache.nvd.coverageStart ||
      new Date(now().getTime() - 8 * 86400000).toISOString();
    if (gap)
      cache.nvd.gap =
        "More than 8 days elapsed between downloads. Import historical NVD feeds to fill the gap.";
  } catch (e) {
    cache.nvd.status = "error";
    cache.nvd.error = e.message;
  }
}
function importFeed(data) {
  if (Array.isArray(data)) return data.map(normalizeGhsa);
  if (Array.isArray(data?.vulnerabilities))
    return data.vulnerabilities.map(normalizeNvd);
  throw new Error(
    "Import a GitHub global advisories JSON array or an NVD 2.0 JSON feed.",
  );
}
module.exports = {
  numericCompare,
  inRange,
  normalizeGhsa,
  normalizeNvd,
  matchAdvisories,
  applyFindings,
  syncGhsa,
  syncNvd,
  importFeed,
};
