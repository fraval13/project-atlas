import { useState } from "react";
import { technologyIcons } from "./technology-icons.generated";
export function TechnologyBadge({ name }: { name: string }) {
  const [failed, setFailed] = useState(false);
  const normalized = name
    .toLowerCase()
    .replace(/\+/g, "plus")
    .replace(/#/g, "sharp")
    .replace(/[^a-z0-9]/g, "");
  const icon = Object.hasOwn(technologyIcons, normalized)
    ? technologyIcons[normalized]
    : undefined;
  return (
    <span className="technology-badge">
      {icon && !failed ? (
        <img
          className="technology-icon"
          src={icon}
          alt=""
          aria-hidden="true"
          width={16}
          height={16}
          onError={() => setFailed(true)}
        />
      ) : (
        <i className={`technology-dot ${normalized}`} aria-hidden="true" />
      )}
      <span className="technology-name">{name}</span>
    </span>
  );
}
