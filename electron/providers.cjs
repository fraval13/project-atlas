const { requestGithub } = require("./github.cjs");
const labels = {
  github: "GitHub",
  azure: "Azure DevOps",
  bitbucket: "Bitbucket",
};
async function readBounded(response, limit = 20000000) {
  if (Number(response.headers.get("content-length")) > limit)
    throw new Error("Repository response exceeds the size limit.");
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader(),
    chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit)
        throw new Error("Repository response exceeds the size limit.");
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel();
  }
}
async function providerGet(
  repo,
  url,
  { credential = "", username = "", fetcher = fetch, raw = false } = {},
) {
  const target = new URL(url);
  const base = new URL(repo.api);
  // No redirects, arbitrary pagination hosts, cross-organization paths, or userinfo.
  if (
    target.origin !== base.origin ||
    target.username ||
    target.password ||
    target.hash ||
    !(
      target.pathname === base.pathname ||
      target.pathname.startsWith(base.pathname.replace(/\/$/, "") + "/")
    )
  )
    throw new Error("Rejected an unexpected repository API URL.");
  let response;
  try {
    response = await fetcher(target.href, {
      headers: {
        Accept: raw ? "application/octet-stream" : "application/json",
        ...(credential
          ? {
              Authorization:
                repo.provider === "azure" || repo.provider === "bitbucket"
                  ? `Basic ${Buffer.from(`${repo.provider === "azure" ? "" : username}:${credential}`).toString("base64")}`
                  : `Bearer ${credential}`,
            }
          : {}),
      },
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
  } catch {
    throw new Error(
      `Could not connect to ${labels[repo.provider]}. Check your network, VPN and organization URL.`,
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    const error = new Error(
      `${labels[repo.provider]} returned ${response.status}. ${[401, 403, 404].includes(response.status) ? "Check the repository URL, account access, read permissions and organization approval in Settings." : "Try again later."}`,
    );
    error.status = response.status;
    throw error;
  }
  const bytes = await readBounded(response, raw ? 10000000 : 20000000);
  if (raw) return bytes;
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(
      `Unexpected ${labels[repo.provider]} response. Check the organization URL and authentication.`,
    );
  }
}
const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");
async function requestRepository(repo, route, options = {}) {
  if (!repo.provider || repo.provider === "github")
    return requestGithub(repo, route, options);
  const prefix = `/repos/${repo.path}`;
  if (
    !route.startsWith(prefix) ||
    (route.length > prefix.length && !["/", "?"].includes(route[prefix.length]))
  )
    throw new Error("Invalid repository operation.");
  const suffix = route.slice(prefix.length),
    path = suffix.split("?")[0];
  const query = new URLSearchParams(suffix.split("?")[1] || "");
  const get = (url, extra = {}) =>
    providerGet(repo, url, { ...options, ...extra });
  if (repo.provider === "azure") {
    const endpoint = (part, params = {}) =>
      `${repo.api}${part}?${new URLSearchParams({ "api-version": "7.1", ...params })}`;
    if (!path) {
      const info = await get(endpoint(""));
      return {
        default_branch: (info.defaultBranch || "refs/heads/main").replace(
          /^refs\/heads\//,
          "",
        ),
      };
    }
    if (path === "/languages") {
      // Verify repository access even though Azure has no languages endpoint.
      await get(endpoint(""));
      return {};
    }
    if (path === "/pulls") {
      const data = await get(
        endpoint("/pullrequests", {
          "searchCriteria.status": "active",
          $top: "100",
        }),
      );
      if (!Array.isArray(data.value))
        throw new Error("Unexpected Azure pull request response.");
      return data.value.map((pr) => ({
        id: pr.pullRequestId,
        number: pr.pullRequestId,
        title: pr.title,
        html_url: `${repo.web}/pullrequest/${pr.pullRequestId}`,
        user: { login: pr.createdBy?.displayName },
        draft: !!pr.isDraft,
        created_at: pr.creationDate,
      }));
    }
    if (path === "/events") {
      const data = await get(
        endpoint("/commits", { "searchCriteria.$top": "30" }),
      );
      if (!Array.isArray(data.value))
        throw new Error("Unexpected Azure commit response.");
      return data.value.map((c) => ({
        id: `azure:${c.commitId}`,
        actor: { login: c.author?.name },
        type: "CommitEvent",
        created_at: c.author?.date,
      }));
    }
    if (path.startsWith("/git/trees/")) {
      const ref = decodeURIComponent(path.slice("/git/trees/".length));
      const data = await get(
        endpoint("/items", {
          scopePath: "/",
          recursionLevel: "Full",
          includeContentMetadata: "true",
          ...(ref === "HEAD"
            ? {}
            : {
                "versionDescriptor.version": ref,
                "versionDescriptor.versionType": "branch",
              }),
        }),
      );
      if (!Array.isArray(data.value))
        throw new Error("Unexpected Azure repository file list.");
      const truncated = data.value.length > 10000;
      return {
        truncated,
        tree: data.value
          .slice(0, 10000)
          .filter(
            (f) => f.gitObjectType === "blob" && !f.isFolder && !f.isSymLink,
          )
          .map((f) => ({
            type: "blob",
            mode: "100644",
            path: f.path.replace(/^\//, ""),
            sha: f.objectId,
            size: f.size || 0,
          })),
      };
    }
    if (path.startsWith("/git/blobs/")) {
      const sha = decodeURIComponent(path.slice("/git/blobs/".length));
      if (!/^[a-f0-9]{40,64}$/i.test(sha))
        throw new Error("Invalid repository blob.");
      const bytes = await get(endpoint(`/blobs/${sha}`), { raw: true });
      return {
        encoding: "base64",
        content: bytes.toString("base64"),
        size: bytes.length,
      };
    }
    if (path.startsWith("/contents/")) {
      const file = path
        .slice("/contents/".length)
        .split("/")
        .map(decodeURIComponent)
        .join("/");
      const data = await get(
        endpoint("/items", {
          path: `/${file}`,
          includeContent: "true",
          ...(query.get("ref")
            ? {
                "versionDescriptor.version": query.get("ref"),
                "versionDescriptor.versionType": "branch",
              }
            : {}),
        }),
      );
      if (typeof data.content !== "string")
        throw new Error("Repository file content unavailable.");
      const bytes = Buffer.from(data.content);
      return {
        encoding: "base64",
        content: bytes.toString("base64"),
        size: bytes.length,
      };
    }
  }
  if (repo.provider === "bitbucket") {
    const base = `${repo.api}/repositories/${repo.path}`;
    if (!path) {
      const info = await get(base);
      if (!info.mainbranch?.name)
        throw new Error("Repository has no default branch.");
      return { default_branch: info.mainbranch.name };
    }
    if (path === "/languages") {
      const info = await get(base);
      return info.language ? { [info.language]: 1 } : {};
    }
    if (path === "/pulls") {
      let next = `${base}/pullrequests?state=OPEN&pagelen=50`;
      const prs = [];
      for (let page = 0; next && page < 2; page++) {
        if (new URL(next).pathname !== new URL(`${base}/pullrequests`).pathname)
          throw new Error("Rejected unexpected pull request pagination.");
        const data = await get(next);
        if (!Array.isArray(data.values))
          throw new Error("Unexpected Bitbucket pull request response.");
        prs.push(...data.values);
        next = data.next;
      }
      return prs.slice(0, 100).map((pr) => ({
        id: pr.id,
        number: pr.id,
        title: pr.title,
        html_url: `${repo.web}/pull-requests/${pr.id}`,
        user: { login: pr.author?.display_name },
        draft: !!pr.draft,
        created_at: pr.created_on,
      }));
    }
    if (path === "/events") {
      const data = await get(`${base}/commits?pagelen=30`);
      if (!Array.isArray(data.values))
        throw new Error("Unexpected Bitbucket commit response.");
      return data.values.map((c) => ({
        id: `bitbucket:${c.hash}`,
        actor: {
          login: c.author?.user?.display_name || c.author?.raw?.split(" <")[0],
        },
        type: "CommitEvent",
        created_at: c.date,
      }));
    }
    if (path.startsWith("/git/trees/")) {
      const ref = decodeURIComponent(path.slice("/git/trees/".length));
      const branch = ref === "HEAD" ? (await get(base)).mainbranch?.name : ref;
      if (!branch) throw new Error("Repository has no default branch.");
      const info = await get(`${base}/commit/${encodeURIComponent(branch)}`);
      if (!/^[a-f0-9]{40,64}$/i.test(info.hash))
        throw new Error("Invalid Bitbucket commit response.");
      let next = `${base}/src/${info.hash}/?max_depth=8&pagelen=100`,
        tree = [],
        pages = 0,
        depthLimited = false;
      while (next && pages++ < 100) {
        const pageUrl = new URL(next);
        if (
          !pageUrl.pathname.startsWith(
            new URL(`${base}/src/${info.hash}/`).pathname,
          )
        )
          throw new Error("Rejected unexpected repository pagination.");
        const data = await get(next);
        depthLimited ||= data.values?.some(
          (f) => f.type === "commit_directory" && f.path.split("/").length >= 8,
        );
        if (!Array.isArray(data.values))
          throw new Error("Unexpected Bitbucket file list.");
        tree.push(
          ...data.values
            .filter(
              (f) =>
                f.type === "commit_file" &&
                !f.attributes?.some((a) =>
                  ["link", "subrepository"].includes(a),
                ),
            )
            .map((f) => ({
              type: "blob",
              mode: "100644",
              path: f.path,
              sha: `${info.hash}/${f.path}`,
              size: f.size || 0,
            })),
        );
        next = data.next;
      }
      // max_depth bounds recursion; directories at that depth mean the inventory is incomplete.
      return {
        tree,
        truncated: !!next || depthLimited,
      };
    }
    if (path.startsWith("/git/blobs/") || path.startsWith("/contents/")) {
      const blob = path.startsWith("/git/blobs/");
      const value = blob
        ? decodeURIComponent(path.slice("/git/blobs/".length))
        : path
            .slice("/contents/".length)
            .split("/")
            .map(decodeURIComponent)
            .join("/");
      const pieces = value.split("/");
      const ref = blob ? pieces.shift() : query.get("ref") || "HEAD";
      const file = pieces.join("/");
      if (
        !ref ||
        !file ||
        pieces.some(
          (p) => !p || p === "." || p === ".." || /[\\\x00-\x1f]/.test(p),
        )
      )
        throw new Error("Invalid repository file path.");
      if (blob && !/^[a-f0-9]{40,64}$/i.test(ref))
        throw new Error("Invalid repository blob.");
      const bytes = await get(
        `${base}/src/${encodeURIComponent(ref)}/${encodePath(file)}`,
        { raw: true },
      );
      return {
        encoding: "base64",
        content: bytes.toString("base64"),
        size: bytes.length,
      };
    }
  }
  throw new Error("Unsupported repository operation.");
}
async function verifyAccount(repo, credential, username = "", fetcher = fetch) {
  if (repo.provider === "github") {
    const user = await requestGithub(repo, "/user", { credential, fetcher });
    if (!user?.login) throw new Error("GitHub did not return a valid account.");
    return { identity: String(user.id || user.login), label: user.login };
  }
  if (repo.provider === "azure") {
    const info = await providerGet(
      { ...repo, api: repo.scope },
      `${repo.scope}/_apis/connectionData?api-version=7.1-preview.1`,
      { credential, fetcher },
    );
    const user = info.authenticatedUser;
    if (
      !user?.id ||
      !user.providerDisplayName ||
      user.id === "00000000-0000-0000-0000-000000000000"
    )
      throw new Error("Azure DevOps did not return an authenticated account.");
    return { identity: user.id, label: user.providerDisplayName };
  }
  if (!username || !username.includes("@") || /[\r\n:]/.test(username))
    throw new Error(
      "Enter your Atlassian account email for Bitbucket API token authentication.",
    );
  const user = await providerGet(repo, `${repo.api}/user`, {
    credential,
    username,
    fetcher,
  });
  if (!user?.uuid || !user.display_name)
    throw new Error(
      "Bitbucket did not return a valid account. Include read:user:bitbucket permission.",
    );
  return { identity: user.uuid, label: user.display_name };
}
module.exports = { requestRepository, providerGet, verifyAccount, readBounded };
