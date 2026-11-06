import { useState } from "react";
import { formatDuration, minutesOf } from "../../practice/activity";
import { dayLabel, weekdayLabel } from "../../practice/labels";
import "./ActivityChart.css";

interface Props {
  /** The days shown, in order (a week or a month). */
  days: readonly string[];
  /** Seconds practiced on each day, matching `days`. */
  seconds: readonly number[];
  /** Today's day key, drawn in the accent when it is among `days`. */
  today: string;
  /** A week labels every day by weekday; a month labels the 1st, 8th, 15th… by date. */
  view: "week" | "month";
}

/** The top gridline, in minutes: a round figure above the tallest bar. */
function niceMax(maxMinutes: number): number {
  for (const step of [10, 20, 30, 60]) if (maxMinutes < step) return step;
  return Math.ceil((maxMinutes + 1) / 30) * 30;
}

/** Minutes practiced per day as columns; tap or hover a day for its figure. */
export function ActivityChart({ days, seconds, today, view }: Props) {
  const [picked, setPicked] = useState<number | null>(null);
  const minutes = seconds.map(minutesOf);
  const max = niceMax(Math.max(0, ...minutes));
  const tallest = minutes.indexOf(Math.max(...minutes));
  const todayIndex = days.indexOf(today);
  const shown = picked ?? (todayIndex >= 0 ? todayIndex : null);

  const label = (key: string, i: number) =>
    view === "week" ? weekdayLabel(key) : i % 7 === 0 ? String(i + 1) : "";

  return (
    <figure className={`activity-chart ${view}`}>
      <div className="activity-plot" onPointerLeave={() => setPicked(null)}>
        <div className="activity-gridline top">
          <span>{max} min</span>
        </div>
        <div className="activity-gridline middle">
          <span>{max / 2}</span>
        </div>
        <ol className="activity-bars">
          {days.map((key, i) => {
            const classes = [
              "activity-day",
              i === todayIndex && "today",
              i === shown && "shown",
              minutes[i] === 0 && "empty",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <li key={key} className={classes}>
                <button
                  type="button"
                  aria-label={`${dayLabel(key)}: ${formatDuration(seconds[i])}`}
                  aria-pressed={i === picked}
                  onPointerEnter={() => setPicked(i)}
                  onFocus={() => setPicked(i)}
                  onClick={() => setPicked((p) => (p === i ? null : i))}
                >
                  <span
                    className="activity-bar"
                    style={{ height: `${(minutes[i] / max) * 100}%` }}
                  >
                    {i === tallest && minutes[i] > 0 && (
                      <span className="activity-value">{minutes[i]}</span>
                    )}
                  </span>
                </button>
                <span className="activity-label" aria-hidden="true">
                  {label(key, i)}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <figcaption role="status">
        {shown !== null && (
          <>
            <strong>
              {shown === todayIndex ? "Today" : dayLabel(days[shown])}
            </strong>
            {" · "}
            {formatDuration(seconds[shown])}
          </>
        )}
      </figcaption>
    </figure>
  );
}
