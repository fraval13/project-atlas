import type { RepositoryProvider } from "./types";
export const providerNames = {
  github: "GitHub",
  azure: "Azure DevOps",
  bitbucket: "Bitbucket",
};
export function providerFor(url: string): RepositoryProvider {
  try {
    const host = new URL(url).hostname;
    return host === "bitbucket.org"
      ? "bitbucket"
      : host === "dev.azure.com" || host.endsWith(".visualstudio.com")
        ? "azure"
        : "github";
  } catch {
    return "github";
  }
}
export function tokenSettings(provider: RepositoryProvider, host: string) {
  if (provider === "bitbucket")
    return "https://id.atlassian.com/manage-profile/security/api-tokens";
  const u = new URL(host.includes("://") ? host : `https://${host}`);
  if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash)
    throw new Error("Enter a valid host.");
  if (provider === "azure") {
    const org = u.hostname.endsWith(".visualstudio.com")
      ? u.hostname.split(".")[0]
      : u.pathname.split("/").filter(Boolean)[0];
    if (
      !org ||
      !(
        u.hostname === "dev.azure.com" ||
        u.hostname.endsWith(".visualstudio.com")
      )
    )
      throw new Error("Enter an Azure organization URL.");
    return `https://dev.azure.com/${encodeURIComponent(decodeURIComponent(org))}/_usersSettings/tokens`;
  }
  return `${u.origin}/settings/${u.host === "github.com" ? "personal-access-tokens" : "tokens"}`;
}
