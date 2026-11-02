import { useEffect, useState } from "react";
import { ArrowDownToLine, Check, RefreshCw, AlertTriangle } from "lucide-react";
import type { API, UpdateState } from "./types";
export function UpdateBanner({
  api,
  settings = false,
}: {
  api?: API;
  settings?: boolean;
}) {
  const [state, setState] = useState<UpdateState | null>(null),
    [busy, setBusy] = useState(false);
  const available = typeof api?.updateState === "function";
  useEffect(() => {
    if (!available) return;
    let active = true;
    const read = () =>
      api!
        .updateState()
        .then((value) => {
          if (active) setState(value);
        })
        .catch(() => {});
    void read();
    const timer = setInterval(read, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api]);
  async function action(
    name: "checkUpdate" | "downloadUpdate" | "installUpdate",
  ) {
    if (!api || busy) return;
    setBusy(true);
    try {
      setState(await api[name]());
    } catch (error) {
      setState((old) =>
        old
          ? {
              ...old,
              phase: "error",
              error: error instanceof Error ? error.message : String(error),
            }
          : old,
      );
    } finally {
      setBusy(false);
    }
  }
  if (!available || !state) return null;
  const visible = [
    "available",
    "downloading",
    "downloaded",
    "installing",
    "error",
  ].includes(state.phase);
  if (!settings && !visible) return null;
  return (
    <section
      className={`update-banner ${state.phase === "error" ? "update-error" : ""}`}
      aria-label={settings ? "Application updates" : "Atlas update"}
    >
      <div className="update-message">
        {state.phase === "error" ? (
          <AlertTriangle size={18} />
        ) : state.downloaded ? (
          <Check size={18} />
        ) : (
          <RefreshCw
            size={18}
            className={
              ["checking", "downloading", "installing"].includes(state.phase)
                ? "spin"
                : ""
            }
          />
        )}
        <div>
          <b>
            {state.phase === "unsupported"
              ? "Updates are available in installed builds"
              : state.phase === "error"
                ? "The update could not complete"
                : state.phase === "checking"
                  ? "Checking for updates…"
                  : state.phase === "downloading"
                    ? `Downloading Atlas ${state.availableVersion} · ${Math.floor(state.percent)}%`
                    : state.phase === "installing"
                      ? "Installing update…"
                      : state.downloaded
                        ? `Atlas ${state.availableVersion} is ready`
                        : state.phase === "available"
                          ? `Atlas ${state.availableVersion} is available`
                          : "Atlas updates"}
          </b>
          <small>
            {state.error ||
              (state.phase === "unsupported"
                ? "Run an installed package to receive main-branch updates."
                : state.downloaded
                  ? "Restart when you are ready. Linux packages may request administrator approval."
                  : `Installed: ${state.currentVersion} · Updates from successful main builds.`)}
          </small>
        </div>
      </div>
      <div className="update-actions">
        {state.downloaded && state.phase !== "installing" ? (
          <button
            className="primary"
            disabled={busy}
            onClick={() => void action("installUpdate")}
          >
            <RefreshCw size={14} />
            Restart to update
          </button>
        ) : state.phase === "available" ||
          (state.phase === "error" && !!state.availableVersion) ? (
          <button
            className="primary"
            disabled={busy}
            onClick={() => void action("downloadUpdate")}
          >
            <ArrowDownToLine size={14} />
            {state.phase === "error" ? "Retry download" : "Download update"}
          </button>
        ) : state.phase !== "unsupported" &&
          state.phase !== "installing" &&
          state.phase !== "downloading" ? (
          <button
            className="secondary"
            disabled={busy || state.phase === "checking"}
            onClick={() => void action("checkUpdate")}
          >
            Check for updates
          </button>
        ) : null}
      </div>
      {state.phase === "downloading" && (
        <progress
          max={100}
          value={state.percent}
          aria-label="Update download progress"
        />
      )}
    </section>
  );
}
