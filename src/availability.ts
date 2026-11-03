import type { Project } from "./types";
export function availabilityLabel(project: Project) {
  if (!project.url) return "";
  if (!project.watchSite) return "Paused";
  if (project.monitorKind === "health") {
    if (project.healthStatus === "degraded") return "Degraded";
    if (project.status === "online") return "Healthy";
    if (project.status === "offline") return "Unhealthy";
  }
  if (project.status === "online") return "Online";
  if (project.status === "offline") return "Offline";
  return project.checkedAt ? "Unable to verify" : "Checking";
}
