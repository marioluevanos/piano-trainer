import type { ReactNode } from "react";
import "./Stepper.css";

interface Props {
  /** Names the value for screen readers, e.g. "From measure". */
  label: string;
  /** The value as shown, e.g. "2" or "80%". */
  display: ReactNode;
  /** Whether the − button is enabled. */
  canDecrement: boolean;
  /** Whether the + button is enabled. */
  canIncrement: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
  disabled?: boolean;
  /** "lg" makes the value bigger, for the one headline value in a section. */
  size?: "md" | "lg";
}

/**
 * A − value + control. Both loop measures and the speed use it, so the
 * settings drawer has one visual grammar. Each button is at least 44px.
 */
export function Stepper({
  label,
  display,
  canDecrement,
  canIncrement,
  onDecrement,
  onIncrement,
  disabled = false,
  size = "md",
}: Props) {
  return (
    <div
      className={`stepper${size === "lg" ? " lg" : ""}`}
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        className="stepper-button"
        onClick={onDecrement}
        disabled={disabled || !canDecrement}
        aria-label={`Decrease ${label.toLowerCase()}`}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path fill="currentColor" d="M5 11h14v2H5z" />
        </svg>
      </button>
      <output className="stepper-value" aria-live="polite">
        {display}
      </output>
      <button
        type="button"
        className="stepper-button"
        onClick={onIncrement}
        disabled={disabled || !canIncrement}
        aria-label={`Increase ${label.toLowerCase()}`}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />
        </svg>
      </button>
    </div>
  );
}
