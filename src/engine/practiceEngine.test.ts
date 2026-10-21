import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHORD_WINDOW_MS,
  initialState,
  jumpTo,
  endingsInLoop,
  loopStartIndex,
  loopSteps,
  noteOff,
  noteOn,
} from "./practiceEngine.ts";
import type { Step } from "./types.ts";

// Two measures: m0 = C4 (R) + C3 (L), then E4 (R); m1 = G4 (R) + G3 (L), then rest.
const steps: Step[] = [
  {
    index: 0,
    measure: 0,
    timestamp: 0,
    measureEnd: 0.5,
    bpm: 120,
    notes: [
      { midi: 60, hand: "R", duration: 0.25 },
      { midi: 48, hand: "L", duration: 0.25 },
    ],
  },
  {
    index: 1,
    measure: 0,
    timestamp: 0.25,
    measureEnd: 0.5,
    bpm: 120,
    notes: [{ midi: 64, hand: "R", duration: 0.25 }],
  },
  {
    index: 2,
    measure: 1,
    timestamp: 0.5,
    measureEnd: 1,
    bpm: 120,
    notes: [
      { midi: 67, hand: "R", duration: 0.25 },
      { midi: 55, hand: "L", duration: 0.25 },
    ],
  },
  { index: 3, measure: 1, timestamp: 0.75, measureEnd: 1, bpm: 120, notes: [] },
];

test("wait mode advances only when every expected note is struck", () => {
  const opts = { handMode: "both" as const, loop: null };
  let s = initialState();
  s = noteOn(s, steps, 60, opts);
  assert.equal(s.stepIndex, 0, "still waiting for the left hand");
  s = noteOn(s, steps, 48, opts);
  assert.equal(s.stepIndex, 1);
  assert.equal(s.hits.size, 0, "hits reset after advancing");
});

test("wrong notes are flagged and cleared on release", () => {
  const opts = { handMode: "both" as const, loop: null };
  let s = initialState();
  s = noteOn(s, steps, 61, opts);
  assert.equal(s.stepIndex, 0);
  assert.ok(s.misses.has(61));
  assert.equal(s.wrongNotes, 1);
  s = noteOff(s, 61);
  assert.ok(!s.misses.has(61));
});

test("hand mode filters expected notes and skips empty steps", () => {
  const opts = { handMode: "left" as const, loop: null };
  let s = jumpTo(steps, 0, opts);
  assert.equal(s.stepIndex, 0);
  s = noteOn(s, steps, 48, opts);
  // step 1 has no left-hand notes, so we land on step 2.
  assert.equal(s.stepIndex, 2);
  s = noteOn(s, steps, 55, opts);
  assert.ok(s.finished, "rest at the end is skipped and the piece finishes");
});

test("loop wraps back to the start measure", () => {
  const opts = {
    handMode: "right" as const,
    loop: { startMeasure: 0, endMeasure: 0 },
  };
  let s = jumpTo(steps, 0, opts);
  s = noteOn(s, steps, 60, opts);
  s = noteOn(s, steps, 64, opts);
  assert.equal(s.stepIndex, 0, "wrapped to beginning of loop");
  assert.ok(!s.finished);
  assert.equal(s.completedSteps, 2);
});

test("loop wraps before a repeat replays the whole piece", () => {
  // Both measures twice, as a repeat sign around the whole piece produces.
  const repeated = [...steps, ...steps].map((s, index) => ({ ...s, index }));
  const opts = {
    handMode: "right" as const,
    loop: { startMeasure: 0, endMeasure: 0 },
  };
  let s = jumpTo(repeated, 0, opts);
  s = noteOn(s, repeated, 60, opts);
  s = noteOn(s, repeated, 64, opts);
  assert.equal(s.stepIndex, 0, "wrapped instead of running into measure 1");
});

