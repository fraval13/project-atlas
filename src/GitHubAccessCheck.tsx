import { useState } from "react";
import { ExternalLink, KeyRound, Loader2 } from "lucide-react";
import type { API } from "./types";

export function GitHubAccessCheck({
  api,
  host,
  saved,
}: {
  api: API;
  host: string;
  saved: () => Promise<void>;
}) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="startup-github-access"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
          await api.connect(host, token);
          setToken("");
          await saved();
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Could not save connection.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <button
        type="button"
        className="text-button"
        onClick={() =>
          void api
            .openExternal(
              `https://${host}/settings/${host === "github.com" ? "personal-access-tokens" : "tokens"}`,
            )
            .catch(() => setError("Could not open token settings."))
        }
      >
        Open personal access token settings <ExternalLink size={13} />
      </button>
      <div className="startup-token-controls">
        <label className="startup-token-field">
          Personal access token for {host}
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste your read-only access token"
            required
          />
        </label>
        <button className="primary startup-token-save" disabled={busy}>
          {busy ? (
            <Loader2 size={15} className="spin" />
          ) : (
            <KeyRound size={15} />
          )}
          {busy ? "Saving…" : "Save connection"}
        </button>
      </div>
      {error && (
        <p className="startup-token-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
