const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const asar = require("@electron/asar");
const yaml = require("js-yaml");
const root = path.join(__dirname, ".."),
  output = path.join(root, "release"),
  archive = path.join(output, "linux-unpacked/resources/app.asar");
for (const name of [
  "electron/main.cjs",
  "electron/updates.cjs",
  "electron/identity.cjs",
])
  assert.ok(
    asar
      .extractFile(archive, name)
      .equals(fs.readFileSync(path.join(root, name))),
    `Packaged ${name} differs from source`,
  );
const entries = asar.listPackage(archive);
assert.ok(
  !entries.some((file) => /^\/(?:tests|docs|\.git)(?:\/|$)/.test(file)),
);
assert.ok(
  !entries.some((file) =>
    /\/(?:projects|credentials|security-cache)\.json$/.test(file),
  ),
);
const info = yaml.load(
  fs.readFileSync(path.join(output, "main-linux.yml"), "utf8"),
);
for (const file of info.files) {
  const actual = crypto
    .createHash("sha512")
    .update(fs.readFileSync(path.join(output, file.url)))
    .digest("base64");
  assert.equal(actual, file.sha512, `Update checksum mismatch: ${file.url}`);
}
assert.equal(info.files.length, 4);
if (process.argv.includes("--native")) {
  const files = fs.readdirSync(output),
    rpm = files.find((f) => f.endsWith(".rpm")),
    arch = files.find((f) => f.endsWith(".pkg.tar.zst"));
  console.log(
    execFileSync(
      "rpm",
      [
        "-qp",
        "--queryformat",
        "%{NAME} %{VERSION} %{ARCH}\n",
        path.join(output, rpm),
      ],
      { encoding: "utf8" },
    ),
  );
  const listing = execFileSync("bsdtar", ["-tf", path.join(output, arch)], {
    encoding: "utf8",
  })
    .trim()
    .split("\n");
  const pkgInfo = listing.find((n) => n.replace(/^\.\//, "") === ".PKGINFO");
  const metadata = execFileSync(
    "bsdtar",
    ["-xOf", path.join(output, arch), pkgInfo],
    { encoding: "utf8" },
  );
  assert.match(metadata, /arch = x86_64/);
  assert.match(metadata, /pkgname = project-atlas/);
  console.log(metadata);
  const marker = listing.find((n) => n.endsWith("/resources/package-type"));
  assert.equal(
    execFileSync("bsdtar", ["-xOf", path.join(output, arch), marker], {
      encoding: "utf8",
    }).trim(),
    "pacman",
  );
}
console.log(
  "Packaged sources, archive exclusions, and all four update checksums verified.",
);
