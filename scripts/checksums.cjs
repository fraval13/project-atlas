const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const directory = path.join(__dirname, "../release");
const files = fs
  .readdirSync(directory)
  .filter((name) =>
    /\.(exe|dmg|zip|deb|rpm|pkg\.tar\.zst|AppImage)$/.test(name),
  )
  .sort();
if (!files.length) throw new Error("No installer artifacts found.");
const lines = files.map(
  (name) =>
    `${crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(directory, name)))
      .digest("hex")}  ${name}`,
);
fs.writeFileSync(
  path.join(directory, "SHA256SUMS.txt"),
  lines.join("\n") + "\n",
);
console.log(`Generated checksums for ${files.length} installers.`);
