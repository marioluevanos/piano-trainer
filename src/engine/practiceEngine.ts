import type { HandMode, LoopRange, Step, StepNote } from "./types";

/**
 * The notes of a chord must all be struck within this many milliseconds of the
 * first one. A note that arrives later starts the chord over.
 */
export const CHORD_WINDOW_MS = 150;

export interface EngineState {
  /** Index into `steps` of the slice the player must play next. */
  stepIndex: number;
  /** Notes the player has struck since arriving at the current step. */
  hits: ReadonlySet<number>;
  /** When the first of `hits` was struck, in ms; null while `hits` is empty. */
  chordStart: number | null;
  /** Wrong notes struck at the current step (cleared on advance). */
  misses: ReadonlySet<number>;
  /** Notes physically held down right now (for drawing the keyboard). */
  held: ReadonlySet<number>;
  /** True once the player has completed the final step (and no loop is set). */
  finished: boolean;
  completedSteps: number;
  wrongNotes: number;
}

export interface EngineOptions {
  handMode: HandMode;
  loop: LoopRange | null;
}

export function initialState(stepIndex = 0): EngineState {
  return {
    stepIndex,
    hits: new Set(),
    chordStart: null,
    misses: new Set(),
    held: new Set(),
    finished: false,
    completedSteps: 0,
    wrongNotes: 0,
  };
}

/** Notes of a step that the player is responsible for under the current hand mode. */
export function expectedNotes(
  step: Step | undefined,
  handMode: HandMode,
): StepNote[] {
  if (!step) return [];
  if (handMode === "both") return step.notes;
  const hand = handMode === "left" ? "L" : "R";
  return step.notes.filter((n) => n.hand === hand);
}

export function expectedMidi(
  step: Step | undefined,
  handMode: HandMode,
): Set<number> {
  return new Set(expectedNotes(step, handMode).map((n) => n.midi));
}

/**
 * The first step index inside the loop range, or 0 when there is no loop.
 * Returns -1 if the loop range contains no steps.
 */
export function loopStartIndex(steps: Step[], loop: LoopRange | null): number {
  if (!loop) return 0;
  const i = steps.findIndex((s) => s.measure >= loop.startMeasure);
  return i;
}

/**
 * True when the step after `from` falls outside the loop's measures, so the loop
 * wraps there. Checking both bounds matters for scores with repeats: steps
 * follow the performance order, so a repeat sign can jump back to measures
 * before the loop, or replay the loop's measures only after the rest of the piece.
 */
export function leavesLoop(
  steps: Step[],
  from: number,
  loop: LoopRange,
): boolean {
  const next = steps[from + 1];
  return (
    !next ||
    next.measure < loop.startMeasure ||
    next.measure > loop.endMeasure
  );
}

/** Index of the step that follows `from`, honoring the loop range. -1 means the piece is finished. */
export function nextStepIndex(
  steps: Step[],
  from: number,
  loop: LoopRange | null,
): number {
  const next = from + 1;
  if (loop) {
    return leavesLoop(steps, from, loop) ? loopStartIndex(steps, loop) : next;
  }
  return next < steps.length ? next : -1;
}

/**
 * Steps that have nothing to play under the current hand mode (rests, or the
 * other hand only) are skipped automatically so the player is never stuck.
 */
export function skipEmptySteps(
  steps: Step[],
  index: number,
  opts: EngineOptions,
): number {
  let i = index;
  let guard = 0;
  while (
    i >= 0 &&
    i < steps.length &&
    expectedMidi(steps[i], opts.handMode).size === 0
  ) {
    i = nextStepIndex(steps, i, opts.loop);
    if (++guard > steps.length) return -1; // loop range with nothing to play
  }
  return i;
}

/** Jump the engine to a step (e.g. after the user changes the loop or hand mode). */
export function jumpTo(
  steps: Step[],
  index: number,
  opts: EngineOptions,
): EngineState {
  const target = skipEmptySteps(
    steps,
    Math.max(0, Math.min(index, steps.length - 1)),
    opts,
  );
  const s = initialState(target < 0 ? 0 : target);
  return { ...s, finished: target < 0 && steps.length > 0 };
}

/** `time` is when the note was struck, in ms (e.g. `performance.now()`). */
export function noteOn(
  state: EngineState,
  steps: Step[],
  midi: number,
  opts: EngineOptions,
  time = 0,
): EngineState {
  const held = new Set(state.held);
  held.add(midi);
  if (state.finished) return { ...state, held };

  const step = steps[state.stepIndex];
  const expected = expectedMidi(step, opts.handMode);

  if (!expected.has(midi)) {
    const misses = new Set(state.misses);
    misses.add(midi);
    return { ...state, held, misses, wrongNotes: state.wrongNotes + 1 };
  }

  // Notes struck too long before this one were not played together, so the chord starts over.
  const together =
    state.chordStart !== null && time - state.chordStart <= CHORD_WINDOW_MS;
  const hits = new Set(together ? state.hits : []);
  hits.add(midi);
  const chordStart = together ? state.chordStart : time;

  // Wait mode: advance only once every expected note of this slice has been struck together.
  const complete = [...expected].every((m) => hits.has(m));
  if (!complete) return { ...state, held, hits, chordStart };

  const rawNext = nextStepIndex(steps, state.stepIndex, opts.loop);
  const next = rawNext < 0 ? -1 : skipEmptySteps(steps, rawNext, opts);
  if (next < 0) {
    return {
      ...state,
      held,
      hits,
      chordStart,
      finished: true,
      completedSteps: state.completedSteps + 1,
    };
  }
  return {
    stepIndex: next,
    hits: new Set(),
    chordStart: null,
    misses: new Set(),
    held,
    finished: false,
    completedSteps: state.completedSteps + 1,
    wrongNotes: state.wrongNotes,
  };
}

export function noteOff(state: EngineState, midi: number): EngineState {
  if (!state.held.has(midi)) return state;
  const held = new Set(state.held);
  held.delete(midi);
  // A wrong note stops being flagged once it is released.
  const misses = new Set(state.misses);
  misses.delete(midi);
  return { ...state, held, misses };
}
