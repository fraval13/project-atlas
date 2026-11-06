import { RefreshControl } from "./RefreshControl";
import { useEffect, useRef, useState } from "react";
import {
  MoreHorizontal,
  Pencil,
  Pause,
  Play,
  RefreshCw,
  Trash2,
} from "lucide-react";
export function ProjectActions({
  name,
  watching,
  disabled,
  edit,
  toggleWatch,
  refreshReason,
  refresh,
  remove,
}: {
  name: string;
  watching: boolean;
  disabled: boolean;
  edit: () => void;
  toggleWatch: () => void;
  refreshReason: string;
  refresh: () => void;
  remove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    last = useRef(false);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const buttons =
      root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    buttons?.[last.current ? buttons.length - 1 : 0]?.focus();
    last.current = false;
    const outside = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
    };
  }, [open]);
  const actions = [
    { label: "Edit", Icon: Pencil, action: edit },
    {
      label: watching ? "Unwatch" : "Resume watching",
      Icon: watching ? Pause : Play,
      action: toggleWatch,
    },
    { label: "Refresh", Icon: RefreshCw, action: refresh },
    { label: "Delete", Icon: Trash2, action: remove },
  ];
  return (
    <span ref={root} className="project-actions">
      <button
        ref={trigger}
        className="icon-btn"
        aria-label={`Actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            last.current = event.key === "ArrowUp";
            setOpen(true);
          }
        }}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <span
          className="project-action-menu"
          role="menu"
          aria-label={`Actions for ${name}`}
          onKeyDown={(event) => {
            if (event.key === "Escape" || event.key === "Tab") {
              event.preventDefault();
              event.stopPropagation();
              close();
              return;
            }
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const buttons = [
              ...root.current!.querySelectorAll<HTMLButtonElement>(
                '[role="menuitem"]',
              ),
            ];
            const index = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? buttons.length - 1
                  : (index +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      buttons.length) %
                    buttons.length;
            buttons[next]?.focus();
          }}
        >
          {actions.map(({ label, Icon, action }) => (
            <RefreshControl
              key={label}
              reason={label === "Refresh" ? refreshReason : ""}
            >
              <button
                aria-disabled={label === "Refresh" && !!refreshReason}
                type="button"
                role="menuitem"
                className={label === "Delete" ? "project-action-delete" : ""}
                key={label}
                onClick={() => {
                  if (label === "Refresh" && refreshReason) return;
                  close();
                  action();
                }}
              >
                <Icon size={14} />
                {label}
              </button>
            </RefreshControl>
          ))}
        </span>
      )}
    </span>
  );
}
