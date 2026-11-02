import { Check } from "lucide-react";
import { themes, type Theme } from "./themes";
export function ThemePicker({
  theme,
  choose,
}: {
  theme: Theme;
  choose: (value: Theme) => void;
}) {
  return (
    <section className="theme-settings" aria-labelledby="theme-settings-title">
      <h3 id="theme-settings-title">Appearance</h3>
      <p>Choose how Atlas feels. Your layout and tools stay familiar.</p>
      <div className="theme-options">
        {themes.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={theme === option.id}
            className={`theme-option ${theme === option.id ? "theme-selected" : ""}`}
            onClick={() => choose(option.id)}
          >
            <span
              className={`theme-swatch swatch-${option.id}`}
              aria-hidden="true"
            >
              <i />
              <span>
                <b />
                <b />
                <b />
              </span>
            </span>
            <span className="theme-option-title">
              {option.name}
              {theme === option.id && <Check size={13} />}
            </span>
            <small>{option.description}</small>
          </button>
        ))}
      </div>
      <small className="theme-default-hint">
        Elegant is the default on Mac; Atlas is the default on Windows and
        Linux. A saved choice takes priority.
      </small>
    </section>
  );
}
