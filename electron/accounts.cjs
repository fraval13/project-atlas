const crypto = require("node:crypto");
const { accountScope } = require("./repository.cjs");
function migrateAccounts(data) {
  if (data?.version === 2 && Array.isArray(data.accounts))
    return data.accounts.filter(
      (a) =>
        a &&
        typeof a.id === "string" &&
        typeof a.encrypted === "string" &&
        ["github", "azure", "bitbucket"].includes(a.provider),
    );
  return Object.entries(data || {}).flatMap(([host, encrypted]) => {
    if (typeof encrypted !== "string") return [];
    try {
      const repo = accountScope("github", host);
      return [
        {
          id: crypto.randomUUID(),
          provider: "github",
          host: repo.host,
          scope: repo.scope,
          label: `Saved account · ${host}`,
          encrypted,
          legacy: true,
        },
      ];
    } catch {
      return [];
    }
  });
}
function createAccounts({ records, decrypt, request }) {
  const preferred = new Map();
  const credential = (a) => {
    try {
      return decrypt(a.encrypted);
    } catch {
      return "";
    }
  };
  const matches = (a, repo) =>
    a.provider === (repo.provider || "github") &&
    a.host === repo.host &&
    (a.provider !== "azure" || a.scope === repo.scope);
  const candidates = (repo) =>
    records().filter((a) => matches(a, repo) && credential(a));
  const list = () =>
    records().map(({ encrypted, legacy, ...a }) => ({
      ...a,
      available: !!credential({ encrypted }),
    }));
  const perform = async (repo, route, project) => {
    const key = `${repo.provider || "github"}:${repo.scope || repo.host}:${repo.path}`;
    const accounts = candidates(repo).sort(
      (a, b) =>
        Number(b.id === preferred.get(key)) -
        Number(a.id === preferred.get(key)),
    );
    let lastError;
    for (const a of [...accounts, null]) {
      const observed = {};
      try {
        const result = await request(repo, route, {
          credential: a ? credential(a) : "",
          username: a?.username || "",
          project: observed,
        });
        if (a) preferred.set(key, a.id);
        if (project) {
          project.tokenExpiresAt = observed.tokenExpiresAt || "";
          if (observed.usesSaml) project.usesSaml = true;
          project.repositoryAccount = a ? a.label : "";
        }
        return result;
      } catch (error) {
        // Retry another scoped account for permission, SSO, expiry and rate-limit failures only.
        if (![401, 403, 404, 429].includes(error.status)) throw error;
        if (observed.usesSaml) error.requiresSaml = true;
        if (!lastError || (a && !lastError.requiresSaml)) lastError = error;
      }
    }
    if (project && lastError?.requiresSaml) project.usesSaml = true;
    throw lastError;
  };
  return { list, candidates, credential, request: perform };
}
module.exports = { migrateAccounts, createAccounts };
