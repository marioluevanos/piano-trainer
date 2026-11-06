/**
 * Practice activity: how long the player has been practicing, counted from
 * the notes they play rather than from a button.
 *
 * A note keeps the clock running for `IDLE_WINDOW_MS`; reading the next phrase
 * still counts, walking away does not. Notes closer together than
 * `SESSION_GAP_MS` belong to one session; a longer silence starts a new one.
 * Sessions are what gets stored, keyed by their start time, and the weekly and
 * monthly figures, streaks and longest session are derived from them here.
 *
 * DOM-free so it runs directly under Node in tests. Days are local calendar
 * days, written as "YYYY-MM-DD" keys; a session belongs to the day it started.
 */

/** How long one note keeps the clock running. */
export const IDLE_WINDOW_MS = 45_000;
/** A silence longer than this ends the session. */
export const SESSION_GAP_MS = 10 * 60_000;
/** A day counts toward the streak from this much practice. */
export const STREAK_MINUTES = 5;

export interface Session {
  /** When it started, ms since the epoch; also identifies the session. */
  start: number;
  /** The last moment counted so far, ms since the epoch. */
  end: number;
  /** Time the clock ran, in seconds. */
  seconds: number;
  /** The songs practiced, in order, each once. */
  songs: string[];
}

/** The clock while practicing: the open session, and when it stops without another note. */
export interface TrackerState {
  session: Session | null;
  /** The clock runs until this moment (ms) unless a note extends it. */
  activeUntil: number;
}

export const IDLE_TRACKER: TrackerState = { session: null, activeUntil: 0 };

/** Counts the time the clock has run up to `now` into the session. */
export function settle(state: TrackerState, now: number): TrackerState {
  const { session, activeUntil } = state;
  if (!session) return state;
  const until = Math.min(now, activeUntil);
  if (until <= session.end) return state;
  return {
    ...state,
    session: {
      ...session,
      end: until,
      seconds: session.seconds + (until - session.end) / 1000,
    },
  };
}

/** The player played a note of `songId` at `now`: the clock runs on, in the current or a new session. */
export function noteAt(
  state: TrackerState,
  now: number,
  songId: string,
): TrackerState {
  const settled = settle(state, now);
  const current = settled.session;
  const continues = current && now - current.end <= SESSION_GAP_MS;
  const session: Session = continues
    ? {
        ...current,
        end: now,
        songs: current.songs.includes(songId)
          ? current.songs
          : [...current.songs, songId],
      }
    : { start: now, end: now, seconds: 0, songs: [songId] };
  return { session, activeUntil: now + IDLE_WINDOW_MS };
}

/** Stops the clock at `now` (the page is hidden or left); the session may still resume. */
export function stopAt(state: TrackerState, now: number): TrackerState {
  const settled = settle(state, now);
  return { ...settled, activeUntil: Math.min(settled.activeUntil, now) };
}

/** Whether the clock is running at `now`. */
export function isActive(state: TrackerState, now: number): boolean {
  return state.session !== null && now < state.activeUntil;
}

/** The session with the time up to `now` counted, or null when none is open. */
export function currentSession(
  state: TrackerState,
  now: number,
): Session | null {
  return settle(state, now).session;
}

/* ---------- Days ---------- */

/** The local calendar day of a moment, as "YYYY-MM-DD". */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight at the start of a day key. */
export function dayStart(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** The day `n` days after (or before, when negative) `key`. */
export function addDays(key: string, n: number): string {
  const d = dayStart(key);
  d.setDate(d.getDate() + n);
  return dayKey(d.getTime());
}

/** The seven days of the week holding `key`, Monday first. */
export function weekDays(key: string): string[] {
  const weekday = (dayStart(key).getDay() + 6) % 7;
  const monday = addDays(key, -weekday);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Every day of the month holding `key`. */
export function monthDays(key: string): string[] {
  const first = dayStart(key);
  first.setDate(1);
  const days: string[] = [];
  for (
    let d = new Date(first);
    d.getMonth() === first.getMonth();
    d.setDate(d.getDate() + 1)
  )
    days.push(dayKey(d.getTime()));
  return days;
}

/* ---------- Figures ---------- */

/** Seconds practiced on each day that has any, by day key. */
export function secondsByDay(
  sessions: Iterable<Session>,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sessions) {
    const key = dayKey(s.start);
    m.set(key, (m.get(key) ?? 0) + s.seconds);
  }
  return m;
}

export interface RangeStats {
  /** Seconds practiced on each day of the range, in order. */
  daySeconds: number[];
  totalSeconds: number;
  /** How many days of the range have at least a minute of practice. */
  daysPracticed: number;
  /** The session with the most time, or null when the range has none. */
  longest: Session | null;
}

/** The figures for the days given (a week or month from `weekDays`/`monthDays`). */
export function rangeStats(
  sessions: Iterable<Session>,
  days: readonly string[],
): RangeStats {
  const byDay = secondsByDay(sessions);
  const daySeconds = days.map((key) => byDay.get(key) ?? 0);
  const inRange = new Set(days);
  let longest: Session | null = null;
  for (const s of sessions)
    if (inRange.has(dayKey(s.start)) && s.seconds > (longest?.seconds ?? 0))
      longest = s;
  return {
    daySeconds,
    totalSeconds: daySeconds.reduce((a, b) => a + b, 0),
    daysPracticed: daySeconds.filter((s) => minutesOf(s) > 0).length,
    longest,
  };
}

export interface Streaks {
  /** Days in a row up to today (or yesterday: today is not over yet). */
  current: number;
  /** The longest run of days ever. */
  best: number;
}

/** The streak of days with at least `STREAK_MINUTES` of practice, as of `today`. */
export function streaks(sessions: Iterable<Session>, today: string): Streaks {
  const qualifying = new Set<string>();
  for (const [key, seconds] of secondsByDay(sessions))
    if (seconds >= STREAK_MINUTES * 60) qualifying.add(key);

  let best = 0;
  for (const key of qualifying) {
    if (qualifying.has(addDays(key, -1))) continue; // not the start of a run
    let run = 1;
    while (qualifying.has(addDays(key, run))) run++;
    best = Math.max(best, run);
  }

  let current = 0;
  let day = qualifying.has(today) ? today : addDays(today, -1);
  while (qualifying.has(day)) {
    current++;
    day = addDays(day, -1);
  }
  return { current, best };
}

/** Whole minutes, rounded, for display. */
export function minutesOf(seconds: number): number {
  return Math.round(seconds / 60);
}

/** "0:07", "12:34", "1:02:10": a running clock. */
export function formatClock(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** "0 min", "12 min", "1 h 5 min". */
export function formatDuration(seconds: number): string {
  const minutes = minutesOf(seconds);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
