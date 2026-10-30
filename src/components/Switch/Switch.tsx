import { useId, type ReactNode } from "react";
import "./Switch.css";

interface Props {
  /** The setting's name. */
  label: ReactNode;
  /** One line explaining the setting, for an ambiguous one. */
  description?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  /** Leading icon, drawn before the label. */
  icon?: ReactNode;
  /** "row" (default) is a full-width list row; "inline" is a compact label + switch. */
  layout?: "row" | "inline";
  title?: string;
}

/**
 * An on/off switch: a real checkbox labeled by its row, so screen readers
 * and taps anywhere on the row both work. The whole row is at least 44px tall.
 */
export function Switch({
  label,
  description,
  checked,
  disabled = false,
  onChange,
  icon,
  layout = "row",
  title,
}: Props) {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <label
      className={`switch switch-${layout}${disabled ? " disabled" : ""}`}
      htmlFor={id}
      title={title}
    >
      {icon && <span className="switch-icon">{icon}</span>}
      <span className="switch-text">
        <span className="switch-label">{label}</span>
        {description && (
          <span className="switch-description" id={descriptionId}>
            {description}
          </span>
        )}
      </span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-describedby={descriptionId}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
    </label>
  );
}
