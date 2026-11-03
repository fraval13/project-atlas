function markActivitySeen(projects, groups) {
  if (!Array.isArray(groups) || groups.length > 1000)
    throw new Error("Invalid activity selection.");
  const selected = new Map();
  for (const group of groups) {
    if (
      !group ||
      typeof group.projectId !== "string" ||
      group.projectId.length > 100 ||
      !Array.isArray(group.eventIds) ||
      group.eventIds.length > 100 ||
      group.eventIds.some((id) => typeof id !== "string" || id.length > 300)
    )
      throw new Error("Invalid activity selection.");
    if (!selected.has(group.projectId))
      selected.set(group.projectId, new Set());
    for (const id of group.eventIds) selected.get(group.projectId).add(id);
  }
  const changed = [];
  for (const project of projects) {
    const ids = selected.get(project.id);
    if (!ids) continue;
    for (const event of project.events) {
      if (ids.has(event.id) && event.seen !== true) {
        changed.push({ event, previous: event.seen });
        event.seen = true;
      }
    }
  }
  return changed;
}
module.exports = { markActivitySeen };
