const crypto = require("node:crypto");
const { repository } = require("./core.cjs");
const frameworks = {
  react: "React",
  next: "Next.js",
  vue: "Vue",
  nuxt: "Nuxt",
  svelte: "Svelte",
  "@angular/core": "Angular",
  express: "Express",
  "@nestjs/core": "NestJS",
  tailwindcss: "Tailwind CSS",
  prisma: "Prisma",
  pg: "PostgreSQL",
  mysql2: "MySQL",
  mongodb: "MongoDB",
  redis: "Redis",
  vite: "Vite",
  vitest: "Vitest",
  electron: "Electron",
  typescript: "TypeScript",
  storybook: "Storybook",
  "@storybook/react": "Storybook",
};
async function checkWebsite(
  p,
  { fetcher = fetch, notify = () => {}, now = () => new Date() } = {},
) {
  if (!p.watchSite || !p.url) return;
  const old = p.status,
    first = !p.checkedAt,
    start = Date.now();
  try {
    const response = await fetcher(p.url, {
      signal: AbortSignal.timeout(12000),
      redirect: "follow",
      credentials: "omit",
    });
    await response.body?.cancel();
    p.httpStatus = response.status;
    p.latency = Date.now() - start;
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
  } catch {
    p.status = "unknown";
    p.siteError =
      "Could not reach website. Check your network, VPN, or website availability.";
    p.latency = null;
  }
  p.checkedAt = now().toISOString();
  if (first || old !== p.status) {
    p.events.unshift({
      id: crypto.randomUUID(),
      kind: "status",
      text: `Website is ${p.status}${p.siteError ? ": " + p.siteError : ""}`,
      at: p.checkedAt,
    });
    if (!first && old !== p.status) notify(p, `Website is ${p.status}`);
  }
}
async function checkRepository(
  p,
  { github, notify = () => {}, now = () => new Date() } = {},
) {
  if (!p.repo || !p.watchRepo) return;
  const repo = repository(p.repo);
  try {
    const result = await Promise.all([
      github(repo, `/repos/${repo.path}/languages`, p),
      github(repo, `/repos/${repo.path}/pulls?state=open&per_page=100`, p),
      github(repo, `/repos/${repo.path}/events?per_page=30`, p),
    ]);
    const [langs, prs, events] = result;
    if (
      !Array.isArray(prs) ||
      !Array.isArray(events) ||
      !langs ||
      typeof langs !== "object"
    )
      throw new Error("Unexpected GitHub response.");
    if (p.repoInitialized)
      for (const pr of prs)
        if (!p.prs.some((old) => old.id === pr.id))
          notify(p, `New pull request #${pr.number}: ${pr.title}`);
    p.prs = prs.map((pr) => ({
      id: pr.id,
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      author: pr.user.login,
      draft: pr.draft,
      at: pr.created_at,
    }));
    p.detectedTechnologies = Object.keys(langs);
    p.access = "connected";
    p.repoError = "";
    p.repoInitialized = true;
    p.repoCheckedAt = now().toISOString();
    for (const e of [...events].reverse())
      if (!p.events.some((old) => old.id === String(e.id)))
        p.events.unshift({
          id: String(e.id),
          kind: "repository",
          text: `${e.actor.login} · ${e.type.replace(/Event$/, "").replace(/([a-z])([A-Z])/g, "$1 $2")}`,
          at: e.created_at,
        });
    // Optional root package manifest enriches GitHub's language list with known technologies.
    // Failure here must not hide successfully loaded activity or invalidate authentication.
    if (
      !p.manifestCheckedAt ||
      Date.now() - Date.parse(p.manifestCheckedAt) > 3600000
    ) {
      try {
        const manifest = await github(
          repo,
          `/repos/${repo.path}/contents/package.json`,
          p,
        );
        if (manifest.size > 1000000) throw new Error("Manifest too large");
        const pkg = JSON.parse(
          Buffer.from(manifest.content, "base64").toString("utf8"),
        );
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        p.frameworks = Array.from(
          new Set(
            Object.keys(deps)
              .filter((k) => frameworks[k])
              .map((k) => frameworks[k]),
          ),
        );
        p.manifestCheckedAt = now().toISOString();
      } catch {}
    }
    p.detectedTechnologies = Array.from(
      new Set([...p.detectedTechnologies, ...(p.frameworks || [])]),
    );
  } catch (e) {
    p.access = "disconnected";
    p.repoError = e.message;
  }
}
module.exports = { checkWebsite, checkRepository };
