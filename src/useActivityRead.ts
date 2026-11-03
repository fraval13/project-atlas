import { useEffect, useRef, useState } from "react";
import type { API, Event, Project, State } from "./types";
export type ActivityRow = Event & { project: Project };
export function useActivityRead({
  events,
  viewing,
  preview,
  api,
  update,
  onError,
}: {
  events: ActivityRow[];
  viewing: boolean;
  preview: boolean;
  api?: API;
  update: (state: State) => void;
  onError: (message: string) => void;
}) {
  const [localSeen, setLocalSeen] = useState<Set<string>>(new Set());
  const [foreground, setForeground] = useState(
    () => document.visibilityState !== "hidden" && document.hasFocus(),
  );
  const [generation, setGeneration] = useState(0);
  const pending = useRef(false),
    failed = useRef("");
  const key = (row: ActivityRow) =>
    `${preview ? "sample" : "workspace"}:${row.project.id}:${row.id}`;
  const unread = events.filter(
    (row) => row.seen === false && !localSeen.has(key(row)),
  );
  const signature = JSON.stringify([
    preview,
    unread.map((row) => [row.project.id, row.id]),
  ]);
  useEffect(() => {
    const check = () =>
      setForeground(
        document.visibilityState !== "hidden" && document.hasFocus(),
      );
    window.addEventListener("focus", check);
    window.addEventListener("blur", check);
    document.addEventListener("visibilitychange", check);
    check();
    return () => {
      window.removeEventListener("focus", check);
      window.removeEventListener("blur", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  useEffect(() => {
    if (!viewing || !foreground) {
      failed.current = "";
      return;
    }
    if (!unread.length || pending.current || failed.current === signature)
      return;
    const rows = unread,
      keys = rows.map(key);
    setLocalSeen((old) => new Set([...old, ...keys]));
    if (preview || typeof api?.markActivitySeen !== "function") return;
    const groups = new Map<string, string[]>();
    for (const row of rows) {
      if (!groups.has(row.project.id)) groups.set(row.project.id, []);
      groups.get(row.project.id)!.push(row.id);
    }
    pending.current = true;
    api
      .markActivitySeen(
        [...groups].map(([projectId, eventIds]) => ({ projectId, eventIds })),
      )
      .then(update)
      .catch((error) => {
        failed.current = signature;
        onError(
          error instanceof Error
            ? error.message
            : "Could not save activity read state.",
        );
      })
      .finally(() => {
        pending.current = false;
        setGeneration((value) => value + 1);
        setLocalSeen((old) => {
          const next = new Set(old);
          for (const value of keys) next.delete(value);
          return next;
        });
      });
  }, [viewing, foreground, preview, signature, generation]);
  return unread.length;
}
