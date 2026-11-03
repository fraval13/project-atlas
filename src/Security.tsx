import { useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  Download,
  FileJson,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import type { API, Component, FeedInfo, Finding, Project } from "./types";
export const inventoryText = (components: Component[] = []) =>
  components
    .map((c) => [c.ecosystem, c.name, c.version, c.cpe || ""].join(" | "))
    .join("\n");
const presets: Record<string, string> = {
  WordPress: "cms | WordPress | ? | wordpress:wordpress",
  Shopify: "cms | Shopify | ?",
  Wix: "cms | Wix | ?",
  Squarespace: "cms | Squarespace | ?",
  Joomla: "cms | Joomla | ? | joomla:joomla!",
  Drupal: "composer | drupal/core | ? | drupal:drupal",
  Sanity: "npm | sanity | ?\nnpm | @sanity/client | ?",
};
const formatDate = (value?: string) =>
  value ? new Date(value).toLocaleString() : "Not downloaded yet";
export function InventoryEditor({
  project,
  change,
  api,
  onError,
}: {
  project: Partial<Project>;
  change: (p: Partial<Project>) => void;
  api?: API;
  onError: (s: string) => void;
}) {
  const [importing, setImporting] = useState(false);
  const text = project.inventoryText ?? inventoryText(project.inventory);
  const addPreset = (name: string) => {
    change({
      inventoryText: [text, presets[name]].filter(Boolean).join("\n"),
      watchSecurity: true,
    });
  };
  return (
    <div className="inventory-editor">
      <div className="inventory-heading">
        <h3>
          <ShieldCheck size={15} />
          Dependency & CMS inventory
        </h3>
        <button
          type="button"
          className="secondary"
          disabled={importing || !api}
          onClick={async () => {
            if (!api) return;
            setImporting(true);
            try {
              const result = await api.importInventory();
              if (result) {
                change({
                  inventoryText: [text, inventoryText(result.components)]
                    .filter(Boolean)
                    .join("\n"),
                });
                if (result.skipped)
                  onError(
                    `${result.skipped} unresolved components were skipped. Coverage is partial.`,
                  );
              }
            } catch (e) {
              onError(String(e));
            } finally {
              setImporting(false);
            }
          }}
        >
          <ArrowDownToLine size={13} />
          {importing ? "Importing…" : "Import lockfile / SBOM"}
        </button>
      </div>
      <label>
        Versioned inventory
        <textarea
          rows={6}
          value={text}
          spellCheck={false}
          placeholder={
            "npm | lodash | 4.17.20\nnuget | Newtonsoft.Json | 12.0.1\nmaven | org.apache.logging.log4j:log4j-core | 2.14.1\ncms | WordPress | 6.4.0 | wordpress:wordpress"
          }
          onChange={(e) => change({ inventoryText: e.target.value })}
        />
      </label>
      <p className="field-hint">
        One component per line: ecosystem | package | exact version | optional
        CPE vendor:product. Replace ? with the installed version. Names and
        versions stay on your device.
      </p>
      <div className="cms-presets">
        <span>CMS presets</span>
        {Object.keys(presets).map((name) => (
          <button type="button" key={name} onClick={() => addPreset(name)}>
            {name} +
          </button>
        ))}
      </div>
      <div className="check-list">
        <label>
          <input
            type="checkbox"
            checked={!!project.watchSecurity}
            onChange={(e) => change({ watchSecurity: e.target.checked })}
          />
          Match new CVEs against this project locally
        </label>
        {project.repo && (
          <label>
            <input
              type="checkbox"
              checked={project.autoInventory !== false}
              onChange={(e) => change({ autoInventory: e.target.checked })}
            />
            Refresh supported lockfiles and SBOMs from GitHub daily
          </label>
        )}
      </div>
      <p className="field-hint">
        Supports npm, nuget, maven, composer, pip, go, rubygems, rust, cms, and
        other. WordPress plugins need their package identity or exact NVD CPE
        mapping. Hosted Shopify, Wix, and Squarespace versions are usually
        managed by the provider; presets alone cannot establish vulnerability
        coverage.
      </p>
      {project.inventoryError && (
        <div className="info-box">{project.inventoryError}</div>
      )}
    </div>
  );
}
function FindingRow({
  finding,
  project,
  open,
}: {
  finding: Finding;
  project?: Project;
  open: (url: string) => void;
}) {
  return (
    <article className="finding-row">
      <span className={`severity severity-${finding.severity}`}>
        {finding.severity}
        {finding.score !== null ? ` · ${finding.score}` : ""}
      </span>
      <div className="finding-body">
        <button className="finding-title" onClick={() => open(finding.url)}>
          {finding.advisory}
          <ArrowUpRight size={13} />
        </button>
        <p>{finding.title}</p>
        <small>
          {project?.name && <b>{project.name} · </b>}
          {finding.ecosystem} / {finding.package} @ {finding.version}
        </small>
        <small>
          {finding.fixed
            ? `Patched version: ${finding.fixed}`
            : `Affected range: ${finding.range}`}
        </small>
      </div>
      <div className="finding-origin">
        <span
          className={
            finding.confidence === "review" ? "review-label" : "match-label"
          }
        >
          {finding.confidence === "review" ? "Needs review" : "Version match"}
        </span>
        <small>{finding.source}</small>
      </div>
    </article>
  );
}
export function ProjectSecurity({
  project,
  open,
}: {
  project: Project;
  open: (url: string) => void;
}) {
  return (
    <section className="project-security">
      <h3>
        <ShieldAlert size={15} />
        Vulnerability watch
      </h3>
      <p className="field-hint">
        {project.watchSecurity
          ? "Enabled · local advisory matching"
          : "Paused · saved inventory retained"}{" "}
        ·{" "}
        {project.security?.componentCount ??
          (project.inventory?.length || 0) +
            (project.detectedInventory?.length || 0)}{" "}
        components
      </p>
      {project.inventoryCheckedAt && (
        <p className="field-hint">
          Repository inventory refreshed{" "}
          {formatDate(project.inventoryCheckedAt)}
        </p>
      )}
      {project.inventoryError && (
        <div className="info-box">{project.inventoryError}</div>
      )}
      {project.security?.unmapped ? (
        <p className="field-hint">
          {project.security.unmapped} CMS components have no CPE mapping; NVD
          matching is unavailable for those entries.
        </p>
      ) : null}
      <InventorySummary project={project} />
      {project.security?.findings.slice(0, 10).map((f) => (
        <FindingRow key={f.id} finding={f} open={open} />
      ))}
      {!project.security?.findings.length && (
        <p className="muted">
          {project.security?.checkedAt
            ? "No matches in the downloaded advisory cache. This is not a complete historical audit."
            : "No completed check yet. Add exact versions and enable local CVE matching."}
        </p>
      )}
    </section>
  );
}
function InventorySummary({ project }: { project: Project }) {
  const manual = project.inventory || [],
    detected = project.detectedInventory || [];
  return (
    <details className="inventory-details">
      <summary>
        Inventory · {manual.length} manual / {detected.length} discovered
        components
      </summary>
      <div>
        {[...manual, ...detected].slice(0, 500).map((c, i) => (
          <p key={i}>
            <span>{c.ecosystem}</span>
            {c.name}
            <b>{c.version}</b>
            {c.cpe && <small>{c.cpe}</small>}
          </p>
        ))}
        {manual.length + detected.length > 500 && (
          <small>Showing the first 500 components.</small>
        )}
      </div>
    </details>
  );
}
export function SecurityOverview({
  projects,
  feedInfo,
  refresh,
  importFeed,
  loading,
  open,
  edit,
}: {
  projects: Project[];
  feedInfo?: FeedInfo;
  refresh: () => void;
  importFeed: () => void;
  loading: boolean;
  open: (url: string) => void;
  edit: (p: Project) => void;
}) {
  const [severity, setSeverity] = useState("all"),
    [search, setSearch] = useState("");
  const watched = projects.filter((p) => p.watchSecurity);
  const all = watched.flatMap((p) =>
    (p.security?.findings || []).map((f) => ({ finding: f, project: p })),
  );
  const filtered = all
    .filter(
      ({ finding: f, project: p }) =>
        (severity === "all" || f.severity === severity) &&
        `${f.advisory} ${f.package} ${f.title} ${p.name}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        (({ critical: 5, high: 4, medium: 3, low: 2, unknown: 1 })[
          b.finding.severity as "critical"
        ] || 0) -
        ({ critical: 5, high: 4, medium: 3, low: 2, unknown: 1 }[
          a.finding.severity as "critical"
        ] || 0),
    );
  return (
    <div className="security-workspace">
      <div className="security-heading">
        <div>
          <h2>
            <ShieldCheck size={18} />
            Local vulnerability watch
          </h2>
          <p>
            Public advisory updates come in. Your project inventory stays here.
          </p>
        </div>
        <button
          className="secondary"
          disabled={loading || feedInfo?.syncing}
          onClick={refresh}
        >
          <RefreshCw size={14} className={feedInfo?.syncing ? "spin" : ""} />
          {feedInfo?.syncing ? "Updating feeds…" : "Check now"}
        </button>
      </div>
      <div className="security-metrics">
        {[
          ["Projects watching", watched.length],
          [
            "Components inventoried",
            watched.reduce(
              (n, p) =>
                n +
                (p.security?.componentCount ??
                  (p.inventory?.length || 0) +
                    (p.detectedInventory?.length || 0)),
              0,
            ),
          ],
          [
            "Critical / high",
            all.filter(({ finding: f }) =>
              ["critical", "high"].includes(f.severity),
            ).length,
          ],
          [
            "Needs review",
            all.filter(({ finding: f }) => f.confidence === "review").length,
          ],
        ].map(([label, count]) => (
          <div key={label}>
            <small>{label}</small>
            <b>{count}</b>
          </div>
        ))}
      </div>
      <div className="feed-grid">
        {[
          ["GitHub advisory updates", feedInfo?.ghsa],
          ["NVD modified CVE feed", feedInfo?.nvd],
        ].map(([name, value]) => {
          const source = value as FeedInfo["ghsa"];
          return (
            <div className="feed-card" key={name as string}>
              <div>
                <b>{name as string}</b>
                <span
                  className={`feed-status ${source?.status === "ready" ? "ready" : ""}`}
                >
                  {source?.status || "Not synced"}
                </span>
              </div>
              <p>Last download: {formatDate(source?.checkedAt)}</p>
              <p>Cache coverage begins: {formatDate(source?.coverageStart)}</p>
              {source?.error && (
                <p className="feed-error">
                  {source.error} · saved results remain available.
                </p>
              )}
              {source?.retryAt && (
                <p className="feed-error">
                  Next feed retry: {formatDate(source.retryAt)}.
                </p>
              )}
              {source?.warning && (
                <p className="feed-error">{source.warning}</p>
              )}
              {source?.gap && <p className="feed-error">{source.gap}</p>}
            </div>
          );
        })}
      </div>
      <div className="security-coverage">
        <AlertTriangle size={16} />
        <p>
          Matching uses downloaded advisories, not a complete security audit.
          The first sync covers 30 days of GitHub updates and 8 days of NVD
          changes. Import older feeds for historical coverage. Unsupported
          versions, missing CPE mappings, conditional applicability, and stale
          inventories need review. New feed matches generate desktop
          notifications while Atlas runs.
        </p>
      </div>
      <p className="security-cache-stats">
        {feedInfo?.recordCount ?? 0} advisories in the local cache.
        {feedInfo?.importedAt
          ? ` Historical feed imported ${formatDate(feedInfo.importedAt)}.`
          : ""}
      </p>
      <div className="security-controls">
        <label className="search">
          <input
            aria-label="Search vulnerabilities"
            placeholder="Search CVE, package, or project…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter vulnerability severity"
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
        >
          {["all", "critical", "high", "medium", "low", "unknown"].map((s) => (
            <option key={s} value={s}>
              {s === "all"
                ? "All severities"
                : s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <button
          className="secondary"
          disabled={loading || feedInfo?.syncing}
          onClick={importFeed}
        >
          <FileJson size={14} />
          Import historical feed
        </button>
      </div>
      <section className="panel findings-list">
        {filtered.map(({ finding, project }) => (
          <FindingRow
            key={`${project.id}-${finding.id}`}
            finding={finding}
            project={project}
            open={open}
          />
        ))}
        {!filtered.length && (
          <div className="panel-empty">
            <ShieldCheck size={25} />
            <p>
              {all.length
                ? "No matching warnings."
                : "No vulnerability matches in the current cache."}
            </p>
            <small>
              {watched.length
                ? "Check feed freshness, inventory completeness, and version coverage before treating a project as clear."
                : "Enable local CVE matching on a project to start."}
            </small>
          </div>
        )}
      </section>
      <div className="inventory-projects">
        <h2>Inventory & coverage</h2>
        {projects.map((p) => (
          <div key={p.id}>
            <div>
              <b>{p.name}</b>
              <small>
                {p.watchSecurity
                  ? `${p.security?.componentCount ?? (p.inventory?.length || 0) + (p.detectedInventory?.length || 0)} components · ${p.security?.checkedAt ? "Matched " + formatDate(p.security.checkedAt) : "Awaiting first match"}`
                  : "Security watch paused"}
                {p.inventoryError ? ` · ${p.inventoryError}` : ""}
              </small>
            </div>
            <button className="secondary" onClick={() => edit(p)}>
              Manage inventory
            </button>
          </div>
        ))}
      </div>
      <p className="security-attribution">
        Advisory data: GitHub Advisory Database and NIST NVD. This product uses
        data from the NVD API but is not endorsed or certified by the NVD.
        Inventory matching runs entirely on your device.
      </p>
    </div>
  );
}
