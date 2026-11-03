function verifiedState(project) {
  if (project.monitorKind === "health")
    return ["healthy", "unhealthy", "degraded"].includes(project.healthStatus)
      ? project.healthStatus
      : null;
  return ["online", "offline"].includes(project.status) ? project.status : null;
}
function restoreAvailability(project) {
  const kind = project.monitorKind === "health" ? "health" : "website";
  const snapshot = project.lastAvailability;
  if (
    snapshot?.url === project.url &&
    snapshot.kind === kind &&
    ["online", "offline", "healthy", "unhealthy", "degraded"].includes(
      snapshot.state,
    )
  )
    return snapshot;
  const state = project.checkedAt && verifiedState(project);
  if (state && project.url) {
    project.lastAvailability = { url: project.url, kind, state };
    return project.lastAvailability;
  }
  return null;
}
module.exports = { verifiedState, restoreAvailability };
