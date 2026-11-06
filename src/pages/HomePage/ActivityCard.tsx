import { Button } from "../../components/Button/Button";
import { ActivityChart } from "../../components/ActivityChart/ActivityChart";
import { FlameIcon } from "../../components/Icons/FlameIcon";
import { StatTile } from "../../components/StatTile/StatTile";
import {
  dayKey,
  formatDuration,
  rangeStats,
  streaks,
  weekDays,
  type Session,
} from "../../practice/activity";
import { sessionSongs, weekdayLabel } from "../../practice/labels";
import "./ActivityCard.css";

interface Props {
  sessions: readonly Session[];
  /** To name the songs of the longest session. */
  songs: readonly { id: string; title: string }[];
  /** Opens the activity page. */
  onOpen: () => void;
}

/** This week's practice at a glance: minutes, streak, longest session and a bar per day. */
export function ActivityCard({ sessions, songs, onOpen }: Props) {
  const today = dayKey(Date.now());
  const days = weekDays(today);
  const stats = rangeStats(sessions, days);
  const { current, best } = streaks(sessions, today);
  const longest = stats.longest;

  return (
    <section className="activity-card">
      <div className="home-section-head">
        <h2>Practice</h2>
        <div className="home-section-tools">
          <Button variant="ghost" size="sm" onClick={onOpen}>
            See all
          </Button>
        </div>
      </div>
      <div className="activity-panel">
        <div className="activity-figures">
          <StatTile
            label="This week"
            value={formatDuration(stats.totalSeconds)}
            hint={
              stats.daysPracticed
                ? `${stats.daysPracticed} of 7 days`
                : "Play a song to start the clock"
            }
            hero
          />
          <StatTile
            label="Streak"
            value={`${current} ${current === 1 ? "day" : "days"}`}
            hint={best > current ? `best ${best}` : undefined}
            icon={current > 0 ? <FlameIcon size={20} /> : undefined}
          />
          <StatTile
            label="Longest session"
            value={longest ? formatDuration(longest.seconds) : "–"}
            hint={
              longest
                ? [weekdayLabel(dayKey(longest.start)), ...sessionSongs(longest, songs)]
                    .slice(0, 2)
                    .join(" · ")
                : undefined
            }
          />
        </div>
        <ActivityChart
          days={days}
          seconds={stats.daySeconds}
          today={today}
          view="week"
        />
      </div>
    </section>
  );
}
