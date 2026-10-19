import { test } from "node:test";
import assert from "node:assert/strict";
import { planPlayback, stepAtTime } from "./playback.ts";
import type { Step } from "./types.ts";

// At 120 bpm a whole note lasts 2 s, so each quarter-note step is 0.5 s apart.
// m0 = C4 (R) + C3 (L, half note), then E4 (R); m1 = G4 (R), then rest.
const steps: Step[] = [
  {
    index: 0,
    measure: 0,
    timestamp: 0,
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
    bpm: 120,
    notes: [{ midi: 64, hand: "R", duration: 0.25 }],
  },
  {
    index: 2,
    measure: 1,
    timestamp: 0.5,
    bpm: 120,
    notes: [{ midi: 67, hand: "R", duration: 0.25 }],
  },
  { index: 3, measure: 1, timestamp: 0.75, bpm: 120, notes: [] },
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
    { midi: 60, duration: 0.5 },
    { midi: 48, duration: 1 },
  ]);
  assert.equal(plan.length, 1.5);
  assert.equal(plan.repeat, false);
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
  assert.deepEqual(plan.events[0].notes, [{ midi: 48, duration: 1 }]);
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
