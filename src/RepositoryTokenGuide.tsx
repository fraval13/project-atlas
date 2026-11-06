import { GitHubTokenGuide } from "./GitHubTokenGuide";
import type { RepositoryProvider } from "./types";
export function RepositoryTokenGuide({
  provider,
}: {
  provider: RepositoryProvider;
}) {
  if (provider === "github") return <GitHubTokenGuide />;
  return (
    <aside
      className="github-token-guide"
      aria-label={`${provider === "azure" ? "Azure DevOps" : "Bitbucket"} token setup guide`}
    >
      <h4>Read-only token permissions</h4>
      {provider === "azure" ? (
        <p>
          Create a personal access token for this organization with{" "}
          <strong>Code (Read)</strong>. This reads repositories, commits, files
          and pull requests. Your organization may require administrator
          approval. Enter an organization URL such as
          https://dev.azure.com/your-organization.
        </p>
      ) : (
        <p>
          Create an Atlassian API token with{" "}
          <strong>read:user:bitbucket</strong>,{" "}
          <strong>read:repository:bitbucket</strong> and{" "}
          <strong>read:pullrequest:bitbucket</strong>. Enter the Atlassian
          account email associated with that token. Use an API token, not your
          account password.
        </p>
      )}
      <p>
        No write permissions are needed. Atlas verifies the account before
        saving; repository access is checked separately during monitoring.
      </p>
    </aside>
  );
}
