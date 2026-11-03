async function requestGithub(
  repo,
  route,
  { credential = "", project, fetcher = fetch } = {},
) {
  let response;
  try {
    response = await fetcher(`${repo.api}${route}`, {
      headers: {
        Accept: "application/vnd.github+json",
        ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      },
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
  } catch {
    throw new Error(
      "Could not connect to GitHub. Check your network, VPN, host URL, and system certificate trust.",
    );
  }
  const expiry = response.headers.get("github-authentication-token-expiration");
  if (project && expiry && Number.isFinite(Date.parse(expiry)))
    project.tokenExpiresAt = new Date(expiry).toISOString();
  if (!response.ok) {
    let message;
    if (/^required\b/i.test(response.headers.get("x-github-sso") || "")) {
      if (project) project.usesSaml = true;
      message =
        "SAML SSO authorization required. Authorize this token for your organization in GitHub token settings.";
    } else if (response.status === 401)
      message =
        "GitHub token is invalid, expired, or revoked. Replace it in the startup checklist or Settings.";
    else if (response.status === 404)
      message = credential
        ? "GitHub returned 404. Check the repository URL and token access: select the repository owner as Resource owner, include this private repository, grant Contents and Pull requests read access, and check organization approval. A saved token does not guarantee repository access. Outside collaborators on organization repositories need an organization-permitted classic token."
        : "GitHub returned 404. Check the repository URL. Private repositories require a token saved for this GitHub host.";
    else if (
      response.status === 403 &&
      response.headers.get("x-ratelimit-remaining") === "0"
    )
      message = "GitHub API rate limit reached. Try again later.";
    else
      message = `GitHub returned ${response.status}. Check token permissions and organization approval.`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return response.json();
}
module.exports = { requestGithub };
