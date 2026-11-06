export type UpdateState = {
  phase:
    | "unsupported"
    | "unavailable"
    | "idle"
    | "checking"
    | "available"
    | "current"
    | "downloading"
    | "downloaded"
    | "installing"
    | "error";
  currentVersion: string;
  availableVersion: string;
  percent: number;
  downloaded: boolean;
  error: string;
  channel: string;
};
export type SystemCheck = {
  host?: string;
  id: string;
  name: string;
  status: "ready" | "missing";
  required: boolean;
  detail: string;
  remedy: string;
};
export type SystemReport = { checkedAt: string; checks: SystemCheck[] };
export type Component = {
  ecosystem: string;
  name: string;
  version: string;
  cpe?: string;
  origin?: string;
};
export type Finding = {
  id: string;
  advisory: string;
  source: string;
  url: string;
  title: string;
  severity: string;
  score: number | null;
  at: string;
  package: string;
  ecosystem: string;
  version: string;
  range: string;
  fixed: string;
  confidence: "affected" | "review";
};
export type FeedSource = {
  retryAt?: string;
  warning?: string;
  status?: string;
  checkedAt?: string;
  coverageStart?: string;
  error?: string;
  gap?: string;
};
export type FeedInfo = {
  ghsa?: FeedSource;
  nvd?: FeedSource;
  recordCount?: number;
  syncing?: boolean;
  importedAt?: string;
};
export type Event = {
  id: string;
  kind: string;
  text: string;
  at: string;
  seen?: boolean;
};
export type PR = {
  id: number;
  number: number;
  title: string;
  url: string;
  author: string;
  draft: boolean;
  at: string;
};
export type Project = {
  lastAvailability?: { url: string; kind: "website" | "health"; state: string };
  siteCheckProblem?: boolean;
  monitorKind?: "website" | "health";
  healthStatus?: "healthy" | "unhealthy" | "degraded" | "unknown";
  watchResume?: {
    watchSite: boolean;
    watchRepo: boolean;
    watchSecurity: boolean;
  };
  inventory?: Component[];
  detectedInventory?: Component[];
  inventoryText?: string;
  watchSecurity?: boolean;
  autoInventory?: boolean;
  inventoryCheckedAt?: string;
  inventoryError?: string;
  security?: {
    findings: Finding[];
    componentCount: number;
    unmapped: number;
    checkedAt: string;
    initialized: boolean;
  };
  usesSaml?: boolean;
  authExpiresAt?: string;
  tokenExpiresAt?: string;
  reauthDays?: number | null;
  warningDays?: number;
  repoCheckedAt?: string;
  id: string;
  name: string;
  client: string;
  repo: string;
  url: string;
  notes: string;
  technologies: string[];
  detectedTechnologies?: string[];
  watchSite: boolean;
  watchRepo: boolean;
  notify: boolean;
  status: "online" | "offline" | "unknown";
  access: string;
  events: Event[];
  prs: PR[];
  latency?: number;
  checkedAt?: string;
  siteError?: string;
  repoError?: string;
};
export type State = {
  monitoring?: boolean;
  feedInfo?: FeedInfo;
  version: number;
  projects: Project[];
  updatedAt: string | null;
};
export type TechnologyScan = {
  technologies: string[];
  examined: number;
  warnings: string[];
};
export type API = {
  onMonitoring?: (callback: (active: boolean) => void) => () => void;
  markActivitySeen: (
    groups: { projectId: string; eventIds: string[] }[],
  ) => Promise<State>;
  scanRepositoryTechnologies: (url: string) => Promise<TechnologyScan>;
  scanLocalTechnologies: () => Promise<TechnologyScan | null>;
  updateState: () => Promise<UpdateState>;
  checkUpdate: () => Promise<UpdateState>;
  downloadUpdate: () => Promise<UpdateState>;
  installUpdate: () => Promise<UpdateState>;
  systemCheck: () => Promise<SystemReport>;
  securityRefresh: () => Promise<State>;
  importInventory: () => Promise<{
    components: Component[];
    skipped: number;
  } | null>;
  importFeed: () => Promise<State>;
  state: () => Promise<State>;
  saveProject: (p: Partial<Project>) => Promise<State>;
  deleteProject: (id: string) => Promise<State>;
  refresh: () => Promise<State>;
  refreshProject: (id: string) => Promise<State>;
  accounts: () => Promise<{ host: string; available: boolean }[]>;
  connect: (host: string, token: string) => Promise<boolean>;
  disconnect: (host: string) => Promise<State>;
  exportData: () => Promise<boolean>;
  importData: () => Promise<State>;
  openExternal: (url: string) => Promise<void>;
};
declare global {
  interface Window {
    atlas?: API;
  }
}
