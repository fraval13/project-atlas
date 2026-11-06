function parseRepository(value) {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash)
    throw new Error(
      "Use an HTTPS repository URL without credentials, query parameters or fragments.",
    );
  const parts = u.pathname
    .replace(/\/+$/, "")
    .replace(/\.git$/, "")
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);
  if (
    parts.some(
      (p) => !p || p === "." || p === ".." || /[\\/\x00-\x1f?#]/.test(p),
    )
  )
    throw new Error("Invalid repository path.");
  const enc = (p) => encodeURIComponent(p);
  if (
    u.hostname === "dev.azure.com" ||
    u.hostname.endsWith(".visualstudio.com")
  ) {
    const legacy = u.hostname !== "dev.azure.com";
    const org = legacy
      ? u.hostname.slice(0, -".visualstudio.com".length)
      : parts.shift();
    if (!org || parts.length !== 3 || parts[1] !== "_git" || u.port)
      throw new Error(
        "Use https://dev.azure.com/organization/project/_git/repository.",
      );
    const [project, , name] = parts;
    const scope = `https://dev.azure.com/${enc(org)}`;
    return {
      provider: "azure",
      host: "dev.azure.com",
      scope,
      path: `${enc(org)}/${enc(project)}/${enc(name)}`,
      api: `${scope}/${enc(project)}/_apis/git/repositories/${enc(name)}`,
      web: `${scope}/${enc(project)}/_git/${enc(name)}`,
    };
  }
  if (parts.length !== 2 || !parts.every((p) => /^[\w.-]+$/.test(p)))
    throw new Error(
      "Use a GitHub/Bitbucket owner/repository URL or an Azure DevOps organization/project/_git/repository URL.",
    );
  if (u.hostname === "bitbucket.org" && !u.port)
    return {
      provider: "bitbucket",
      host: u.host,
      scope: u.origin,
      path: parts.join("/"),
      api: "https://api.bitbucket.org/2.0",
      web: `${u.origin}/${parts.join("/")}`,
    };
  return {
    provider: "github",
    host: u.host,
    scope: u.origin,
    path: parts.join("/"),
    api:
      u.host === "github.com" ? "https://api.github.com" : `${u.origin}/api/v3`,
    web: `${u.origin}/${parts.join("/")}`,
  };
}
function accountScope(provider, host) {
  if (typeof host !== "string" || !host.trim())
    throw new Error("Enter a host or organization URL.");
  if (provider === "azure") {
    const u = new URL(
      host.includes("://") ? host : `https://dev.azure.com/${host}`,
    );
    const parts = u.pathname.split("/").filter(Boolean);
    if (
      u.origin !== "https://dev.azure.com" ||
      parts.length !== 1 ||
      u.search ||
      u.hash ||
      u.username ||
      u.password
    )
      throw new Error("Enter https://dev.azure.com/your-organization.");
    return parseRepository(`${u.origin}/${parts[0]}/project/_git/repository`);
  }
  if (!["github", "bitbucket"].includes(provider))
    throw new Error("Unsupported repository provider.");
  const u = new URL(host.includes("://") ? host : `https://${host}`);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.pathname !== "/" ||
    u.search ||
    u.hash
  )
    throw new Error("Enter a host without a path.");
  const repo = parseRepository(`${u.origin}/owner/repository`);
  if (repo.provider !== provider)
    throw new Error("The host does not match the selected provider.");
  return repo;
}
module.exports = { parseRepository, accountScope };
