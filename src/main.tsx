import React, { useEffect, useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  RefreshCw,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  ExternalLink,
  FolderGit2,
  GitBranch,
  GitPullRequest,
  Globe,
  Hourglass,
  LayoutDashboard,
  Loader2,
  MoreHorizontal,
  Plus,
  Radio,
  Search,
  Settings,
  ShieldCheck,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Trash2,
  Wifi,
  X,
} from "lucide-react";
import type { API, Project, State } from "./types";
import { demo } from "./demo";
import { expiration, toLocalInput } from "./expiry";
import { InventoryEditor, ProjectSecurity, SecurityOverview } from "./Security";
import { UpdateBanner } from "./UpdateBanner";
import { TechnologyScan } from "./TechnologyScan";
import { StartupChecks } from "./StartupChecks";
import { initialTheme, type Theme } from "./themes";
import { ThemePicker } from "./ThemePicker";
import "./styles.css";
import "./themes.css";
const empty: State = { version: 1, projects: [], updatedAt: null };
const blank = {
  name: "",
  client: "",
  repo: "",
  url: "",
  notes: "",
  technologies: [] as string[],
  watchSite: true,
  watchRepo: true,
  notify: true,
  authExpiresAt: "",
  warningDays: 7,
  reauthDays: null as number | null,
  usesSaml: false,
};
const ago = (at: string) => {
  const m = Math.max(
    0,
    Math.floor((Date.now() - new Date(at).getTime()) / 60000),
  );
  return m < 1
    ? "Just now"
    : m < 60
      ? `${m}m ago`
      : m < 1440
        ? `${Math.floor(m / 60)}h ago`
        : `${Math.floor(m / 1440)}d ago`;
};
function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const chooseTheme = (next: Theme) => {
    setTheme(next);
    try {
      localStorage.setItem("atlas.theme", next);
    } catch {}
  };
  const [state, setState] = useState<State>(empty),
    [preview, setPreview] = useState(!window.atlas),
    [page, setPage] = useState("Overview"),
    [query, setQuery] = useState(""),
    [scope, setScope] = useState("Watched projects"),
    [status, setStatus] = useState("All statuses"),
    [modal, setModal] = useState<"project" | "settings" | null>(null),
    [editing, setEditing] = useState<Partial<Project>>(blank),
    [selected, setSelected] = useState<Project | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [accounts, setAccounts] = useState<{ host: string; available: boolean }[]>(
      [],
    ),
    [host, setHost] = useState("github.com"),
    [credential, setCredential] = useState("");
  useEffect(() => {
    if (!modal && !selected) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,textarea,select,[tabindex="0"]',
        ) || [],
      );
    focusable()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModal(null);
        setSelected(null);
        setError("");
      }
      if (e.key === "Tab") {
        const items = focusable(),
          first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [modal, selected?.id]);
  const api = window.atlas;
  const [, setClock] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setClock((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);
  const shown = preview ? demo : state;
  useEffect(() => {
    setSelected((old) =>
      old ? shown.projects.find((p) => p.id === old.id) || null : null,
    );
  }, [state, preview]);
  useEffect(() => {
    if (api) {
      api
        .state()
        .then(setState)
        .catch((e) => setError(e.message));
      const id = setInterval(
        () =>
          api
            .state()
            .then(setState)
            .catch(() => {}),
        5000,
      );
      return () => clearInterval(id);
    }
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(id);
  }, [toast]);
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    setLoading(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };
  const requireLive = () => {
    if (!api || preview) {
      setError(
        "This is a sample workspace. Leave preview and open the Electron app to manage real projects.",
      );
      return false;
    }
    return true;
  };
  const filtered = shown.projects.filter(
    (p) =>
      (scope === "All projects" ||
        (scope === "Watched projects"
          ? p.watchSite || p.watchRepo || p.watchSecurity
          : !p.watchSite && !p.watchRepo && !p.watchSecurity)) &&
      (status === "All statuses" || p.status === status.toLowerCase()) &&
      `${p.name} ${p.client} ${[...p.technologies, ...(p.detectedTechnologies || [])].join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const projects = filtered;
  const events = projects
    .flatMap((p) => p.events.map((e) => ({ ...e, project: p })))
    .sort((a, b) => b.at.localeCompare(a.at));
  const prs = projects.flatMap((p) =>
    p.prs.map((pr) => ({ ...pr, project: p })),
  );
  const open = (url: string) => {
    if (preview) {
      setToast("External links are disabled in the sample workspace.");
      return;
    }
    if (api) api.openExternal(url).catch((e) => setError(e.message));
  };
  const edit = (p?: Project) => {
    setEditing(p ? { ...p } : { ...blank });
    setModal("project");
    setError("");
  };
  const settings = () => {
    setModal("settings");
    if (api)
      api
        .accounts()
        .then(setAccounts)
        .catch((e) => setError(e.message));
  };
  return (
    <div className="app">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <span className="brand-mark">
            <LayersLogo />
          </span>
          <span>
            atlas<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace-label">
          YOUR WORKSPACE <span>LOCAL</span>
        </div>
        <nav>
          {[
            [LayoutDashboard, "Overview"],
            [FolderGit2, "Projects"],
            [GitPullRequest, "Pull requests"],
            [Activity, "Activity"],
            [ShieldAlert, "Security"],
          ].map(([Icon, label]) => {
            const I = Icon as typeof Activity;
            return (
              <button
                key={label as string}
                className={page === label ? "nav-item active" : "nav-item"}
                onClick={() => setPage(label as string)}
              >
                <I size={18} />
                {label as string}
                {label === "Pull requests" && (
                  <span className="nav-count">
                    {shown.projects.reduce((n, p) => n + p.prs.length, 0)}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <span className="local-icon">
              <ShieldCheck size={20} />
            </span>
            <b>Your work. Your device.</b>
            <p>Stored locally. Always yours.</p>
            <span className="local-tag">
              <i /> Local workspace
            </span>
          </div>
          <button className="nav-item" onClick={settings}>
            <Settings size={18} />
            Settings & connections
          </button>
          <div className="profile">
            <span className="avatar">YO</span>
            <div>
              <b>Your workspace</b>
              <small>Personal collection</small>
            </div>
            <button
              className="icon-btn"
              aria-label="Open workspace settings"
              onClick={settings}
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} />
            <span>{page}</span>
          </div>
          <div className="topbar-right">
            <span className="local-status">
              <i />
              {preview ? "Sample workspace" : "Local workspace"}
            </span>
            <span className="divider" />
            <button
              className="icon-btn"
              title="Notification preferences"
              onClick={settings}
            >
              <Bell size={17} />
            </button>
            <span className="avatar small">YO</span>
          </div>
        </header>
        <div className="content">
          <UpdateBanner api={api} />
          <StartupChecks api={api} />
          <div className="page-heading">
            <div>
              <div className="eyebrow">A LITTLE PERSPECTIVE ON YOUR WORK</div>
              <h1>
                {page === "Overview"
                  ? "Your projects, in focus."
                  : page === "Projects"
                    ? "A collection of your work."
                    : page === "Security"
                      ? "Know what needs your attention."
                      : page === "Activity"
                        ? "Every project has a story."
                        : "Keep the work moving."}
              </h1>
              <p>
                Everything you’ve built. Everything worth keeping an eye on.
              </p>
            </div>
            <button className="primary" onClick={() => edit()}>
              <Plus size={17} />
              Add project
            </button>
          </div>
          {preview && (
            <div className="preview-banner">
              <Sparkles size={16} />
              <span>
                Design preview · Sample projects and activity. No live checks
                are running.
              </span>
              {api && (
                <button
                  onClick={() => {
                    setPreview(false);
                    setSelected(null);
                  }}
                >
                  Leave preview <ArrowUpRight size={14} />
                </button>
              )}
            </div>
          )}
          {error && (
            <div className="error-banner">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          <section className="stats">
            {[
              [
                Globe,
                "Online",
                projects.filter((p) => p.status === "online").length,
                "Operational websites",
                "green",
              ],
              [
                Radio,
                "Offline",
                projects.filter((p) => p.status === "offline").length,
                "Websites need attention",
                "red",
              ],
              [
                GitPullRequest,
                "Open pull requests",
                prs.length,
                "Across your selected projects",
                "purple",
              ],
              [
                FolderGit2,
                "Projects in view",
                projects.length,
                `${projects.filter((p) => p.status === "unknown").length} with unknown website status`,
                "blue",
              ],
            ].map(([Icon, label, value, description, color]) => {
              const I = Icon as typeof Globe;
              return (
                <div className={`stat ${color}`} key={label as string}>
                  <div className="stat-top">
                    <span>{label as string}</span>
                    <I size={17} />
                  </div>
                  <div className="stat-value">
                    {value as number}
                    <span className="stat-line">
                      {label === "Online" ? (
                        <>
                          <i />
                          All clear
                        </>
                      ) : label === "Offline" && Number(value) > 0 ? (
                        <>
                          <i />
                          Needs a look
                        </>
                      ) : null}
                    </span>
                  </div>
                  <small>{description as string}</small>
                </div>
              );
            })}
          </section>
          {page === "Overview" && (
            <div className="security-strip">
              <ShieldCheck size={16} />
              <span>
                {projects.filter((p) => p.watchSecurity).length} projects
                watching for CVEs ·{" "}
                {projects.reduce(
                  (n, p) => n + (p.security?.findings.length || 0),
                  0,
                )}{" "}
                cached matches
              </span>
              <button onClick={() => setPage("Security")}>
                Security overview <ArrowUpRight size={13} />
              </button>
            </div>
          )}
          <div className="toolbar">
            <div className="view-tabs">
              <button
                className={scope === "Watched projects" ? "chosen" : ""}
                onClick={() => setScope("Watched projects")}
              >
                Watched projects{" "}
                <span>
                  {
                    shown.projects.filter(
                      (p) => p.watchSite || p.watchRepo || p.watchSecurity,
                    ).length
                  }
                </span>
              </button>
              <button
                className={scope === "All projects" ? "chosen" : ""}
                onClick={() => setScope("All projects")}
              >
                All projects
              </button>
              <button
                className={scope === "Unwatched" ? "chosen" : ""}
                onClick={() => setScope("Unwatched")}
              >
                Unwatched
              </button>
            </div>
            <div className="toolbar-actions">
              <label className="search">
                <Search size={15} />
                <input
                  aria-label="Find a project"
                  placeholder="Find a project..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <kbd>⌕</kbd>
              </label>
              <label className="filter">
                <SlidersHorizontal size={14} />
                <select
                  aria-label="Filter by website status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option>All statuses</option>
                  <option>Online</option>
                  <option>Offline</option>
                  <option>Unknown</option>
                </select>
              </label>
            </div>
          </div>
          {page === "Security" && (
            <SecurityOverview
              projects={projects}
              feedInfo={shown.feedInfo}
              loading={loading}
              open={open}
              edit={edit}
              refresh={() => {
                if (requireLive())
                  run(async () => setState(await api!.securityRefresh()));
              }}
              importFeed={() => {
                if (requireLive())
                  run(async () => setState(await api!.importFeed()));
              }}
            />
          )}
          {(page === "Overview" || page === "Projects") && (
            <>
              <div className="section-heading">
                <h2>
                  Your projects <span>{projects.length}</span>
                </h2>
                <div>
                  <span className="refresh-label">
                    {shown.updatedAt
                      ? `Updated ${ago(shown.updatedAt)}`
                      : "Ready when you are"}
                  </span>
                  <button
                    className="icon-btn"
                    aria-label="Refresh monitoring"
                    disabled={loading}
                    onClick={() => {
                      if (requireLive())
                        run(async () => setState(await api!.refresh()));
                    }}
                  >
                    <Activity size={15} className={loading ? "spin" : ""} />
                  </button>
                </div>
              </div>
              <section className="project-grid">
                {projects.map((p, i) => (
                  <article
                    className={`project-card ${p.status === "offline" ? "attention" : ""}`}
                    key={p.id}
                  >
                    <div className="card-top">
                      <span className={`project-icon hue-${i % 4}`}>
                        {p.name.charAt(0)}
                      </span>
                      <span className={`status ${p.status}`}>
                        <i />
                        {p.status === "unknown"
                          ? "Unknown"
                          : p.status === "online"
                            ? "Online"
                            : "Offline"}
                      </span>
                      <button
                        className="icon-btn"
                        title={`View ${p.name}`}
                        onClick={() => setSelected(p)}
                      >
                        <MoreHorizontal size={18} />
                      </button>
                    </div>
                    <button
                      className="project-title"
                      onClick={() => setSelected(p)}
                    >
                      {p.name}
                      <ArrowUpRight size={15} />
                    </button>
                    <div className="client">
                      {p.client || "Personal project"}
                      <span>·</span>
                      {p.repo
                        ? p.repo.split("/").slice(-2).join("/")
                        : "Website only"}
                    </div>
                    <p className="project-description">
                      {p.notes ||
                        "Add the story behind this project and the work you contributed."}
                    </p>
                    <div className="tech-list">
                      {Array.from(
                        new Set([
                          ...p.technologies,
                          ...(p.detectedTechnologies || []),
                        ]),
                      )
                        .slice(0, 4)
                        .map((t) => (
                          <span key={t}>
                            <i className={t.toLowerCase()} />
                            {t}
                          </span>
                        ))}
                      {p.technologies.length === 0 &&
                        !p.detectedTechnologies?.length && (
                          <span>Technologies not added yet</span>
                        )}
                    </div>
                    {p.repo && <ExpiryBadge project={p} />}
                    {p.watchSecurity && (
                      <span
                        className={`security-card-badge ${p.security?.findings.length ? "has-findings" : ""}`}
                      >
                        <ShieldAlert size={12} />
                        {p.security
                          ? `${p.security.findings.length} CVE matches`
                          : "CVE check pending"}
                      </span>
                    )}{" "}
                    {p.repo && (
                      <p className="muted">
                        GitHub:{" "}
                        {!p.watchRepo
                          ? "Paused"
                          : p.access === "connected" || p.access === "public"
                            ? "Monitoring repository"
                            : p.repoError
                              ? "Access needs attention"
                              : "Awaiting first check"}
                      </p>
                    )}
                    <div className="card-footer">
                      <span>
                        <Globe size={13} />
                        {p.status === "online"
                          ? `${p.latency ?? "—"} ms`
                          : p.status === "offline"
                            ? "Check website"
                            : p.checkedAt
                              ? "Unable to verify"
                              : "Awaiting first check"}
                      </span>
                      <div>
                        {p.repo && (
                          <span
                            className={
                              p.access === "connected"
                                ? "pr-count"
                                : "historical"
                            }
                          >
                            <GitPullRequest size={13} />
                            {p.prs.length}
                            {p.access !== "connected" ? " saved" : ""}
                          </span>
                        )}
                        <button
                          className={`watch-toggle ${p.watchRepo || p.watchSite ? "watching" : ""}`}
                          title="Edit monitoring preferences"
                          onClick={() => edit(p)}
                        >
                          <Radio size={13} />
                          {p.watchRepo || p.watchSite ? "Watching" : "Paused"}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </section>
              {projects.length === 0 && (
                <div className="empty">
                  <span className="empty-icon">
                    <FolderGit2 size={28} />
                  </span>
                  <h2>
                    {shown.projects.length
                      ? "No matching projects"
                      : "Your next chapter starts here"}
                  </h2>
                  <p>
                    {shown.projects.length
                      ? "Try a different search or filter."
                      : "Add a website, a GitHub repository, or both. Keep the story of your work in one place."}
                  </p>
                  {shown.projects.length ? (
                    <button
                      className="primary"
                      onClick={() => {
                        setQuery("");
                        setStatus("All statuses");
                        setScope("All projects");
                      }}
                    >
                      Clear search and filters
                    </button>
                  ) : (
                    <button className="primary" onClick={() => edit()}>
                      <Plus size={16} />
                      Add your first project
                    </button>
                  )}
                  {!shown.projects.length && (
                    <button
                      className="text-button"
                      onClick={() => setPreview(true)}
                    >
                      Explore the design with sample projects{" "}
                      <ArrowUpRight size={14} />
                    </button>
                  )}
                </div>
              )}
            </>
          )}
          {(page === "Overview" ||
            page === "Activity" ||
            page === "Pull requests") && (
            <div
              className={`bottom-grid ${page !== "Overview" ? "single" : ""}`}
            >
              {page !== "Pull requests" && (
                <section className="panel">
                  <div className="panel-title">
                    <h2>
                      <Activity size={17} />
                      Recent activity
                    </h2>
                    <button
                      onClick={() =>
                        setPage(page === "Activity" ? "Overview" : "Activity")
                      }
                    >
                      {page === "Activity" ? "Overview" : "View all"}
                      <ArrowUpRight size={13} />
                    </button>
                  </div>
                  <div className="activity-list">
                    {events.slice(0, page === "Activity" ? 100 : 5).map((e) => (
                      <button
                        className="activity-item"
                        key={`${e.project.id}-${e.id}`}
                        onClick={() => setSelected(e.project)}
                      >
                        <span
                          className={`event-icon ${e.kind === "status" ? "event-status" : ""}`}
                        >
                          {e.kind === "status" ? (
                            <Globe size={15} />
                          ) : (
                            <GitBranch size={15} />
                          )}
                        </span>
                        <span className="event-text">
                          <b>{e.text}</b>
                          <small>
                            {e.project.name}
                            {e.project.repo &&
                              e.project.access !== "connected" && (
                                <span className="history-label">
                                  Saved history
                                </span>
                              )}
                          </small>
                        </span>
                        <time>{ago(e.at)}</time>
                      </button>
                    ))}
                    {!events.length && (
                      <div className="panel-empty">
                        Your project timeline will appear after the first
                        monitoring check.
                      </div>
                    )}
                  </div>
                  <div className="panel-footer">
                    <i />A little history, without the noise.
                  </div>
                </section>
              )}
              {page !== "Activity" && (
                <section className="panel">
                  <div className="panel-title">
                    <h2>
                      <GitPullRequest size={17} />
                      Open pull requests <span>{prs.length}</span>
                    </h2>
                    <button
                      onClick={() =>
                        setPage(
                          page === "Pull requests"
                            ? "Overview"
                            : "Pull requests",
                        )
                      }
                    >
                      {page === "Pull requests" ? "Overview" : "View all"}
                      <ArrowUpRight size={13} />
                    </button>
                  </div>
                  <div className="pr-list">
                    {prs
                      .slice(0, page === "Pull requests" ? 100 : 4)
                      .map((pr) => (
                        <div
                          className="pr-item"
                          key={pr.id + "-" + pr.project.id}
                        >
                          <GitPullRequest
                            size={17}
                            className={pr.draft ? "muted" : "purple-text"}
                          />
                          <div>
                            {pr.project.access === "connected" ? (
                              <button onClick={() => open(pr.url)}>
                                {pr.title}
                              </button>
                            ) : (
                              <span className="pr-title">{pr.title}</span>
                            )}
                            <small>
                              {pr.project.name}
                              <span>#{pr.number}</span> · {pr.author}
                            </small>
                          </div>
                          <span className="pr-pill">
                            {pr.project.access !== "connected"
                              ? "Saved"
                              : pr.draft
                                ? "Draft"
                                : "Open"}
                          </span>
                        </div>
                      ))}
                    {!prs.length && (
                      <div className="panel-empty">
                        No open pull requests in your current selection.
                      </div>
                    )}
                  </div>
                  <div className="panel-footer">
                    <ShieldCheck size={12} />
                    Repository history stays here, even after access ends.
                  </div>
                </section>
              )}
            </div>
          )}
          <footer className="workspace-footer">
            <span>
              <span className="tiny-logo">◈</span> A home for the work you’re
              proud of.
            </span>
            <div>
              <button
                onClick={() => {
                  if (requireLive())
                    run(async () => {
                      if (await api!.exportData())
                        setToast("Projects exported without credentials.");
                    });
                }}
              >
                <ArrowUpFromLine size={13} />
                Export workspace
              </button>
              <span>·</span>
              <button
                onClick={() => {
                  if (requireLive())
                    run(async () => {
                      setState(await api!.importData());
                      setToast(
                        "Projects imported. Existing projects preserved.",
                      );
                    });
                }}
              >
                <ArrowDownToLine size={13} />
                Import
              </button>
            </div>
          </footer>
        </div>
      </main>
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-title"
            className="modal detail"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <div className="eyebrow">PROJECT NOTEBOOK</div>
                <h2 id="detail-title">{selected.name}</h2>
              </div>
              <button
                className="icon-btn"
                aria-label="Close project"
                onClick={() => setSelected(null)}
              >
                <X size={20} />
              </button>
            </div>
            <p className="muted">{selected.client || "Personal project"}</p>
            <h3>Your contribution</h3>
            <p className="notes">
              {selected.notes ||
                "No notes yet. Record your role, challenges, and what you delivered."}
            </p>
            <div className="tech-list">
              {Array.from(
                new Set([
                  ...selected.technologies,
                  ...(selected.detectedTechnologies || []),
                ]),
              ).map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            <div className="info-box">
              {selected.url && (
                <p>
                  Website:{" "}
                  {selected.watchSite
                    ? selected.checkedAt
                      ? selected.status
                      : "Awaiting first check"
                    : "Monitoring paused"}
                </p>
              )}
              {selected.repo && (
                <p>
                  GitHub:{" "}
                  {!selected.watchRepo
                    ? "Monitoring paused"
                    : selected.access === "connected" ||
                        selected.access === "public"
                      ? `Monitoring repository${selected.access === "public" ? " · public access" : ""}`
                      : selected.repoError || selected.repoCheckedAt
                        ? "Access needs attention"
                        : "Awaiting first check"}
                  {selected.repoCheckedAt
                    ? ` · Last checked ${new Date(selected.repoCheckedAt).toLocaleString()}`
                    : ""}
                </p>
              )}
              <button
                className="secondary"
                disabled={loading}
                onClick={() => {
                  if (requireLive())
                    run(async () => {
                      setState(await api!.refreshProject(selected.id));
                    });
                }}
              >
                <RefreshCw size={14} />
                Refresh project
              </button>
            </div>
            <div className="detail-links">
              {selected.url && (
                <button
                  className="secondary"
                  onClick={() => open(selected.url)}
                >
                  <Globe size={15} />
                  Open website
                  <ExternalLink size={13} />
                </button>
              )}
              {selected.repo && selected.access === "connected" && (
                <button
                  className="secondary"
                  onClick={() => open(selected.repo)}
                >
                  <Code2 size={15} />
                  Open repository
                  <ExternalLink size={13} />
                </button>
              )}
            </div>
            {selected.repo &&
              (selected.repoError ||
                (selected.access === "disconnected" &&
                  selected.repoCheckedAt)) && (
                <div className="info-box">
                  Repository monitoring needs attention. Your saved history
                  remains available. {selected.repoError}
                </div>
              )}
            {selected.repo && (
              <div className="expiry-info">
                <h3>
                  <Hourglass size={15} />
                  Authentication & reauthentication
                </h3>
                <dl>
                  <dt>Access</dt>
                  <dd>
                    {selected.access === "connected"
                      ? "Authenticated"
                      : selected.access === "public"
                        ? "Public repository · no token required"
                        : "Not authenticated · history preserved"}
                  </dd>
                  {selected.usesSaml && (
                    <>
                      <dt>Reauthentication frequency</dt>
                      <dd>
                        {selected.reauthDays
                          ? `Every ${selected.reauthDays} days (your estimate)`
                          : "Not specified by your organization"}
                      </dd>
                    </>
                  )}
                  <dt>Next expiration</dt>
                  <dd>
                    {expiration(selected)
                      ? new Date(expiration(selected)!.at).toLocaleString()
                      : "Unknown · no expiry provided"}
                  </dd>
                  <dt>Countdown</dt>
                  <dd>
                    {expiration(selected)?.label ||
                      "Set an expected date to enable"}
                  </dd>
                  <dt>Show hourglass</dt>
                  <dd>{selected.warningDays ?? 7} days before expiration</dd>
                </dl>
                <small>
                  {expiration(selected)?.source === "GitHub token expiry"
                    ? selected.usesSaml
                      ? "GitHub reported this token expiry. SAML authorization may expire earlier."
                      : "GitHub reported this token expiry."
                    : selected.usesSaml
                      ? "Manual dates are estimates. Atlas cannot read your identity provider’s session lifetime."
                      : "Connect an account to retrieve token expiry when GitHub provides it."}
                  {selected.repoCheckedAt
                    ? ` Repository last checked ${ago(selected.repoCheckedAt)}.`
                    : ""}
                </small>
                <ExpiryBadge project={selected} />
              </div>
            )}
            {selected.siteError && (
              <div className="info-box">{selected.siteError}</div>
            )}
            <ProjectSecurity project={selected} open={open} />
            <h3>Project history</h3>
            <div className="detail-events">
              {selected.events.map((e) => (
                <p key={e.id}>
                  {e.text}
                  <small>{new Date(e.at).toLocaleString()}</small>
                </p>
              ))}
              {!selected.events.length && (
                <p className="muted">No recorded activity yet.</p>
              )}
            </div>
            <button
              className="primary"
              onClick={() => {
                edit(selected);
                setSelected(null);
              }}
            >
              Edit project & monitoring
            </button>
          </section>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setModal(null);
            setError("");
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <div className="eyebrow">YOUR LOCAL WORKSPACE</div>
                <h2 id="modal-title">
                  {modal === "project"
                    ? editing.id
                      ? "Edit project"
                      : "Add a project"
                    : "Settings & connections"}
                </h2>
              </div>
              <button
                className="icon-btn"
                aria-label="Close dialog"
                onClick={() => {
                  setModal(null);
                  setError("");
                }}
              >
                <X size={20} />
              </button>
            </div>
            {error && <div className="error-banner">{error}</div>}
            {modal === "project" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (requireLive())
                    run(async () => {
                      setState(await api!.saveProject(editing));
                      setModal(null);
                      setToast(
                        "Project saved. Monitoring updates every minute.",
                      );
                    });
                }}
              >
                <div className="form-grid">
                  <label>
                    Project name
                    <input
                      required
                      value={editing.name || ""}
                      placeholder="e.g. Customer portal"
                      onChange={(e) =>
                        setEditing({ ...editing, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Client / organization
                    <input
                      value={editing.client || ""}
                      placeholder="Who did you build it for?"
                      onChange={(e) =>
                        setEditing({ ...editing, client: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label>
                  Website URL <span>optional if a repository is added</span>
                  <input
                    type="url"
                    value={editing.url || ""}
                    placeholder="https://your-project.com"
                    onChange={(e) =>
                      setEditing({ ...editing, url: e.target.value })
                    }
                  />
                </label>
                <label>
                  GitHub repository{" "}
                  <span>optional · GitHub.com or Enterprise</span>
                  <input
                    type="url"
                    value={editing.repo || ""}
                    placeholder="https://github.com/organization/repository"
                    onChange={(e) =>
                      setEditing({ ...editing, repo: e.target.value })
                    }
                  />
                </label>
                <TechnologyScan
                  api={api}
                  repo={editing.repo || ""}
                  apply={(names) =>
                    setEditing({
                      ...editing,
                      technologies: [
                        ...new Set([...(editing.technologies || []), ...names]),
                      ],
                    })
                  }
                />
                <label>
                  Your contribution
                  <textarea
                    rows={3}
                    value={editing.notes || ""}
                    placeholder="What did you build? What are you proud of?"
                    onChange={(e) =>
                      setEditing({ ...editing, notes: e.target.value })
                    }
                  />
                </label>
                <label>
                  Technologies{" "}
                  <span>
                    comma separated · GitHub languages are added automatically
                  </span>
                  <input
                    value={editing.technologies?.join(",") || ""}
                    placeholder="React, TypeScript, PostgreSQL"
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        technologies: e.target.value.split(","),
                      })
                    }
                  />
                </label>
                {editing.repo && (
                  <label className="saml-toggle">
                    <input
                      type="checkbox"
                      checked={!!editing.usesSaml}
                      onChange={(event) =>
                        setEditing({
                          ...editing,
                          usesSaml: event.target.checked,
                          authExpiresAt: event.target.checked
                            ? editing.authExpiresAt
                            : "",
                          reauthDays: event.target.checked
                            ? editing.reauthDays
                            : null,
                        })
                      }
                    />
                    Uses SAML SSO
                  </label>
                )}
                {editing.repo && editing.usesSaml && (
                  <div className="auth-fields">
                    <h3>
                      <Hourglass size={14} /> Authorization reminders
                    </h3>
                    <label>
                      Expected SAML / access expiration{" "}
                      <span>optional · local time</span>
                      <input
                        type="datetime-local"
                        value={toLocalInput(editing.authExpiresAt)}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            authExpiresAt: e.target.value
                              ? new Date(e.target.value).toISOString()
                              : "",
                          })
                        }
                      />
                    </label>
                    <div className="form-grid">
                      <label>
                        Reauthenticate every (days)
                        <input
                          type="number"
                          min="0.01"
                          max="3650"
                          step="0.01"
                          value={editing.reauthDays ?? ""}
                          placeholder="e.g. 30"
                          onChange={(e) =>
                            setEditing({
                              ...editing,
                              reauthDays: e.target.value
                                ? Number(e.target.value)
                                : null,
                            })
                          }
                        />
                      </label>
                      <label>
                        Show hourglass before (days)
                        <input
                          type="number"
                          min="0"
                          max="3650"
                          step="0.01"
                          value={editing.warningDays ?? 7}
                          onChange={(e) =>
                            setEditing({
                              ...editing,
                              warningDays: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                    <small>
                      Use 0.5 days for 12 hours. The interval documents your
                      organization’s policy; enter the next expected expiration
                      above to start the countdown. A successful token check
                      does not renew SAML authorization.
                    </small>
                  </div>
                )}
                <InventoryEditor
                  project={editing}
                  api={preview ? undefined : api}
                  change={(patch) => setEditing({ ...editing, ...patch })}
                  onError={setError}
                />
                <div className="check-list">
                  <label>
                    <input
                      type="checkbox"
                      checked={!!editing.watchSite}
                      onChange={(e) =>
                        setEditing({ ...editing, watchSite: e.target.checked })
                      }
                    />
                    Monitor website availability
                  </label>
                  {editing.repo && (
                    <label>
                      <input
                        type="checkbox"
                        checked={!!editing.watchRepo}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            watchRepo: e.target.checked,
                          })
                        }
                      />
                      Watch repository activity and pull requests
                    </label>
                  )}
                  <label>
                    <input
                      type="checkbox"
                      checked={!!editing.notify}
                      onChange={(e) =>
                        setEditing({ ...editing, notify: e.target.checked })
                      }
                    />
                    Desktop notifications for status changes and new PRs
                  </label>
                </div>
                <div className="form-actions">
                  {editing.id && (
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        if (
                          requireLive() &&
                          confirm("Delete this project and its local history?")
                        )
                          run(async () => {
                            setState(await api!.deleteProject(editing.id!));
                            setModal(null);
                          });
                      }}
                    >
                      <Trash2 size={14} />
                      Delete project
                    </button>
                  )}
                  <button className="primary" disabled={loading}>
                    {loading ? (
                      <Loader2 size={16} className="spin" />
                    ) : (
                      <Check size={16} />
                    )}
                    Save project
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <ThemePicker theme={theme} choose={chooseTheme} />
                <StartupChecks api={api} settings />
                <UpdateBanner api={api} settings />
                <p className="settings-intro">
                  Connect each GitHub host with a personal access token.
                  Credentials are encrypted with your system keyring and never
                  included in exports.
                </p>
                <button
                  className="text-button"
                  onClick={() => {
                    try {
                      const target = new URL(`https://${host}`);
                      if (target.host !== host) throw new Error();
                      open(`${target.origin}/settings/tokens`);
                    } catch {
                      setError("Enter a valid GitHub host first.");
                    }
                  }}
                >
                  Open personal access token settings <ExternalLink size={13} />
                </button>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (requireLive())
                      run(async () => {
                        await api!.connect(host, credential);
                        setCredential("");
                        setAccounts(await api!.accounts());
                        setToast(
                          "Connection saved. Refresh to load repository data.",
                        );
                      });
                  }}
                >
                  <label>
                    GitHub host
                    <input
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      placeholder="github.com or github.company.com"
                    />
                  </label>
                  <label>
                    Personal access token
                    <input
                      type="password"
                      autoComplete="off"
                      value={credential}
                      onChange={(e) => setCredential(e.target.value)}
                      placeholder="Token with repository read access"
                      required
                    />
                  </label>
                  <button className="primary" disabled={loading}>
                    <ShieldCheck size={16} />
                    Save connection
                  </button>
                </form>
                <div className="info-box">
                  <b>Organizations using SAML SSO</b>
                  <p>
                    Authorize your token for the organization in GitHub.
                    Enterprise policies may require administrator approval or
                    periodic reauthorization. Atlas cannot bypass those
                    policies.
                  </p>
                  <button
                    className="text-button"
                    onClick={() =>
                      open(
                        "https://docs.github.com/en/enterprise-cloud@latest/authentication/authenticating-with-single-sign-on/authorizing-a-personal-access-token-for-use-with-single-sign-on",
                      )
                    }
                  >
                    How SSO authorization works <ExternalLink size={13} />
                  </button>
                </div>
                <div className="account-list">
                  {accounts.map((a) => (
                    <div key={a.host}>
                      <span>
                        <i className="connection-dot" />
                        {a.host}
                        <small>
                          {a.available
                            ? "Credential stored securely"
                            : "Keyring unavailable"}
                        </small>
                      </span>
                      <button
                        className="secondary"
                        onClick={() =>
                          run(async () => {
                            setState(await api!.disconnect(a.host));
                            setAccounts(await api!.accounts());
                          })
                        }
                      >
                        Disconnect
                      </button>
                    </div>
                  ))}
                </div>
                <div className="settings-note">
                  <Terminal size={17} />
                  <span>
                    Website checks run every minute; repositories every 5
                    minutes while Atlas is running. Closing the window keeps
                    Atlas in the tray. Use the tray menu to quit.
                  </span>
                </div>
                <button
                  className="secondary"
                  onClick={() => {
                    setPreview(!preview);
                    setModal(null);
                  }}
                >
                  <Sparkles size={15} />
                  {preview
                    ? "Leave design preview"
                    : "Explore sample workspace"}
                </button>
              </div>
            )}
          </section>
        </div>
      )}
      {toast && (
        <div className="toast">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
function ExpiryBadge({ project }: { project: Project }) {
  const expiry = expiration(project);
  return expiry?.warning ? (
    <span
      className={`expiry-badge ${expiry.expired ? "expired" : ""}`}
      title={`${new Date(expiry.at).toLocaleString()} · ${expiry.source}`}
    >
      <Hourglass size={12} />
      {expiry.label}
      {expiry.source === "manual estimate" ? " · estimated" : ""}
    </span>
  ) : null;
}
function LayersLogo() {
  return (
    <svg width="25" height="27" viewBox="0 0 25 27" fill="none">
      <path
        d="M12.5 2 23 8l-10.5 6L2 8 12.5 2Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="m2 13 10.5 6L23 13M2 18l10.5 6L23 18"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
