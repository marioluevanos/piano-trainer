import { test } from "node:test";
import assert from "node:assert/strict";
import { passPosition, planPlayback, stepAtTime } from "./playback.ts";
import type { Step } from "./types.ts";

// At 120 bpm a whole note lasts 2 s, so each quarter-note step is 0.5 s apart.
// m0 = C4 (R) + C3 (L, half note), then E4 (R); m1 = G4 (R), then rest.
const steps: Step[] = [
  {
    index: 0,
    measure: 0,
    timestamp: 0,
    measureEnd: 0.5,
    bpm: 120,
    notes: [
      { midi: 60, hand: "R", duration: 0.25 },
      { midi: 48, hand: "L", duration: 0.5 },
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
    notes: [{ midi: 67, hand: "R", duration: 0.25 }],
  },
  { index: 3, measure: 1, timestamp: 0.75, measureEnd: 1, bpm: 120, notes: [] },
];

const both = { handMode: "both" as const, loop: null, speed: 1 };

test("places steps in seconds from the score tempo", () => {
  const plan = planPlayback(steps, 0, both);
  assert.deepEqual(
    plan.events.map((e) => [e.stepIndex, e.time]),
    [
      [0, 0],
      [1, 0.5],
      [2, 1],
    ],
  );
  assert.deepEqual(plan.events[0].notes, [
    { midi: 60, hand: "R", duration: 0.5 },
    { midi: 48, hand: "L", duration: 1 },
  ]);
  assert.equal(plan.length, 1.5);
  assert.equal(plan.repeat, false);
});

test("the timeline lists every step, silent ones included", () => {
  const plan = planPlayback(steps, 0, both);
  assert.deepEqual(
    plan.timeline.map((s) => [s.stepIndex, s.time]),
    [
      [0, 0],
      [1, 0.5],
      [2, 1],
      [3, 1.5],
    ],
  );
});

test("the piece lasts until the last note of either hand has ended", () => {
  // The left hand's half note at the end of the piece outlasts the measure.
  const held = steps.map((s) =>
    s.index === 2
      ? {
          ...s,
          notes: [...s.notes, { midi: 48, hand: "L" as const, duration: 1 }],
        }
      : s,
  );
  assert.equal(planPlayback(held, 0, both).length, 3);
  assert.equal(planPlayback(held, 0, { ...both, handMode: "right" }).length, 3);
});

test("passPosition wraps while looping and runs on otherwise", () => {
  const whole = planPlayback(steps, 1, both);
  assert.equal(passPosition(whole, 10, 10.2), 0.5); // never before the cursor
  assert.equal(passPosition(whole, 10, 12), 2);
  const loop = { startMeasure: 0, endMeasure: 0 };
  const looped = planPlayback(steps, 0, { ...both, loop });
  assert.equal(passPosition(looped, 10, 12.25), 0.25);
});

test("speed scales every time and duration", () => {
  const plan = planPlayback(steps, 0, { ...both, speed: 0.5 });
  assert.deepEqual(
    plan.events.map((e) => e.time),
    [0, 1, 2],
  );
  assert.equal(plan.events[0].notes[0].duration, 1);
  assert.equal(plan.length, 3);
});

test("tempo changes apply from the step that carries them", () => {
  const slow = steps.map((s) => (s.index >= 1 ? { ...s, bpm: 60 } : s));
  const plan = planPlayback(slow, 0, both);
  assert.deepEqual(
    plan.events.map((e) => e.time),
    [0, 0.5, 1.5],
  );
});

test("hand mode drops the other hand and steps left empty", () => {
  const plan = planPlayback(steps, 0, { ...both, handMode: "left" });
  assert.deepEqual(
    plan.events.map((e) => e.stepIndex),
    [0],
  );
  assert.deepEqual(plan.events[0].notes, [
    { midi: 48, hand: "L", duration: 1 },
  ]);
});

test("a loop covers its measures and lasts until the next measure", () => {
  const loop = { startMeasure: 0, endMeasure: 0 };
  const plan = planPlayback(steps, 0, { ...both, loop });
  assert.deepEqual(
    plan.events.map((e) => e.stepIndex),
    [0, 1],
  );
  assert.equal(plan.length, 1);
  assert.equal(plan.repeat, true);
});

// The same two measures played twice, as a repeat sign around the whole piece
// produces. Timestamps jump back at the repeat, like OSMD's cursor.
const repeated: Step[] = [...steps, ...steps].map((s, index) => ({
  ...s,
  index,
}));

test("a loop stops at its measures even when a repeat replays them later", () => {
  const loop = { startMeasure: 0, endMeasure: 0 };
  const plan = planPlayback(repeated, 0, { ...both, loop });
  assert.deepEqual(
    plan.events.map((e) => e.stepIndex),
    [0, 1],
  );
  assert.equal(plan.length, 1);
});

test("a loop over repeated measures plays each of them once", () => {
  const loop = { startMeasure: 0, endMeasure: 1 };
  const plan = planPlayback(repeated, 0, { ...both, loop });
  assert.deepEqual(
    plan.events.map((e) => e.stepIndex),
    [0, 1, 2],
  );
  assert.equal(plan.length, 2);
});

test("starts at the cursor when it is inside the range", () => {
  assert.equal(planPlayback(steps, 1, both).startOffset, 0.5);
  const loop = { startMeasure: 1, endMeasure: 1 };
  assert.equal(planPlayback(steps, 0, { ...both, loop }).startOffset, 0);
});

test("stepAtTime finds the step sounding at a moment", () => {
  const plan = planPlayback(steps, 0, both);
  assert.equal(stepAtTime(plan, 0), 0);
  assert.equal(stepAtTime(plan, 0.49), 0);
  assert.equal(stepAtTime(plan, 0.5), 1);
  assert.equal(stepAtTime(plan, 10), 2);
  assert.equal(stepAtTime(plan, -1), -1);
});

// A first ending (m1) skipped on the second pass: m0, m1, m0, m2. Like OSMD's
// cursor, timestamps jump back at the repeat and ahead over the skipped ending.
const volta: Step[] = [0, 1, 0, 2].map((measure, index) => ({
  index,
  measure,
  timestamp: measure * 0.5,
  measureEnd: measure * 0.5 + 0.5,
  bpm: 120,
  notes: [{ midi: 60 + measure, hand: "R", duration: 0.5 }],
}));

test("skipping a volta ending adds no silence", () => {
  const plan = planPlayback(volta, 0, both);
  assert.deepEqual(
    plan.events.map((e) => e.time),
    [0, 1, 2, 3],
  );
  assert.equal(plan.length, 4);
});

test("a loop over volta endings plays every measure in printed order", () => {
  const loop = { startMeasure: 0, endMeasure: 2 };
  const plan = planPlayback(volta, 0, { ...both, loop });
  assert.deepEqual(
    plan.events.map((e) => [e.stepIndex, e.time]),
    [
      [0, 0],
      [1, 1],
      [3, 2],
    ],
  );
  assert.equal(plan.length, 3);
});

test("a loop that starts on a later note lasts from it to the end note's successor", () => {
  const loop = {
    startMeasure: 0,
    endMeasure: 1,
    startTimestamp: 0.25,
    endTimestamp: 0.5,
  };
  const plan = planPlayback(steps, 0, { ...both, loop });
  assert.deepEqual(
    plan.events.map((e) => [e.stepIndex, e.time]),
    [
      [1, 0],
      [2, 0.5],
    ],
  );
  // Up to where the next note (the rest at 0.75) begins.
  assert.equal(plan.length, 1);
});
