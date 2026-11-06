import { useState } from "react";
import { Button } from "../../components/Button/Button";
import { ActivityChart } from "../../components/ActivityChart/ActivityChart";
import { ChevronLeftIcon } from "../../components/Icons/ChevronLeftIcon";
import { ChevronRightIcon } from "../../components/Icons/ChevronRightIcon";
import { FlameIcon } from "../../components/Icons/FlameIcon";
import { StatTile } from "../../components/StatTile/StatTile";
import {
  SESSION_GAP_MS,
  STREAK_MINUTES,
  addDays,
  dayKey,
  dayStart,
  formatDuration,
  monthDays,
  rangeStats,
  streaks,
  weekDays,
  type Session,
} from "../../practice/activity";
import {
  dayLabel,
  rangeLabel,
  sessionSongs,
  sessionTimeLabel,
} from "../../practice/labels";
import "./ActivityPage.css";

type View = "week" | "month";

interface Props {
  sessions: readonly Session[];
  /** To name the songs of each session. */
  songs: readonly { id: string; title: string }[];
  onHome: () => void;
}

/** The day `n` months after (or before) `key`, on the 1st. */
function addMonths(key: string, n: number): string {
  const d = dayStart(key);
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  return dayKey(d.getTime());
}

/** Practice history: a week or month of minutes per day, its figures, and the sessions in it. */
export function ActivityPage({ sessions, songs, onHome }: Props) {
  const today = dayKey(Date.now());
  const [view, setView] = useState<View>("week");
  /** A day inside the range shown. */
  const [anchor, setAnchor] = useState(today);

  const days = view === "week" ? weekDays(anchor) : monthDays(anchor);
  const stats = rangeStats(sessions, days);
  const { current, best } = streaks(sessions, today);
  const inRange = new Set(days);
  const listed = sessions
    .filter((s) => inRange.has(dayKey(s.start)))
    .sort((a, b) => b.start - a.start);
  const isCurrent = inRange.has(today);
  const move = (n: number) =>
    setAnchor(view === "week" ? addDays(anchor, 7 * n) : addMonths(anchor, n));

  return (
    <div className="activity-page">
      <header className="activity-header">
        <Button
          variant="ghost"
          icon
          onClick={onHome}
          aria-label="Back to songs"
          title="Back to songs"
        >
          <ChevronLeftIcon size={22} />
        </Button>
        <h1>Practice activity</h1>
        <div className="activity-view" role="group" aria-label="Range">
          {(["week", "month"] as const).map((v) => (
            <Button
              key={v}
              variant="ghost"
              size="sm"
              active={view === v}
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {v === "week" ? "Week" : "Month"}
            </Button>
          ))}
        </div>
      </header>

      <main className="activity-body">
        <div className="activity-range">
          <Button
            variant="ghost"
            size="sm"
            icon
            onClick={() => move(-1)}
            aria-label={`Previous ${view}`}
          >
            <ChevronLeftIcon size={20} />
          </Button>
          <h2>{rangeLabel(days, view)}</h2>
          <Button
            variant="ghost"
            size="sm"
            icon
            onClick={() => move(1)}
            disabled={isCurrent}
            aria-label={`Next ${view}`}
          >
            <ChevronRightIcon size={20} />
          </Button>
          {!isCurrent && (
            <Button variant="ghost" size="sm" onClick={() => setAnchor(today)}>
              Today
            </Button>
          )}
        </div>

        <div className="activity-figures">
          <StatTile
            label={view === "week" ? "This week" : "This month"}
            value={formatDuration(stats.totalSeconds)}
            hint={`${stats.daysPracticed} of ${days.length} days`}
            hero
          />
          <StatTile
            label="Longest session"
            value={stats.longest ? formatDuration(stats.longest.seconds) : "–"}
            hint={
              stats.longest
                ? [
                    dayLabel(dayKey(stats.longest.start)),
                    ...sessionSongs(stats.longest, songs),
                  ]
                    .slice(0, 2)
                    .join(" · ")
                : undefined
            }
          />
          <StatTile
            label="Streak"
            value={`${current} ${current === 1 ? "day" : "days"}`}
            hint={`best ${best}`}
            icon={current > 0 ? <FlameIcon size={20} /> : undefined}
          />
        </div>

        <ActivityChart
          days={days}
          seconds={stats.daySeconds}
          today={today}
          view={view}
        />
        <p className="activity-hint">
          Time counts while you play; a pause of {SESSION_GAP_MS / 60_000}{" "}
          minutes ends the session. Days with {STREAK_MINUTES} minutes or more
          keep the streak going.
        </p>

        <h2 className="activity-sessions-head">Sessions</h2>
        {listed.length ? (
          <ol className="activity-sessions">
            {listed.map((s) => {
              const titles = sessionSongs(s, songs);
              return (
                <li key={s.start}>
                  <span className="session-when">
                    <strong>{dayLabel(dayKey(s.start))}</strong>
                    <span>{sessionTimeLabel(s)}</span>
                  </span>
                  <span className="session-songs">
                    {titles.length ? titles.join(", ") : "Unknown song"}
                  </span>
                  <span className="session-length">
                    {formatDuration(s.seconds)}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="activity-placeholder">
            {isCurrent
              ? "Play a song and your practice shows up here."
              : `Nothing practiced this ${view}.`}
          </p>
        )}
      </main>
    </div>
  );
}