test("loop wraps when a repeat jumps back before its start", () => {
  // m0, m1, then a repeat back to m0.
  const repeated = [...steps, ...steps].map((s, index) => ({ ...s, index }));
  const opts = {
    handMode: "right" as const,
    loop: { startMeasure: 1, endMeasure: 1 },
  };
  let s = jumpTo(repeated, 2, opts);
  s = noteOn(s, repeated, 67, opts);
  assert.equal(s.stepIndex, 2, "wrapped to measure 1, not the repeat at m0");
});

test("loop plays its measures in printed order, ignoring repeats", () => {
  // m0, m1 (first ending), m0 again, m2 (second ending), m3.
  const volta: Step[] = [0, 1, 0, 2, 3].map((measure, index) => ({
    index,
    measure,
    timestamp: measure * 0.5,
    measureEnd: measure * 0.5 + 0.5,
    bpm: 120,
    notes: [{ midi: 60 + measure, hand: "R", duration: 0.5 }],
  }));
  assert.deepEqual(loopSteps(volta, { startMeasure: 0, endMeasure: 3 }), [0, 1, 3, 4]);
  assert.deepEqual(loopSteps(volta, { startMeasure: 1, endMeasure: 2 }), [1, 3]);
  const opts = { handMode: "both" as const, loop: { startMeasure: 0, endMeasure: 3 } };
  let s = jumpTo(volta, loopStartIndex(volta, opts.loop), opts);
  const visited = [s.stepIndex];
  for (const m of [60, 61, 62, 63]) {
    s = noteOn(s, volta, m, opts);
    visited.push(s.stepIndex);
  }
  assert.deepEqual(visited, [0, 1, 3, 4, 0]);
});

test("follow repeats plays the loop as performed", () => {
  // m0, m1 (first ending), m0 again, m2 (second ending), m3.
  const volta: Step[] = [0, 1, 0, 2, 3].map((measure, index) => ({
    index,
    measure,
    timestamp: measure * 0.5,
    measureEnd: measure * 0.5 + 0.5,
    bpm: 120,
    notes: [{ midi: 60 + measure, hand: "R", duration: 0.5 }],
  }));
  const loop = { startMeasure: 0, endMeasure: 3, followRepeats: true };
  assert.deepEqual(loopSteps(volta, loop), [0, 1, 2, 3, 4]);
  // The range ends where the score first leaves it.
  assert.deepEqual(
    loopSteps(volta, { startMeasure: 0, endMeasure: 1, followRepeats: true }),
    [0, 1, 2],
  );
});

test("endingsInLoop finds alternate endings played back to back", () => {
  const endings = [
    [
      { start: 3, end: 3 },
      { start: 4, end: 4 },
      { start: 5, end: 5 },
    ],
  ];
  assert.deepEqual(endingsInLoop(endings, { startMeasure: 0, endMeasure: 6 }), {
    first: 3,
    last: 5,
  });
  assert.deepEqual(endingsInLoop(endings, { startMeasure: 4, endMeasure: 9 }), {
    first: 4,
    last: 5,
  });
  assert.equal(endingsInLoop(endings, { startMeasure: 0, endMeasure: 3 }), null);
  assert.equal(endingsInLoop([], { startMeasure: 0, endMeasure: 6 }), null);
});

test("piece finishes without a loop", () => {
  const opts = { handMode: "right" as const, loop: null };
  let s = jumpTo(steps, 0, opts);
  for (const m of [60, 64, 67]) s = noteOn(s, steps, m, opts);
  assert.ok(s.finished);
  // Further notes are ignored once finished.
  s = noteOn(s, steps, 60, opts);
  assert.ok(s.finished);
});

test("chord notes must be struck together", () => {
  const opts = { handMode: "both" as const, loop: null };
  let s = initialState();
  s = noteOn(s, steps, 60, opts, 0);
  s = noteOn(s, steps, 48, opts, CHORD_WINDOW_MS + 1);
  assert.equal(s.stepIndex, 0, "too far apart: the chord starts over");
  assert.deepEqual([...s.hits], [48]);
  s = noteOff(s, 60);
  s = noteOn(s, steps, 60, opts, CHORD_WINDOW_MS + 50);
  assert.equal(s.stepIndex, 1, "both notes within the window");
});
