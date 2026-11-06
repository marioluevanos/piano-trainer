import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IDLE_TRACKER,
  IDLE_WINDOW_MS,
  SESSION_GAP_MS,
  STREAK_MINUTES,
  addDays,
  currentSession,
  dayKey,
  formatClock,
  formatDuration,
  isActive,
  monthDays,
  noteAt,
  rangeStats,
  settle,
  stopAt,
  streaks,
  weekDays,
  type Session,
} from "./activity.ts";

/** A local moment on 2026-11-06 (a Friday), `seconds` into the day. */
const at = (seconds: number) =>
  new Date(2026, 10, 6, 0, 0, 0).getTime() + seconds * 1000;

const session = (
  day: string,
  minutes: number,
  hour = 10,
  songs = ["a"],
): Session => {
  const start = new Date(`${day}T00:00:00`).getTime() + hour * 3_600_000;
  return { start, end: start + minutes * 60_000, seconds: minutes * 60, songs };
};

test("a note starts a session and keeps the clock running for the idle window", () => {
  let s = noteAt(IDLE_TRACKER, at(0), "song");
  assert.equal(isActive(s, at(10)), true);
  assert.equal(isActive(s, at(IDLE_WINDOW_MS / 1000)), false);
  // Settling long after: only the idle window counted.
  s = settle(s, at(600));
  assert.equal(s.session?.seconds, IDLE_WINDOW_MS / 1000);
  assert.deepEqual(s.session?.songs, ["song"]);
});

test("notes within the idle window count the time between them", () => {
  let s = noteAt(IDLE_TRACKER, at(0), "song");
  s = noteAt(s, at(20), "song");
  s = noteAt(s, at(50), "song");
  assert.equal(currentSession(s, at(50))?.seconds, 50);
  // Reading a phrase for a minute: 45 s count, the rest is idle.
  s = noteAt(s, at(110), "song");
  assert.equal(s.session?.seconds, 50 + IDLE_WINDOW_MS / 1000);
  assert.equal(s.session?.start, at(0));
});

test("a silence longer than the session gap starts a new session", () => {
  let s = noteAt(IDLE_TRACKER, at(0), "a");
  s = noteAt(s, at(30), "a");
  const later = 30 + IDLE_WINDOW_MS / 1000 + SESSION_GAP_MS / 1000 + 1;
  s = noteAt(s, at(later), "b");
  assert.equal(s.session?.start, at(later));
  assert.equal(s.session?.seconds, 0);
  assert.deepEqual(s.session?.songs, ["b"]);
});

test("a session continues across songs within the gap", () => {
  let s = noteAt(IDLE_TRACKER, at(0), "a");
  s = noteAt(s, at(300), "b");
  s = noteAt(s, at(320), "a");
  assert.equal(s.session?.start, at(0));
  assert.deepEqual(s.session?.songs, ["a", "b"]);
});

test("stopping halts the clock at once but leaves the session to resume", () => {
  let s = noteAt(IDLE_TRACKER, at(0), "a");
  s = stopAt(s, at(10));
  assert.equal(isActive(s, at(11)), false);
  assert.equal(s.session?.seconds, 10);
  s = settle(s, at(100));
  assert.equal(s.session?.seconds, 10);
  s = noteAt(s, at(100), "a");
  assert.equal(s.session?.start, at(0));
  assert.equal(currentSession(s, at(120))?.seconds, 30);
});

test("settling without a session or before the counted end changes nothing", () => {
  assert.equal(settle(IDLE_TRACKER, at(5)), IDLE_TRACKER);
  const s = noteAt(IDLE_TRACKER, at(10), "a");
  assert.equal(settle(s, at(5)), s);
});

test("day keys are local days and support arithmetic", () => {
  assert.equal(dayKey(at(0)), "2026-11-06");
  assert.equal(dayKey(at(24 * 3600 - 1)), "2026-11-06");
  assert.equal(dayKey(at(24 * 3600)), "2026-11-07");
  assert.equal(addDays("2026-11-06", 1), "2026-11-07");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("weekDays runs Monday to Sunday around the day", () => {
  const expected = [
    "2026-11-02",
    "2026-11-03",
    "2026-11-04",
    "2026-11-05",
    "2026-11-06",
    "2026-11-07",
    "2026-11-08",
  ];
  assert.deepEqual(weekDays("2026-11-06"), expected);
  assert.deepEqual(weekDays("2026-11-02"), expected);
  assert.deepEqual(weekDays("2026-11-08"), expected);
});

test("monthDays lists every day of the month", () => {
  const days = monthDays("2026-11-15");
  assert.equal(days.length, 30);
  assert.equal(days[0], "2026-11-01");
  assert.equal(days[29], "2026-11-30");
  assert.equal(monthDays("2028-02-10").length, 29);
});

test("rangeStats totals each day and finds the longest session", () => {
  const sessions = [
    session("2026-11-02", 10),
    session("2026-11-02", 25, 18),
    session("2026-11-05", 40),
    session("2026-11-07", 0.25), // a few seconds: not a practiced day
    session("2026-11-09", 90), // next week
  ];
  const stats = rangeStats(sessions, weekDays("2026-11-06"));
  assert.deepEqual(
    stats.daySeconds.map((s) => s / 60),
    [35, 0, 0, 40, 0, 0.25, 0],
  );
  assert.equal(stats.totalSeconds, 75.25 * 60);
  assert.equal(stats.daysPracticed, 2);
  assert.equal(stats.longest?.seconds, 40 * 60);
  assert.equal(rangeStats([], weekDays("2026-11-06")).longest, null);
});

test("streaks count consecutive days with enough practice", () => {
  const sessions = [
    session("2026-11-01", 10),
    session("2026-11-02", 10),
    session("2026-11-03", STREAK_MINUTES - 1), // too short, breaks the run
    session("2026-11-05", 10),
    session("2026-11-06", 10),
  ];
  assert.deepEqual(streaks(sessions, "2026-11-06"), { current: 2, best: 2 });
  // Today not practiced yet: yesterday's streak still stands.
  assert.deepEqual(streaks(sessions, "2026-11-07"), { current: 2, best: 2 });
  // A whole day missed ends it.
  assert.deepEqual(streaks(sessions, "2026-11-08"), { current: 0, best: 2 });
  assert.deepEqual(streaks([], "2026-11-08"), { current: 0, best: 0 });
});

test("two short sessions on one day add up for the streak", () => {
  const sessions = [
    session("2026-11-06", 3, 9),
    session("2026-11-06", 3, 20),
  ];
  assert.deepEqual(streaks(sessions, "2026-11-06"), { current: 1, best: 1 });
});

test("formatClock counts whole seconds", () => {
  assert.equal(formatClock(7.9), "0:07");
  assert.equal(formatClock(754), "12:34");
  assert.equal(formatClock(3730), "1:02:10");
});

test("formatDuration rounds to minutes and shows hours", () => {
  assert.equal(formatDuration(0), "0 min");
  assert.equal(formatDuration(29), "0 min");
  assert.equal(formatDuration(90), "2 min");
  assert.equal(formatDuration(3600), "1 h");
  assert.equal(formatDuration(3900), "1 h 5 min");
});
