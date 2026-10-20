import {
  expectedNotes,
  leavesLoop,
  loopStartIndex,
  type EngineOptions,
} from "./practiceEngine.ts";
import type { Step } from "./types";

export interface PlayNote {
  midi: number;
  /** Seconds. */
  duration: number;
}

/** The notes of one step, placed in time. */
export interface PlayEvent {
  /** Seconds from the start of the playback range. */
  time: number;
  stepIndex: number;
  notes: PlayNote[];
}

export interface PlaybackPlan {
  events: PlayEvent[];
  /** Seconds one pass through the range lasts. */
  length: number;
  /** Seconds into the range where the first pass begins (the cursor position). */
  startOffset: number;
  /** True when a loop is set: the range repeats until stopped. */
  repeat: boolean;
}

export interface PlaybackOptions extends EngineOptions {
  /** Tempo multiplier: 1 plays at the score's tempo, 0.5 at half speed. */
  speed: number;
}

const EMPTY_PLAN: PlaybackPlan = {
  events: [],
  length: 0,
  startOffset: 0,
  repeat: false,
};

function wholeNoteSeconds(bpm: number, speed: number): number {
  return (4 * 60) / (bpm * speed);
}

function longestNote(step: Step): number {
  return Math.max(0, ...step.notes.map((n) => n.duration));
}

/**
 * Whole notes from `step` until `next` begins. Within a measure that is the
 * timestamp difference; across a measure line it is the rest of this measure,
 * since repeats and voltas make the next measure jump back or skip ahead.
 */
function stepGap(step: Step, next: Step | undefined): number {
  if (next && next.measure === step.measure && next.timestamp > step.timestamp) {
    return next.timestamp - step.timestamp;
  }
  const rest = step.measureEnd - step.timestamp;
  if (next && rest > 0) return rest;
  // No usable measure length; fall back to the timestamps, or this step's longest note.
  return next && next.timestamp > step.timestamp
    ? next.timestamp - step.timestamp
    : longestNote(step);
}

/**
 * Lay out the notes to play, in seconds, for the loop range (or the whole
 * piece), honoring the hand mode and each step's tempo. Playback begins at
 * step `from` when it lies inside the range, otherwise at the range start.
 */
export function planPlayback(
  steps: Step[],
  from: number,
  opts: PlaybackOptions,
): PlaybackPlan {
  const { loop } = opts;
  const first = loopStartIndex(steps, loop);
  if (steps.length === 0 || first < 0) return EMPTY_PLAN;
  // A loop runs on from its first step until the music leaves its measures.
  let last = steps.length - 1;
  if (loop) {
    last = first;
    while (!leavesLoop(steps, last, loop)) last++;
  }

  const start = from >= first && from <= last ? from : first;
  const events: PlayEvent[] = [];
  let time = 0;
  let startOffset = 0;
  let lastNoteEnd = 0;

  for (let i = first; i <= last; i++) {
    const step = steps[i];
    const seconds = wholeNoteSeconds(step.bpm, opts.speed);
    if (i === start) startOffset = time;

    const notes = expectedNotes(step, opts.handMode).map((n) => ({
      midi: n.midi,
      duration: n.duration * seconds,
    }));
    if (notes.length > 0) {
      events.push({ time, stepIndex: i, notes });
      const end = time + Math.max(...notes.map((n) => n.duration));
      lastNoteEnd = Math.max(lastNoteEnd, end);
    }

    time += stepGap(step, steps[i + 1]) * seconds;
  }

  // A pass ends where the following measure begins, so a loop keeps its rhythm.
  // At the end of the piece it lasts until the final note has finished.
  const length = steps[last + 1] ? time : Math.max(time, lastNoteEnd);
  return { events, length, startOffset, repeat: loop !== null };
}

/** The step sounding at `time` seconds into a pass, or -1 before the first event. */
export function stepAtTime(plan: PlaybackPlan, time: number): number {
  let lo = 0;
  let hi = plan.events.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (plan.events[mid].time <= time) {
      found = plan.events[mid].stepIndex;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}
