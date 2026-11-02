import type { Project } from "./types";
export function expiration(
  p: Pick<Project, "authExpiresAt" | "tokenExpiresAt" | "warningDays">,
  now = Date.now(),
) {
  const candidates = [
    { at: p.authExpiresAt, source: "manual estimate" },
    { at: p.tokenExpiresAt, source: "GitHub token expiry" },
  ].filter((x) => x.at && Number.isFinite(Date.parse(x.at)));
  if (!candidates.length) return null;
  candidates.sort((a, b) => Date.parse(a.at!) - Date.parse(b.at!));
  const deadline = candidates[0];
  const remaining = Date.parse(deadline.at!) - now;
  const minutes = Math.max(0, Math.ceil(remaining / 60000));
  const days = Math.floor(minutes / 1440),
    hours = Math.floor((minutes % 1440) / 60),
    mins = minutes % 60;
  return {
    at: deadline.at!,
    source: deadline.source,
    expired: remaining <= 0,
    warning: remaining <= (p.warningDays ?? 7) * 86400000,
    label:
      remaining <= 0
        ? "Authorization due"
        : days > 0
          ? `${days}d ${hours}h remaining`
          : hours > 0
            ? `${hours}h ${mins}m remaining`
            : `${mins}m remaining`,
  };
}
export function toLocalInput(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
