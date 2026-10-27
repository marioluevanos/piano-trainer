import { planPlayback } from "./playback.ts";
import type { Hand, LoopRange, Step } from "./types";

/** One note as the roll shows it: a bar from `start` to `end` on the roll's clock. */
export interface RollNote {
  midi: number;
  hand: Hand;
  /** Seconds from the start of the playback range. */
  start: number;
  end: number;
  stepIndex: number;
}

/** Where a measure begins on the roll's clock. */
export interface MeasureMark {
  time: number;
  /** 0-based measure index. */
  measure: number;
}

/**
 * Everything the note roll needs to draw a song: its notes placed in time for
 * the loop and speed, exactly as playback plays them, with both hands kept so
 * the hand not being practiced can still be shown.
 */
export interface NoteRoll {
  /** Sorted by `start`. */
  notes: RollNote[];
  measures: MeasureMark[];
  /** When each step is reached (its first visit, for steps a loop revisits). */
  stepTimes: ReadonlyMap<number, number>;
  /** Seconds one pass through the range lasts. */
  length: number;
  /** True when a loop is set: the range repeats, so the roll continues into the next pass. */
  repeat: boolean;
}

export function buildNoteRoll(
  steps: Step[],
  loop: LoopRange | null,
  speed: number,
): NoteRoll {
  const plan = planPlayback(steps, 0, { handMode: "both", loop, speed });
  const notes: RollNote[] = [];
  for (const event of plan.events) {
    for (const note of event.notes) {
      notes.push({
        midi: note.midi,
        hand: note.hand,
        start: event.time,
        end: event.time + note.duration,
        stepIndex: event.stepIndex,
      });
    }
  }

  // Playback reaches a measure's first step as the measure begins, so that
  // step marks the measure line.
  const stepTimes = new Map<number, number>();
  const measures: MeasureMark[] = [];
  let lastMeasure = -1;
  for (const { stepIndex, time } of plan.timeline) {
    if (!stepTimes.has(stepIndex)) stepTimes.set(stepIndex, time);
    const measure = steps[stepIndex].measure;
    if (measure !== lastMeasure) {
      measures.push({ time, measure });
      lastMeasure = measure;
    }
  }
  return {
    notes,
    measures,
    stepTimes,
    length: plan.length,
    repeat: plan.repeat,
  };
}

/** Where the roll rests when the cursor is on a step; 0 for a step outside the range. */
export function rollStepTime(roll: NoteRoll, stepIndex: number): number {
  return roll.stepTimes.get(stepIndex) ?? 0;
}

/**
 * The pass offsets (seconds) whose contents can fall inside `from`..`to`. A
 * loop's notes repeat every `length` seconds, and a long note at the end of
 * one pass can run into the next, so the previous pass counts too.
 */
function passOffsets(roll: NoteRoll, from: number, to: number): number[] {
  if (!roll.repeat || roll.length <= 0) return [0];
  const first = Math.max(0, Math.floor(from / roll.length) - 1);
  const last = Math.floor(to / roll.length);
  const offsets: number[] = [];
  for (let pass = first; pass <= last; pass++) offsets.push(pass * roll.length);
  return offsets;
}

/** The notes sounding at any moment of `from`..`to`, placed on the roll's clock (looping passes unrolled). */
export function placeNotes(
  roll: NoteRoll,
  from: number,
  to: number,
): RollNote[] {
  const placed: RollNote[] = [];
  for (const offset of passOffsets(roll, from, to)) {
    for (const note of roll.notes) {
      const start = note.start + offset;
      if (start >= to) break;
      const end = note.end + offset;
      if (end > from) placed.push({ ...note, start, end });
    }
  }
  return placed;
}

/** The measure lines falling inside `from`..`to`, placed on the roll's clock. */
export function placeMeasures(
  roll: NoteRoll,
  from: number,
  to: number,
): MeasureMark[] {
  const placed: MeasureMark[] = [];
  for (const offset of passOffsets(roll, from, to)) {
    for (const mark of roll.measures) {
      const time = mark.time + offset;
      if (time >= to) break;
      if (time >= from) placed.push({ ...mark, time });
    }
  }
  return placed;
}
