import type { HandMode, LoopRange, Step, StepNote } from "./types";

export interface EngineState {
  /** Index into `steps` of the slice the player must play next. */
  stepIndex: number;
  /** Notes the player has struck since arriving at the current step. */
  hits: ReadonlySet<number>;
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

/** Index of the step that follows `from`, honoring the loop range. -1 means the piece is finished. */
export function nextStepIndex(
  steps: Step[],
  from: number,
  loop: LoopRange | null,
): number {
  const next = from + 1;
  if (loop) {
    if (next >= steps.length || steps[next].measure > loop.endMeasure) {
      return loopStartIndex(steps, loop);
    }
    return next;
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

export function noteOn(
  state: EngineState,
  steps: Step[],
  midi: number,
  opts: EngineOptions,
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

  const hits = new Set(state.hits);
  hits.add(midi);

  // Wait mode: advance only once every expected note of this slice has been struck.
  const complete = [...expected].every((m) => hits.has(m));
  if (!complete) return { ...state, held, hits };

  const rawNext = nextStepIndex(steps, state.stepIndex, opts.loop);
  const next = rawNext < 0 ? -1 : skipEmptySteps(steps, rawNext, opts);
  if (next < 0) {
    return {
      ...state,
      held,
      hits,
      finished: true,
      completedSteps: state.completedSteps + 1,
    };
  }
  return {
    stepIndex: next,
    hits: new Set(),
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
