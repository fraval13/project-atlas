const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseManifest,
  scanFiles,
  scanLocal,
} = require("../electron/technologies.cjs");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
test("detects npm, NuGet, Maven, Python, Rust, CMS and Sanity using manifest parsers", () => {
  assert.deepEqual(
    parseManifest(
      "package.json",
      JSON.stringify({
        dependencies: { react: "19", sanity: "4" },
        devDependencies: { typescript: "5" },
      }),
    ).sort(),
    ["Node.js", "React", "Sanity", "TypeScript"],
  );
  assert.ok(
    parseManifest(
      "app.csproj",
      '<Project><ItemGroup><PackageReference Include="Microsoft.EntityFrameworkCore" Version="9"/></ItemGroup></Project>',
    ).includes("Entity Framework Core"),
  );
  assert.ok(
    parseManifest(
      "pom.xml",
      "<project><dependencies><dependency><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>",
    ).includes("Spring Boot"),
  );
  assert.ok(
    parseManifest("composer.json", '{"require":{"drupal/core":"11"}}').includes(
      "Drupal",
    ),
  );
  assert.ok(
    parseManifest(
      "pyproject.toml",
      '[project]\ndependencies=["fastapi>=1"]\n',
    ).includes("FastAPI"),
  );
  assert.ok(
    parseManifest("Cargo.toml", '[dependencies]\ntokio="1"').includes("Tokio"),
  );
  assert.throws(() =>
    parseManifest(
      "pom.xml",
      '<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///etc/passwd">]><project/>',
    ),
  );
});
test("skips generated manifests and reports partial parsing failures", async () => {
  const read = [];
  const result = await scanFiles(
    [
      "node_modules/x/package.json",
      "apps/web/package.json",
      "bad/package.json",
    ],
    async (file) => {
      read.push(file);
      return file.startsWith("bad")
        ? "broken"
        : '{"dependencies":{"react":"19"}}';
    },
  );
  assert.equal(read.length, 2);
  assert.equal(result.examined, 1);
  assert.ok(result.technologies.includes("React"));
  assert.equal(result.warnings.length, 1);
});
test("local scan skips symlinks and generated directories", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "atlas-tech-"));
  try {
    await fs.writeFile(
      path.join(root, "package.json"),
      '{"dependencies":{"electron":"45"}}',
    );
    await fs.mkdir(path.join(root, "node_modules"));
    await fs.writeFile(path.join(root, "node_modules", "package.json"), "{}");
    if (process.platform !== "win32")
      await fs.symlink("/etc", path.join(root, "external"));
    const result = await scanLocal(root);
    assert.equal(result.examined, 1);
    assert.ok(result.technologies.includes("Electron"));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
