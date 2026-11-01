import { test } from "node:test";
import assert from "node:assert/strict";
import { recentlyPlayed, withRecentSong } from "./recent.ts";

const own = (id: string) => ({ id, user: true as const });
const shared = (id: string) => ({ id });

test("withRecentSong puts the song first and drops its older entry", () => {
  assert.deepEqual(withRecentSong(["a", "b", "c"], "b"), ["b", "a", "c"]);
  assert.deepEqual(withRecentSong([], "a"), ["a"]);
});

test("withRecentSong keeps only the last few songs", () => {
  const many = Array.from({ length: 30 }, (_, i) => `s${i}`);
  const ids = many.reduce((acc, id) => withRecentSong(acc, id), [] as string[]);
  assert.equal(ids.length, 20);
  assert.equal(ids[0], "s29");
});

test("recentlyPlayed picks the newest own and the newest shared song, newest first", () => {
  const songs = [own("o1"), own("o2"), shared("l1"), shared("l2")];
  assert.deepEqual(
    recentlyPlayed(["l2", "l1", "o1", "o2"], songs).map((s) => s.id),
    ["l2", "o1"],
  );
  assert.deepEqual(
    recentlyPlayed(["o2", "l1", "l2", "o1"], songs).map((s) => s.id),
    ["o2", "l1"],
  );
});

test("recentlyPlayed falls back to the next most recent songs when one list has none", () => {
  const songs = [own("o1"), shared("l1"), shared("l2"), shared("l3")];
  assert.deepEqual(
    recentlyPlayed(["l3", "l1", "l2"], songs).map((s) => s.id),
    ["l3", "l1"],
  );
  assert.deepEqual(
    recentlyPlayed(["o1"], songs).map((s) => s.id),
    ["o1"],
  );
  assert.deepEqual(recentlyPlayed([], songs), []);
});

test("recentlyPlayed ignores songs that no longer exist", () => {
  const songs = [own("o1"), shared("l1")];
  assert.deepEqual(
    recentlyPlayed(["gone", "l1", "o1"], songs).map((s) => s.id),
    ["l1", "o1"],
  );
});
