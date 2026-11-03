import { useEffect, useId, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { GitHubAccessCheck } from "./GitHubAccessCheck";
import type { API, SystemReport } from "./types";
export function StartupChecks({
  api,
  settings = false,
}: {
  api?: API;
  settings?: boolean;
}) {
  const [report, setReport] = useState<SystemReport | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [expanded, setExpanded] = useState(false),
    [dismissed, setDismissed] = useState(false);
  const listId = useId();
  const running = useRef(false);
  const hadIssue = useRef(false);
  const available = typeof api?.systemCheck === "function";
  async function refresh(initial = false) {
    if (!available || running.current) return;
    running.current = true;
    setLoading(true);
    setError("");
    try {
      const result = await api!.systemCheck();
      if (result.checks.some((c) => c.status !== "ready")) {
        hadIssue.current = true;
        setDismissed(false);
      }
      setReport(result);
      if (initial) setExpanded(result.checks.some((c) => c.status !== "ready"));
    } catch (e) {
      hadIssue.current = true;
      setError(e instanceof Error ? e.message : String(e));
      setExpanded(true);
    } finally {
      setLoading(false);
      running.current = false;
    }
  }
  useEffect(() => {
    void refresh(true);
  }, [api]);
  if (!available || (!settings && (!hadIssue.current || dismissed)))
    return null;
  const missing = report?.checks.filter((c) => c.status !== "ready") || [],
    required = missing.filter((c) => c.required);
  return (
    <section
      className={`startup-checks ${required.length ? "startup-blocked" : missing.length || error ? "startup-attention" : "startup-ready"}`}
      aria-label="Startup requirements"
    >
      <div className="startup-header">
        <button
          className="startup-summary"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded(!expanded)}
        >
          {required.length || error ? (
            <AlertTriangle size={17} />
          ) : (
            <ShieldCheck size={17} />
          )}
          <span>
            {!report
              ? "Checking your setup…"
              : required.length
                ? `${required.length} startup requirement${required.length === 1 ? "" : "s"} need attention`
                : missing.length
                  ? `Ready to use · ${missing.length} optional capabilities unavailable`
                  : "Your setup is ready"}
          </span>
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <button
          className="secondary"
          disabled={loading}
          onClick={() => void refresh()}
        >
          <RefreshCw size={13} className={loading ? "spin" : ""} />
          {loading ? "Checking…" : "Check again"}
        </button>
        {!settings && report && !missing.length && !error && !loading && (
          <button
            type="button"
            className="icon-btn"
            aria-label="Dismiss setup confirmation"
            title="Dismiss setup confirmation"
            onClick={() => setDismissed(true)}
          >
            <X size={16} />
          </button>
        )}
      </div>
      <div className="startup-result" role="status" aria-live="polite">
        {!loading && report && (
          <span>
            {missing.length
              ? `${required.length} required issues, ${missing.length - required.length} optional issues.`
              : "All checks passed."}{" "}
            Last checked {new Date(report.checkedAt).toLocaleTimeString()}.
          </span>
        )}
      </div>
      {expanded && (
        <div id={listId} className="startup-check-list">
          {error && (
            <div className="error-banner">
              Could not check this setup: {error}. Use Check again to retry.
            </div>
          )}
          {report?.checks.map((check) => (
            <div
              key={check.id}
              className={`startup-item ${check.status === "ready" ? "check-passed" : "check-missing"}`}
            >
              {check.status === "ready" ? (
                <Check size={16} />
              ) : (
                <AlertTriangle size={16} />
              )}
              <div>
                <h3>
                  {check.name}
                  <span>{check.required ? "Required" : "Optional"}</span>
                  <b>
                    {check.status === "ready" ? "Available" : "Unavailable"}
                  </b>
                </h3>
                <p>{check.detail}</p>
                {check.host && api && !settings && check.status !== "ready" && (
                  <GitHubAccessCheck
                    api={api}
                    host={check.host}
                    saved={() => refresh()}
                  />
                )}
                {check.status !== "ready" && (
                  <p className="startup-remedy">{check.remedy}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
