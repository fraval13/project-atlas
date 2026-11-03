const crypto = require("node:crypto");
const { normalizeInventory, parseInventory } = require("./inventory.cjs");
function webUrl(value, optional = false) {
  if (optional && !value) return "";
  const u = new URL(value);
  if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
    throw new Error("Use an HTTP(S) URL without embedded credentials.");
  return u.href;
}
function repository(value) {
  if (!value) return null;
  const u = new URL(webUrl(value));
  if (u.protocol !== "https:")
    throw new Error("Repository connections require HTTPS.");
  if (u.search || u.hash)
    throw new Error(
      "Repository URLs must not contain query parameters or fragments.",
    );
  const parts = u.pathname
    .replace(/\/+$/, "")
    .replace(/\.git$/, "")
    .split("/")
    .filter(Boolean);
  if (parts.length !== 2 || !parts.every((x) => /^[\w.-]+$/.test(x)))
    throw new Error(
      "Use a repository URL such as https://github.com/owner/repository.",
    );
  return {
    host: u.host,
    path: parts.join("/"),
    api:
      u.host === "github.com" ? "https://api.github.com" : `${u.origin}/api/v3`,
  };
}
function project(input) {
  if (!input || typeof input.name !== "string" || !input.name.trim())
    throw new Error("Project name is required.");
  const repo = typeof input.repo === "string" ? input.repo.trim() : "";
  repository(repo);
  const url = webUrl(input.url || "", true);
  if (!repo && !url) throw new Error("Add a website URL or a repository.");
  const str = (v, max = 10000) =>
    typeof v === "string" ? v.slice(0, max) : "";
  const usesSaml =
    input.usesSaml === true ||
    (input.usesSaml === undefined &&
      !!(input.authExpiresAt || input.reauthDays));
  const authExpiresAt =
    usesSaml && input.authExpiresAt
      ? new Date(input.authExpiresAt).toISOString()
      : "";
  const reauthDays =
    usesSaml && input.reauthDays ? Number(input.reauthDays) : null;
  const warningDays =
    input.warningDays === undefined ? 7 : Number(input.warningDays);
  if (
    (reauthDays !== null &&
      (!Number.isFinite(reauthDays) ||
        reauthDays < 0.01 ||
        reauthDays > 3650)) ||
    !Number.isFinite(warningDays) ||
    warningDays < 0 ||
    warningDays > 3650
  )
    throw new Error(
      "Reauthentication and warning intervals must be between 0 and 3,650 days.",
    );
  return {
    inventory:
      typeof input.inventoryText === "string"
        ? parseInventory(input.inventoryText)
        : normalizeInventory(input.inventory || []),
    lastAvailability:
      input.lastAvailability?.url === url &&
      input.lastAvailability.kind ===
        (input.monitorKind === "health" ? "health" : "website") &&
      (input.monitorKind === "health"
        ? ["healthy", "unhealthy", "degraded"]
        : ["online", "offline"]
      ).includes(input.lastAvailability.state)
        ? {
            url,
            kind: input.lastAvailability.kind,
            state: input.lastAvailability.state,
          }
        : undefined,
    siteCheckProblem: input.siteCheckProblem === true,
    monitorKind: input.monitorKind === "health" ? "health" : "website",
    healthStatus: "unknown",
    watchResume:
      input.watchResume && typeof input.watchResume === "object"
        ? {
            watchSite: !!url && input.watchResume.watchSite === true,
            watchRepo: !!repo && input.watchResume.watchRepo === true,
            watchSecurity: input.watchResume.watchSecurity === true,
          }
        : undefined,
    watchSecurity: input.watchSecurity === true,
    autoInventory: input.autoInventory !== false,
    usesSaml,
    authExpiresAt,
    reauthDays,
    warningDays,
    id: str(input.id, 100) || crypto.randomUUID(),
    name: input.name.trim().slice(0, 120),
    client: str(input.client, 120),
    repo,
    url,
    notes: str(input.notes),
    detectedTechnologies: Array.isArray(input.detectedTechnologies)
      ? input.detectedTechnologies
          .filter((t) => typeof t === "string")
          .slice(0, 100)
          .map((t) => t.trim().slice(0, 60))
          .filter(Boolean)
      : [],
    technologies: Array.isArray(input.technologies)
      ? input.technologies
          .filter((t) => typeof t === "string")
          .slice(0, 40)
          .map((t) => t.trim().slice(0, 60))
          .filter(Boolean)
      : [],
    watchSite: !!url && input.watchSite !== false,
    watchRepo: !!repo && input.watchRepo !== false,
    notify: input.notify !== false,
    status: "unknown",
    prs: [],
    events: [],
    access: "disconnected",
  };
}
function importData(data) {
  if (
    data?.version !== 1 ||
    !Array.isArray(data.projects) ||
    data.projects.length > 1000
  )
    throw new Error(
      "Expected an Atlas version 1 export with up to 1,000 projects.",
    );
  const ids = new Set();
  return data.projects.map((p) => {
    const clean = project(p);
    if (ids.has(clean.id)) throw new Error("Duplicate project IDs in import.");
    ids.add(clean.id);
    // Keep historical text, never trust imported action URLs or monitoring state.
    clean.events = Array.isArray(p.events)
      ? p.events
          .slice(0, 100)
          .filter(
            (e) => typeof e?.text === "string" && typeof e?.at === "string",
          )
          .map((e) => ({
            id: crypto.randomUUID(),
            text: e.text.slice(0, 500),
            at: e.at,
            kind: "history",
            seen: typeof e.seen === "boolean" ? e.seen : true,
          }))
      : [];
    clean.prs = Array.isArray(p.prs)
      ? p.prs
          .slice(0, 100)
          .filter(
            (pr) =>
              Number.isSafeInteger(pr?.id) &&
              Number.isSafeInteger(pr?.number) &&
              typeof pr?.title === "string",
          )
          .map((pr) => ({
            id: pr.id,
            number: pr.number,
            title: pr.title.slice(0, 500),
            author:
              typeof pr.author === "string"
                ? pr.author.slice(0, 100)
                : "unknown",
            draft: !!pr.draft,
            at: typeof pr.at === "string" ? pr.at : "",
            url: "",
          }))
      : [];
    if (p.security && Array.isArray(p.security.findings)) {
      clean.security = {
        initialized: false,
        checkedAt:
          typeof p.security.checkedAt === "string" ? p.security.checkedAt : "",
        componentCount:
          clean.inventory.length + (p.detectedInventory?.length || 0),
        unmapped: 0,
        findings: p.security.findings
          .slice(0, 5000)
          .filter(
            (f) => typeof f?.id === "string" && typeof f?.advisory === "string",
          )
          .map((f) => {
            const out = {};
            for (const key of [
              "id",
              "advisory",
              "source",
              "url",
              "title",
              "at",
              "package",
              "ecosystem",
              "version",
              "range",
              "fixed",
            ])
              out[key] =
                typeof f[key] === "string"
                  ? f[key].slice(0, key === "title" ? 1000 : 500)
                  : "";
            out.severity = ["critical", "high", "medium", "low"].includes(
              f.severity,
            )
              ? f.severity
              : "unknown";
            out.score =
              typeof f.score === "number" && f.score >= 0 && f.score <= 10
                ? f.score
                : null;
            out.confidence =
              f.confidence === "affected" ? "affected" : "review";
            return out;
          }),
      };
    }
    clean.detectedInventory = normalizeInventory(p.detectedInventory || []);
    clean.inventoryCheckedAt =
      typeof p.inventoryCheckedAt === "string" ? p.inventoryCheckedAt : "";
    clean.detectedTechnologies = Array.isArray(p.detectedTechnologies)
      ? p.detectedTechnologies
          .filter((t) => typeof t === "string")
          .slice(0, 100)
          .map((t) => t.slice(0, 60))
      : [];
    return clean;
  });
}
module.exports = { webUrl, repository, project, importData };
