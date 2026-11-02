const path = require("node:path");
const { spawn } = require("node:child_process");
const readline = require("node:readline/promises");
const { checkDevelopment } = require("../electron/requirements.cjs");
const root = path.join(__dirname, "..");
function printReport(report) {
  console.log("\nAtlas startup check");
  for (const check of report.checks) {
    console.log(
      `${check.status === "ready" ? "OK" : "MISSING"} ${check.name}${check.required ? " [required]" : " [optional]"}: ${check.detail}`,
    );
    if (check.status !== "ready") console.log(`  ${check.remedy}`);
  }
}
async function retry() {
  if (!process.stdin.isTTY) {
    console.error(
      "Fix the listed issues and rerun the same command to check again.",
    );
    return false;
  }
  const prompt = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return (
      (
        await prompt.question(
          "\nPress Enter to check again, or type q to quit: ",
        )
      )
        .trim()
        .toLowerCase() !== "q"
    );
  } finally {
    prompt.close();
  }
}
async function launch(executable, dev) {
  return new Promise((resolve) => {
    let errors = "";
    const child = spawn(executable, [root, ...(dev ? ["--dev"] : [])], {
      cwd: root,
      stdio: ["inherit", "inherit", "pipe"],
    });
    child.stderr.on("data", (data) => {
      process.stderr.write(data);
      errors = (errors + data.toString()).slice(-32000);
    });
    child.on("error", (error) => resolve({ code: 1, errors: error.message }));
    child.on("close", (code) => resolve({ code: code ?? 1, errors }));
    for (const signal of ["SIGINT", "SIGTERM"]) {
      const stop = () => child.kill(signal);
      process.once(signal, stop);
      child.once("close", () => process.removeListener(signal, stop));
    }
  });
}
async function main() {
  const dev = process.argv.includes("--dev"),
    doctor = process.argv.includes("--doctor");
  while (true) {
    const report = await checkDevelopment({ root, dev });
    printReport(report);
    if (report.checks.some((c) => c.required && c.status !== "ready")) {
      if (await retry()) continue;
      process.exitCode = 1;
      return;
    }
    if (doctor) return;
    const result = await launch(report.executable, dev);
    if (result.code === 0) return;
    if (
      /No usable sandbox|SUID sandbox helper|setuid_sandbox_host/i.test(
        result.errors,
      )
    ) {
      console.error(
        "\nMISSING Working Linux Electron sandbox [required]\n  Ask your administrator to configure the Electron sandbox helper or an appropriate AppArmor policy. Sandboxing remains enabled. After fixing it, press Enter to retry.",
      );
      if (await retry()) continue;
    } else
      console.error(
        "\nElectron could not start. Check the launch error above; rerun after correcting it.",
      );
    process.exitCode = result.code;
    return;
  }
}
main().catch((error) => {
  console.error("Startup check failed:", error.message);
  process.exitCode = 1;
});
