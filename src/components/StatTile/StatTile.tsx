import type { ReactNode } from "react";
import "./StatTile.css";

interface Props {
  /** Sentence case, no colon: "This week". */
  label: string;
  /** The figure: "1 h 20 min", "3 days". */
  value: string;
  /** Context under the figure: "best 9", a song title. */
  hint?: string;
  /** An icon beside the value. */
  icon?: ReactNode;
  /** A large figure, one per view. */
  hero?: boolean;
}

/** One figure with its label, for the activity views. */
export function StatTile({ label, value, hint, icon, hero = false }: Props) {
  return (
    <div className={hero ? "stat-tile hero" : "stat-tile"}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {icon}
        {value}
      </span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}
