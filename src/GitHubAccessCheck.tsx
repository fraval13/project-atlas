import { useState } from "react";
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
            .openExternal(`https://${host}/settings/tokens`)
            .catch(() => setError("Could not open token settings."))
        }
      >
        Open personal access token settings
      </button>
      <label>
        Personal access token for {host}
        <input
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Read-only repository access"
          required
        />
      </label>
      <button className="secondary" disabled={busy}>
        {busy ? "Saving…" : "Save connection"}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
