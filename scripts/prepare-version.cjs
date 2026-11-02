const fs = require("node:fs");
const path = require("node:path");
const semver = require("semver");
function mainVersion(base, run) {
  if (!/^\d+$/.test(String(run)))
    throw new Error("A numeric build number is required.");
  const parsed = semver.parse(base);
  if (!parsed) throw new Error("Invalid base version");
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}-main.${run}`;
}
function prepare() {
  const root = path.join(__dirname, ".."),
    file = path.join(root, "package.json"),
    pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  const onMain = process.env.GITHUB_REF === "refs/heads/main";
  const version = onMain
    ? mainVersion(pkg.version, process.env.GITHUB_RUN_NUMBER)
    : pkg.version;
  if (onMain) {
    pkg.version = version;
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
    const lockFile = path.join(root, "package-lock.json"),
      lock = JSON.parse(fs.readFileSync(lockFile, "utf8"));
    lock.version = version;
    lock.packages[""].version = version;
    fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2) + "\n");
  }
  const credentials = [
    "MAC_CSC_LINK",
    "WIN_CSC_LINK",
    "APPLE_ID",
    "APPLE_APP_SPECIFIC_PASSWORD",
    "APPLE_TEAM_ID",
  ].every((name) => !!process.env[name]);
  const mainPush = onMain && process.env.GITHUB_EVENT_NAME === "push";
  const signed = process.env.SIGNED === "true" || (mainPush && credentials);
  const publish = mainPush && credentials;
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `version=${version}\nsigned=${signed}\npublish=${publish}\n`,
    );
  console.log(`Version ${version}; signed=${signed}; publish=${publish}`);
  if (onMain && !credentials)
    console.log(
      "Main installers will be built for review. Publishing update releases requires Windows/macOS signing and Apple notarization secrets.",
    );
  return version;
}
if (require.main === module) prepare();
module.exports = { mainVersion };
