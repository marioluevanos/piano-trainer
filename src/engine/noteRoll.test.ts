import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildNoteRoll,
  placeMeasures,
  placeNotes,
  rollStepTime,
} from "./noteRoll.ts";
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

test("places both hands' notes in seconds", () => {
  const roll = buildNoteRoll(steps, null, 1);
  assert.deepEqual(roll.notes, [
    { midi: 60, hand: "R", start: 0, end: 0.5, stepIndex: 0 },
    { midi: 48, hand: "L", start: 0, end: 1, stepIndex: 0 },
    { midi: 64, hand: "R", start: 0.5, end: 1, stepIndex: 1 },
    { midi: 67, hand: "R", start: 1, end: 1.5, stepIndex: 2 },
  ]);
  assert.equal(roll.length, 1.5);
  assert.equal(roll.repeat, false);
});

test("marks where each measure begins and when each step is reached", () => {
  const roll = buildNoteRoll(steps, null, 1);
  assert.deepEqual(roll.measures, [
    { time: 0, measure: 0 },
    { time: 1, measure: 1 },
  ]);
  assert.equal(rollStepTime(roll, 2), 1);
  assert.equal(rollStepTime(roll, 3), 1.5); // a silent step still has a place
  assert.equal(rollStepTime(roll, 99), 0);
});

test("speed stretches the roll like playback", () => {
  const roll = buildNoteRoll(steps, null, 0.5);
  assert.equal(roll.notes[2].start, 1);
  assert.equal(roll.length, 3);
});

test("placeNotes keeps the notes sounding inside a window", () => {
  const roll = buildNoteRoll(steps, null, 1);
  // The held C3 began earlier but is still sounding; G4 has not started.
  assert.deepEqual(
    placeNotes(roll, 0.6, 1).map((n) => n.midi),
    [48, 64],
  );
  assert.deepEqual(placeNotes(roll, 2, 3), []);
});

test("a loop's notes and measure lines continue into the next pass", () => {
  const roll = buildNoteRoll(steps, { startMeasure: 0, endMeasure: 0 }, 1);
  assert.equal(roll.length, 1);
  assert.equal(roll.repeat, true);
  assert.deepEqual(
    placeNotes(roll, 0.75, 1.25).map((n) => [n.midi, n.start]),
    [
      [48, 0], // the half note runs past the end of the pass
      [64, 0.5],
      [60, 1],
      [48, 1],
    ],
  );
  assert.deepEqual(placeMeasures(roll, 0.5, 2.5), [
    { time: 1, measure: 0 },
    { time: 2, measure: 0 },
  ]);
});
