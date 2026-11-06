import { useId, type ReactNode } from "react";

export function RefreshControl({
  reason,
  children,
}: {
  reason: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <span
      className="refresh-control"
      tabIndex={reason ? 0 : undefined}
      aria-describedby={reason ? id : undefined}
    >
      {children}
      {reason && (
        <span className="refresh-tooltip" role="tooltip" id={id}>
          {reason}
        </span>
      )}
    </span>
  );
}
