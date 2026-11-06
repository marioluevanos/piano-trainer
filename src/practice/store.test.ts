import { test } from "node:test";
import assert from "node:assert/strict";
import type { Session } from "./activity.ts";
import {
  mergeSessions,
  parseSessionMap,
  sessionsByDay,
  storedSession,
  withSession,
} from "./store.ts";

const s = (start: number, end: number, songs = ["a"]): Session => ({
  start,
  end,
  seconds: (end - start) / 1000,
  songs,
});

test("sessions round-trip through their stored form", () => {
  const sessions = [s(1000, 5000), s(9000, 12000, ["a", "b"])];
  const stored = Object.fromEntries(sessions.map(storedSession));
  assert.deepEqual(parseSessionMap(stored), sessions);
});

test("malformed stored sessions are skipped", () => {
  assert.deepEqual(parseSessionMap(null), []);
  assert.deepEqual(parseSessionMap("nope"), []);
  const stored = {
    "1000": { end: 5000, seconds: 4, songs: ["a"] },
    abc: { end: 5000, seconds: 4, songs: ["a"] },
    "2000": { end: "5000", seconds: 4, songs: ["a"] },
    "3000": { end: 5000, seconds: 4, songs: [1] },
    "4000": null,
  };
  assert.deepEqual(parseSessionMap(stored), [s(1000, 5000)]);
});

test("withSession replaces the session with the same start and keeps order", () => {
  const sessions = [s(1000, 5000), s(9000, 12000)];
  assert.deepEqual(withSession(sessions, s(1000, 7000)), [
    s(1000, 7000),
    s(9000, 12000),
  ]);
  assert.deepEqual(withSession(sessions, s(6000, 8000)), [
    s(1000, 5000),
    s(6000, 8000),
    s(9000, 12000),
  ]);
});

test("mergeSessions unions by start and keeps the one counted further", () => {
  const local = [s(1000, 5000), s(9000, 12000)];
  const remote = [s(1000, 3000), s(20000, 21000)];
  assert.deepEqual(mergeSessions(local, remote), [
    s(1000, 5000),
    s(9000, 12000),
    s(20000, 21000),
  ]);
  assert.deepEqual(mergeSessions([], []), []);
});

test("sessionsByDay groups by the local day a session started", () => {
  const monday = new Date(2026, 10, 2, 22).getTime();
  const tuesday = new Date(2026, 10, 3, 1).getTime();
  const grouped = sessionsByDay([
    s(monday, monday + 60_000),
    s(monday + 3_600_000, monday + 3_660_000),
    s(tuesday, tuesday + 60_000),
  ]);
  assert.deepEqual([...grouped.keys()], ["2026-11-02", "2026-11-03"]);
  assert.equal(grouped.get("2026-11-02")?.length, 2);
});
