const { verifiedState, restoreAvailability } = require("./availability.cjs");
const { checkHealthResponse } = require("./health.cjs");
const { scanRepository } = require("./technologies.cjs");
const crypto = require("node:crypto");
const { repository } = require("./core.cjs");
async function checkWebsite(
  p,
  { fetcher = fetch, notify = () => {}, now = () => new Date() } = {},
) {
  if (!p.watchSite || !p.url) return;
  const old = p.status,
    previous = restoreAvailability(p),
    hadProblem = p.siteCheckProblem === true,
    health = p.monitorKind === "health",
    first = !p.checkedAt,
    start = Date.now();
  try {
    const response = await fetcher(p.url, {
      signal: AbortSignal.timeout(12000),
      redirect: "follow",
      credentials: "omit",
    });
    if (!health) await response.body?.cancel();
    p.httpStatus = response.status;
    p.latency = Date.now() - start;
    if (health) {
      const result = await checkHealthResponse(response);
      p.status = result.status;
      p.healthStatus = result.healthStatus;
      p.siteError = result.error;
    } else {
      p.status = response.ok
        ? "online"
        : response.status === 401 || response.status === 403
          ? "unknown"
          : "offline";
      p.siteError = response.ok
        ? ""
        : p.status === "unknown"
          ? `HTTP ${response.status} · website requires access or blocks monitoring`
          : `HTTP ${response.status}`;
    }
  } catch {
    p.status = "unknown";
    if (health) p.healthStatus = "unknown";
    p.siteError = health
      ? "Could not reach health endpoint. Check your network, VPN, or endpoint availability."
      : "Could not reach website. Check your network, VPN, or website availability.";
    p.latency = null;
  }
  p.checkedAt = now().toISOString();
  const current = verifiedState(p);
  const label = health ? "Backend" : "Website";
  if (current) {
    p.siteCheckProblem = false;
    p.lastAvailability = {
      url: p.url,
      kind: health ? "health" : "website",
      state: current,
    };
    if (previous?.state !== current) {
      p.events.unshift({
        id: crypto.randomUUID(),
        kind: "status",
        seen: false,
        text: `${label} is ${current}${p.siteError ? ": " + p.siteError : ""}`,
        at: p.checkedAt,
      });
      if (!first && previous) notify(p, `${label} is ${current}`);
    }
  } else {
    p.siteCheckProblem = true;
    if (!hadProblem) {
      const text = `${label} check could not verify availability${p.siteError ? ": " + p.siteError : ""}`;
      p.events.unshift({
        id: crypto.randomUUID(),
        kind: "status",
        seen: false,
        text,
        at: p.checkedAt,
      });
      if (!first && old !== "unknown") notify(p, text);
    }
  }
}
async function checkRepository(
  p,
  {
    github,
    authenticated = true,
    notify = () => {},
    now = () => new Date(),
  } = {},
) {
  if (!p.repo || !p.watchRepo) return;
  const repo = repository(p.repo);
  try {
    const labels = ["Languages", "Pull requests", "Activity"];
    const results = await Promise.allSettled([
      github(repo, `/repos/${repo.path}/languages`, p),
      github(repo, `/repos/${repo.path}/pulls?state=open&per_page=100`, p),
      github(repo, `/repos/${repo.path}/events?per_page=30`, p),
    ]);
    const valid = results.map(
      (result, index) =>
        result.status === "fulfilled" &&
        (index === 0
          ? result.value &&
            typeof result.value === "object" &&
            !Array.isArray(result.value)
          : Array.isArray(result.value)),
    );
    if (!valid.some(Boolean))
      throw new Error(
        results.find((r) => r.status === "rejected")?.reason?.message ||
          "Unexpected repository response.",
      );
    if (valid[0]) p.detectedTechnologies = Object.keys(results[0].value);
    if (valid[1]) {
      const prs = results[1].value;
      if (p.repoInitialized)
        for (const pr of prs)
          if (!p.prs.some((old) => old.id === pr.id))
            notify(p, `New pull request #${pr.number}: ${pr.title}`);
      p.prs = prs.map((pr) => ({
        id: pr.id,
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        author: pr.user?.login || "unknown",
        draft: pr.draft,
        at: pr.created_at,
      }));
      p.repoInitialized = true;
    }
    if (valid[2])
      for (const e of [...results[2].value].reverse())
        if (!p.events.some((old) => old.id === String(e.id)))
          p.events.unshift({
            id: String(e.id),
            kind: "repository",
            seen: false,
            text: `${e.actor?.login || "unknown"} · ${String(e.type)
              .replace(/Event$/, "")
              .replace(/([a-z])([A-Z])/g, "$1 $2")}`,
            at: e.created_at,
          });
    p.access = (
      typeof authenticated === "function" ? authenticated() : authenticated
    )
      ? "connected"
      : "public";
    p.repoError = results
      .flatMap((result, index) =>
        valid[index]
          ? []
          : [
              `${labels[index]}: ${result.status === "rejected" ? result.reason?.message || "Request failed" : "Unexpected repository response"}`,
            ],
      )
      .join(" ");
    p.repoCheckedAt = now().toISOString();
    if (
      !p.manifestCheckedAt ||
      Date.now() - Date.parse(p.manifestCheckedAt) > 3600000
    ) {
      try {
        const scan = await scanRepository(repo, github, p);
        if (!scan.examined && scan.warnings.length)
          throw new Error("Manifest scan incomplete");
        p.frameworks = scan.technologies;
        p.technologyWarnings = scan.warnings;
        p.manifestCheckedAt = now().toISOString();
      } catch {
        p.technologyWarnings = [
          "Could not refresh manifests. Previously detected technologies are retained.",
        ];
      }
    }
    p.detectedTechnologies = Array.from(
      new Set([...(p.detectedTechnologies || []), ...(p.frameworks || [])]),
    );
  } catch (e) {
    p.access = "disconnected";
    p.repoError = e.message;
  }
}
module.exports = { checkWebsite, checkRepository };
