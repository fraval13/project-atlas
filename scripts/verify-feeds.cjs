// Read-only connectivity check. Downloads public advisories without project data.
const { syncGhsa, syncNvd } = require("../electron/security.cjs");
const cache = {
  records: [],
  ghsa: { lastComplete: new Date(Date.now() - 86400000).toISOString() },
};
Promise.all([syncGhsa(cache), syncNvd(cache)])
  .then(() => {
    for (const name of ["ghsa", "nvd"])
      console.log(name, JSON.stringify(cache[name]));
    console.log(`${cache.records.length} public advisory records downloaded.`);
    if (cache.ghsa.status === "error" || cache.nvd.status === "error")
      process.exitCode = 1;
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
