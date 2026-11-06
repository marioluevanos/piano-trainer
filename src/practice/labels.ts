/**
 * Words for the activity views: day and range names, and what a session was.
 * Pure, so the home card and the activity page describe things the same way.
 */
import { dayStart, formatDuration, type Session } from "./activity.ts";

/** "Mon" for a day key. */
export function weekdayLabel(key: string): string {
  return dayStart(key).toLocaleDateString(undefined, { weekday: "short" });
}

/** "Fri, Nov 6" for a day key. */
export function dayLabel(key: string): string {
  return dayStart(key).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** "Nov 2 – 8, 2026" for a week, "November 2026" for a month (from `days`' first and last). */
export function rangeLabel(days: readonly string[], view: "week" | "month"): string {
  const first = dayStart(days[0]);
  if (view === "month")
    return first.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  const last = dayStart(days[days.length - 1]);
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: "short" });
  const end =
    first.getMonth() === last.getMonth()
      ? String(last.getDate())
      : `${month(last)} ${last.getDate()}`;
  return `${month(first)} ${first.getDate()} – ${end}, ${last.getFullYear()}`;
}

/** "10:12 – 10:47" for a session. */
export function sessionTimeLabel(session: Session): string {
  const time = (ms: number) =>
    new Date(ms).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  return `${time(session.start)} – ${time(session.end)}`;
}

/** The titles of the songs a session practiced, for the ids it knows; unknown songs are skipped. */
export function sessionSongs(
  session: Session,
  songs: readonly { id: string; title: string }[],
): string[] {
  return session.songs.flatMap((id) => songs.find((s) => s.id === id)?.title ?? []);
}

/** "35 min · Für Elise" for a session, or "35 min" when its songs are unknown. */
export function sessionSummary(
  session: Session,
  songs: readonly { id: string; title: string }[],
): string {
  const titles = sessionSongs(session, songs);
  return [formatDuration(session.seconds), ...titles.slice(0, 2)].join(" · ");
}
