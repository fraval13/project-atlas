export function GitHubTokenGuide() {
  return (
    <aside className="github-token-guide" aria-label="GitHub token setup guide">
      <h4>Fine-grained token permissions</h4>
      <dl className="github-token-permissions">
        <div>
          <dt>
            Contents <span>Read-only</span>
          </dt>
          <dd>Read manifests and lockfiles for technologies and CVE checks.</dd>
        </div>
        <div>
          <dt>
            Pull requests <span>Read-only</span>
          </dt>
          <dd>List open pull requests.</dd>
        </div>
        <div>
          <dt>
            Metadata <span>Read-only</span>
          </dt>
          <dd>
            Basic repository information; included automatically by GitHub.
          </dd>
        </div>
      </dl>
      <p>
        <strong>
          “All repositories” selects repositories, not permissions.
        </strong>{" "}
        Contents access is still required to read their files. No write
        permissions are needed.
      </p>
      <details>
        <summary>How to set up the token</summary>
        <ol>
          <li>
            On GitHub, choose the correct <strong>Resource owner</strong>.
          </li>
          <li>
            Select the repositories Atlas should monitor, then grant the
            read-only permissions above.
          </li>
          <li>
            Save the token settings. Organization-owned tokens may need
            administrator approval before private access works.
          </li>
          <li>
            Paste a newly created token into Atlas and save the connection, then
            choose <strong>Refresh project</strong>.
          </li>
        </ol>
        <p>
          Editing permissions keeps the existing token string. Replace the token
          in Atlas only when creating or regenerating it.
        </p>
        <p>
          For classic tokens, private repository access requires the{" "}
          <code>repo</code> scope and SSO authorization where enforced. Outside
          collaborators on organization repositories may need a classic token
          permitted by that organization.
        </p>
      </details>
    </aside>
  );
}
