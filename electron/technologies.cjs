const fs = require("node:fs/promises");
const path = require("node:path");
const { XMLParser } = require("fast-xml-parser");
const { parse: toml } = require("smol-toml");
const names = {
  react: "React",
  next: "Next.js",
  vue: "Vue",
  nuxt: "Nuxt",
  svelte: "Svelte",
  "@angular/core": "Angular",
  express: "Express",
  "@nestjs/core": "NestJS",
  electron: "Electron",
  typescript: "TypeScript",
  vite: "Vite",
  prisma: "Prisma",
  pg: "PostgreSQL",
  mysql2: "MySQL",
  mongodb: "MongoDB",
  redis: "Redis",
  sanity: "Sanity",
  "@sanity/client": "Sanity",
  "drupal/core": "Drupal",
  "joomla/joomla-cms": "Joomla",
  "laravel/framework": "Laravel",
  "symfony/framework-bundle": "Symfony",
  django: "Django",
  flask: "Flask",
  fastapi: "FastAPI",
  rails: "Rails",
  "spring-boot-starter": "Spring Boot",
  "spring-boot-starter-web": "Spring Boot",
  "microsoft.aspnetcore.app": "ASP.NET Core",
  "microsoft.entityframeworkcore": "Entity Framework Core",
  tokio: "Tokio",
  serde: "Serde",
};
const skipped = new Set([
  "node_modules",
  ".git",
  "vendor",
  "bin",
  "obj",
  "dist",
  "build",
  ".next",
  "target",
  ".venv",
  "venv",
]);
function candidate(file) {
  return (
    /(^|\/)(package.json|composer.json|pom.xml|packages.config|Directory.Packages.props|pyproject.toml|Cargo.toml|go.mod|Gemfile|requirements[^/]*\.txt|build.gradle(?:.kts)?|Dockerfile(?:\.[^/]*)?|[^/]+\.csproj)$/.test(
      file,
    ) && !file.split("/").some((p) => skipped.has(p))
  );
}
function parseManifest(file, content) {
  const found = new Set();
  const add = (value) => found.add(value);
  const dependencies = (values) => {
    for (const value of values) {
      const lower = value.toLowerCase();
      if (names[lower]) add(names[lower]);
      if (lower.startsWith("@storybook/")) add("Storybook");
      if (lower.startsWith("drupal/")) add("Drupal");
      if (lower.startsWith("microsoft.aspnetcore.")) add("ASP.NET Core");
      if (lower.startsWith("org.springframework.boot:")) add("Spring Boot");
    }
  };
  const base = path.posix.basename(file);
  if (base === "package.json" || base === "composer.json") {
    const data = JSON.parse(content);
    add(base === "package.json" ? "Node.js" : "PHP");
    dependencies(
      Object.keys({
        ...data.dependencies,
        ...data.devDependencies,
        ...data.peerDependencies,
        ...data.require,
        ...data["require-dev"],
      }),
    );
  } else if (/\.csproj$|\.props$|packages.config$|pom.xml$/.test(base)) {
    if (/<!DOCTYPE|<!ENTITY/i.test(content))
      throw new Error("XML declarations are unsupported");
    const data = new XMLParser({
      ignoreAttributes: false,
      processEntities: false,
    }).parse(content);
    add(base === "pom.xml" ? "Java" : ".NET");
    function walk(value) {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        if (["PackageReference", "PackageVersion", "package"].includes(key))
          for (const item of [child].flat()) {
            dependencies([
              String(
                item?.["@_Include"] ||
                  item?.["@_Update"] ||
                  item?.["@_id"] ||
                  "",
              ),
            ]);
          }
        if (key === "artifactId" && typeof child === "string")
          dependencies([child]);
        if (
          key === "TargetFramework" &&
          typeof child === "string" &&
          child.startsWith("net")
        )
          add("C#");
        walk(child);
      }
    }
    walk(data);
  } else if (base === "pyproject.toml" || base === "Cargo.toml") {
    const data = toml(content);
    add(base === "Cargo.toml" ? "Rust" : "Python");
    dependencies(
      Object.keys({
        ...data.dependencies,
        ...data["dev-dependencies"],
        ...data.tool?.poetry?.dependencies,
      }),
    );
    dependencies(
      (data.project?.dependencies || []).map((s) => s.split(/[\s[<=>!~]/)[0]),
    );
  } else if (base.startsWith("requirements")) {
    add("Python");
    dependencies(
      content.split("\n").map((s) => s.trim().split(/[\s[<=>!~]/)[0]),
    );
  } else if (base.startsWith("build.gradle")) {
    add("Java");
    add("Gradle");
    if (content.includes("org.springframework.boot")) add("Spring Boot");
    if (base.endsWith(".kts")) add("Kotlin");
  } else if (base === "go.mod") add("Go");
  else if (base === "Gemfile") {
    add("Ruby");
    if (/['"]rails['"]/.test(content)) add("Rails");
  } else if (base.startsWith("Dockerfile")) add("Docker");
  return [...found];
}
async function scanFiles(files, read) {
  const technologies = new Set(),
    warnings = [];
  let examined = 0;
  const candidates = files.filter(candidate).sort();
  if (candidates.length > 80) warnings.push("Scan limited to 80 manifests.");
  for (const file of candidates.slice(0, 80))
    try {
      const content = await read(file);
      if (Buffer.byteLength(content) > 1000000) throw new Error();
      parseManifest(file, content).forEach((t) => technologies.add(t));
      examined++;
    } catch {
      warnings.push(`Could not read or parse ${file}.`);
    }
  return { technologies: [...technologies].sort(), examined, warnings };
}
async function scanRepository(repo, github, project) {
  const info = await github(repo, `/repos/${repo.path}`, project);
  const tree = await github(
    repo,
    `/repos/${repo.path}/git/trees/${encodeURIComponent(info.default_branch)}?recursive=1`,
    project,
  );
  if (!Array.isArray(tree.tree))
    throw new Error("Unexpected repository file list.");
  const files = tree.tree
    .filter(
      (f) => f.type === "blob" && f.mode !== "120000" && f.size <= 1000000,
    )
    .map((f) => f.path);
  const result = await scanFiles(files, async (file) => {
    const data = await github(
      repo,
      `/repos/${repo.path}/contents/${file.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(info.default_branch)}`,
      project,
    );
    if (
      data.size > 1000000 ||
      data.encoding !== "base64" ||
      typeof data.content !== "string"
    )
      throw new Error();
    return Buffer.from(data.content, "base64").toString("utf8");
  });
  if (tree.truncated)
    result.warnings.push(
      "The repository provider returned a partial file list.",
    );
  return result;
}
async function scanLocal(directory) {
  const files = [];
  let entries = 0,
    limited = false;
  async function walk(relative = "", depth = 0) {
    if (depth > 8) {
      limited = true;
      return;
    }
    for (const item of await fs.readdir(path.join(directory, relative), {
      withFileTypes: true,
    })) {
      if (++entries > 10000) {
        limited = true;
        return;
      }
      if (item.isSymbolicLink() || skipped.has(item.name)) continue;
      const name = relative ? `${relative}/${item.name}` : item.name;
      if (item.isDirectory()) await walk(name, depth + 1);
      else if (item.isFile() && candidate(name)) files.push(name);
    }
  }
  await walk();
  const result = await scanFiles(files, async (file) => {
    const target = path.join(directory, file);
    const real = await fs.realpath(target);
    if (!real.startsWith((await fs.realpath(directory)) + path.sep))
      throw new Error();
    const stat = await fs.stat(real);
    if (stat.size > 1000000) throw new Error();
    return fs.readFile(real, "utf8");
  });
  if (limited)
    result.warnings.push("Folder scan reached its depth or file limit.");
  return result;
}
module.exports = { parseManifest, scanFiles, scanRepository, scanLocal };
