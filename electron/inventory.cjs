const crypto = require("node:crypto");
const ecosystems = new Set([
  "npm",
  "nuget",
  "maven",
  "composer",
  "pip",
  "go",
  "rubygems",
  "rust",
  "other",
  "cms",
]);
function normalizeInventory(input) {
  if (!Array.isArray(input) || input.length > 15000)
    throw new Error("Inventory must contain at most 15,000 components.");
  const unique = new Map();
  for (const item of input) {
    const ecosystem = String(item.ecosystem || "").toLowerCase(),
      name = String(item.name || "").trim(),
      version = String(item.version || "").trim(),
      cpe = String(item.cpe || "")
        .trim()
        .toLowerCase();
    if (
      !ecosystems.has(ecosystem) ||
      !name ||
      name.length > 300 ||
      !version ||
      version.length > 150 ||
      /[\s|]/.test(version) ||
      /[\n|]/.test(name) ||
      (cpe && !/^[a-z0-9_.!+-]+:[a-z0-9_.!+-]+$/.test(cpe))
    )
      throw new Error(
        "Use ecosystem | package name | exact version | optional cpe-vendor:cpe-product.",
      );
    const key = `${ecosystem}:${ecosystem === "nuget" ? name.toLowerCase() : name}@${version}`;
    unique.set(key, {
      ecosystem,
      name,
      version,
      cpe,
      origin:
        typeof item.origin === "string" ? item.origin.slice(0, 300) : "manual",
    });
  }
  return [...unique.values()];
}
function parseInventory(text) {
  return normalizeInventory(
    text
      .split("\n")
      .filter((l) => l.trim() && !l.trim().startsWith("#"))
      .map((line) => {
        const [ecosystem, name, version, cpe] = line
          .split("|")
          .map((s) => s.trim());
        return { ecosystem, name, version, cpe };
      }),
  );
}
function purlComponent(purl, version) {
  if (typeof purl !== "string") return null;
  const match = purl.match(/^pkg:([^/]+)\/(.+?)(?:@([^?#]+))?(?:[?#].*)?$/);
  if (!match) return null;
  const ecosystem = {
    nuget: "nuget",
    maven: "maven",
    npm: "npm",
    pypi: "pip",
    composer: "composer",
    gem: "rubygems",
    golang: "go",
    cargo: "rust",
  }[match[1]];
  if (!ecosystem) return null;
  let name = decodeURIComponent(match[2]);
  if (ecosystem === "maven") name = name.replace(/\/([^/]+)$/, ":$1");
  return {
    ecosystem,
    name,
    version: version || decodeURIComponent(match[3] || ""),
    origin: "SBOM",
  };
}
function importInventory(data, filename = "inventory.json") {
  const result = [];
  let skipped = 0;
  const add = (ecosystem, name, version) => {
    if (typeof version === "string" && /^[vV]?\d[\w.+-]*$/.test(version))
      result.push({ ecosystem, name, version, origin: filename });
    else skipped++;
  };
  if (data.bomFormat === "CycloneDX") {
    const visit = (items) => {
      for (const c of items || []) {
        const parsed = purlComponent(c.purl, c.version);
        if (parsed) result.push(parsed);
        else skipped++;
        visit(c.components);
      }
    };
    visit(data.components);
  } else if (data.spdxVersion) {
    for (const c of data.packages || []) {
      const purl = c.externalRefs?.find(
        (r) => r.referenceType === "purl",
      )?.referenceLocator;
      const parsed = purlComponent(purl, c.versionInfo);
      if (parsed) result.push(parsed);
      else skipped++;
    }
  } else if (data.lockfileVersion && (data.packages || data.dependencies)) {
    if (data.packages) {
      for (const [location, pkg] of Object.entries(data.packages)) {
        if (!location || pkg.link) continue;
        add(
          "npm",
          pkg.name || location.split("node_modules/").at(-1),
          pkg.version,
        );
      }
    } else {
      const visit = (deps) => {
        for (const [name, pkg] of Object.entries(deps || {})) {
          add("npm", name, pkg.version);
          visit(pkg.dependencies);
        }
      };
      visit(data.dependencies);
    }
  } else if (Array.isArray(data.packages)) {
    for (const pkg of [...data.packages, ...(data["packages-dev"] || [])])
      add("composer", pkg.name, pkg.version?.replace(/^v/, ""));
  } else if (data.version && data.dependencies) {
    for (const deps of Object.values(data.dependencies))
      for (const [name, pkg] of Object.entries(deps))
        if (pkg.type !== "Project") add("nuget", name, pkg.resolved);
  } else if (Array.isArray(data)) {
    return { components: normalizeInventory(data), skipped: 0 };
  } else
    throw new Error(
      "Import package-lock.json, packages.lock.json, composer.lock, SPDX or CycloneDX JSON. Export a resolved CycloneDX SBOM for Maven/Gradle projects.",
    );
  return { components: normalizeInventory(result), skipped };
}
async function refreshInventory(p, { github, repository }) {
  if (!p.repo || !p.autoInventory) return;
  try {
    const repo = repository(p.repo),
      tree = await github(
        repo,
        `/repos/${repo.path}/git/trees/HEAD?recursive=1`,
        p,
      );
    if (!Array.isArray(tree.tree))
      throw new Error("Repository tree is unavailable.");
    const paths = tree.tree.filter(
      (f) =>
        f.type === "blob" &&
        /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|packages\.lock\.json|composer\.lock|bom\.json|sbom\.json)$/.test(
          f.path,
        ) &&
        !/(^|\/)node_modules\//.test(f.path),
    );
    const components = [];
    let skipped = 0;
    const errors = [];
    for (const f of paths.slice(0, 30))
      try {
        const blob = await github(
          repo,
          `/repos/${repo.path}/git/blobs/${encodeURIComponent(f.sha)}`,
          p,
        );
        if (blob.size > 10000000) throw new Error("File exceeds 10 MB limit");
        const result = importInventory(
          JSON.parse(Buffer.from(blob.content, "base64").toString("utf8")),
          f.path,
        );
        components.push(...result.components);
        skipped += result.skipped;
      } catch (e) {
        errors.push(`${f.path}: ${e.message}`);
      }
    if (!paths.length)
      throw new Error(
        "No supported lockfile or SBOM found. Import a resolved inventory locally.",
      );
    if (errors.length)
      throw new Error(
        `Inventory refresh incomplete; previous snapshot retained. ${errors.join("; ")}`,
      );
    if (tree.truncated || paths.length > 30)
      throw new Error(
        "Repository inventory exceeds scan limits. Import a complete SBOM locally; previous snapshot retained.",
      );
    p.detectedInventory = normalizeInventory(components);
    p.inventoryCheckedAt = new Date().toISOString();
    p.inventoryError = skipped
      ? `${skipped} unresolved components skipped; coverage is partial.`
      : "";
  } catch (e) {
    p.inventoryError = e.message;
  }
}
module.exports = {
  normalizeInventory,
  parseInventory,
  importInventory,
  purlComponent,
  refreshInventory,
};
