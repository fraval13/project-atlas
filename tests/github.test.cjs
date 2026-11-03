const { test } = require("node:test");
const assert = require("node:assert/strict");
const { requestGithub } = require("../electron/github.cjs");
const repo = { host: "github.com", api: "https://api.github.com" };
const reply = (status, headers = {}, data = {}) =>
  new Response(JSON.stringify(data), { status, headers });
test("private repository 404 gives actionable token permissions without exposing credentials", async () => {
  await assert.rejects(
    requestGithub(repo, "/repos/team/private", {
      credential: "secret-token",
      fetcher: async (url, options) => {
        assert.equal(options.headers.Authorization, "Bearer secret-token");
        assert.equal(options.redirect, "error");
        return reply(404);
      },
    }),
    (error) => {
      assert.equal(error.status, 404);
      assert.match(error.message, /Resource owner/);
      assert.match(error.message, /Contents and Pull requests/);
      assert.doesNotMatch(error.message, /secret-token/);
      return true;
    },
  );
});
test("anonymous requests omit authentication and explain private access", async () => {
  await assert.rejects(
    requestGithub(repo, "/repos/team/private", {
      fetcher: async (_, options) => {
        assert.equal(options.headers.Authorization, undefined);
        return reply(404);
      },
    }),
    /Private repositories require a token/,
  );
});
test("SSO requirements, revoked tokens and rate limits are reported distinctly", async () => {
  const project = {};
  await assert.rejects(
    requestGithub(repo, "/repos/team/private", {
      project,
      fetcher: async () =>
        reply(403, { "x-github-sso": "required; url=https://example.com" }),
    }),
    /SAML SSO/,
  );
  assert.equal(project.usesSaml, true);
  await assert.rejects(
    requestGithub(repo, "/user", { fetcher: async () => reply(401) }),
    /invalid, expired, or revoked/,
  );
  await assert.rejects(
    requestGithub(repo, "/user", {
      fetcher: async () => reply(403, { "x-ratelimit-remaining": "0" }),
    }),
    /rate limit/,
  );
});
test("Enterprise requests stay on the configured host and retain token expiry", async () => {
  const project = {};
  const data = await requestGithub(
    { api: "https://git.example.com/api/v3" },
    "/user",
    {
      credential: "secret",
      project,
      fetcher: async (url) => {
        assert.equal(url, "https://git.example.com/api/v3/user");
        return reply(
          200,
          { "github-authentication-token-expiration": "2027-01-01T00:00:00Z" },
          { login: "example" },
        );
      },
    },
  );
  assert.equal(data.login, "example");
  assert.equal(project.tokenExpiresAt, "2027-01-01T00:00:00.000Z");
});
