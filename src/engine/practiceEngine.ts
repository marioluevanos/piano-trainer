import type { EndingSet, HandMode, LoopRange, Step, StepNote } from "./types";

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

let loopCache: { steps: Step[]; loop: LoopRange; order: number[] } | null =
  null;

/**
 * The steps a loop plays. By default each measure of the range once, in printed
 * order, ignoring repeat signs and endings: a loop over 1–7 plays 1-2-3-4-5-6-7.
 * With `followRepeats` it plays the range as performed, from its first step
 * until the score leaves the range: 1-2-3-4, 1-2-3-5, 1-2-3-6, 7 for a passage
 * with three endings. `startTimestamp` and `endTimestamp` trim the first and
 * last measure to start or end on a given note.
 */
export function loopSteps(steps: Step[], loop: LoopRange): number[] {
  const c = loopCache;
  if (
    c &&
    c.steps === steps &&
    c.loop.startMeasure === loop.startMeasure &&
    c.loop.endMeasure === loop.endMeasure &&
    !!c.loop.followRepeats === !!loop.followRepeats &&
    c.loop.startTimestamp === loop.startTimestamp &&
    c.loop.endTimestamp === loop.endTimestamp
  ) {
    return c.order;
  }
  const { startMeasure, endMeasure, startTimestamp, endTimestamp } = loop;
  const EPSILON = 1e-6;
  const inLoop = (s: Step) =>
    s.measure >= startMeasure &&
    s.measure <= endMeasure &&
    !(
      s.measure === startMeasure &&
      startTimestamp !== undefined &&
      s.timestamp < startTimestamp - EPSILON
    ) &&
    !(
      s.measure === endMeasure &&
      endTimestamp !== undefined &&
      s.timestamp > endTimestamp + EPSILON
    );
  const order = loop.followRepeats
    ? performedSteps(steps, inLoop)
    : printedSteps(steps, inLoop);
  loopCache = { steps, loop, order };
  return order;
}

/** Steps in performance order, from the first one in the range until the score leaves it. */
function performedSteps(steps: Step[], inLoop: (s: Step) => boolean): number[] {
  const order: number[] = [];
  for (let i = steps.findIndex(inLoop); i >= 0 && i < steps.length; i++) {
    if (!inLoop(steps[i])) break;
    order.push(i);
  }
  return order;
}

/** Each measure in the range once, in printed order, taken from its first pass. */
function printedSteps(steps: Step[], inLoop: (s: Step) => boolean): number[] {
  // First pass through each measure: its first step and the ones that follow
  // it within the measure (a repeat of a single measure jumps back in time).
  const firstPass = new Map<number, number[]>();
  for (let i = 0; i < steps.length; i++) {
    const { measure } = steps[i];
    if (!inLoop(steps[i]) || firstPass.has(measure)) continue;
    const run = [i];
    while (
      steps[i + 1]?.measure === measure &&
      steps[i + 1].timestamp > steps[i].timestamp
    ) {
      // The rest of the pass, minus notes past a loop that ends mid-measure.
      if (inLoop(steps[++i])) run.push(i);
    }
    firstPass.set(measure, run);
  }
  return [...firstPass.keys()]
    .sort((a, b) => a - b)
    .flatMap((m) => firstPass.get(m)!);
}

/**
 * Timestamps of the notes in a measure, in order, one per cursor position that
 * has something to play (both hands). Note n of the measure is entry n - 1.
 */
export function measureNoteTimes(steps: Step[], measure: number): number[] {
  const times = new Set<number>();
  for (const s of steps) {
    if (s.measure === measure && s.notes.length > 0) times.add(s.timestamp);
  }
  return [...times].sort((a, b) => a - b);
}

/**
 * The measures (first and last, 0-based) of the alternate endings a loop plays
 * back to back, or null when the loop holds at most one ending of each repeat.
 */
export function endingsInLoop(
  endings: EndingSet[],
  loop: LoopRange,
): { first: number; last: number } | null {
  for (const set of endings) {
    const inside = set.filter(
      (e) => e.end >= loop.startMeasure && e.start <= loop.endMeasure,
    );
    if (inside.length >= 2) {
      return {
        first: Math.max(inside[0].start, loop.startMeasure),
        last: Math.min(inside[inside.length - 1].end, loop.endMeasure),
      };
    }
  }
  return null;
}

/**
 * The first step index inside the loop range, or 0 when there is no loop.
 * Returns -1 if the loop range contains no steps.
 */
export function loopStartIndex(steps: Step[], loop: LoopRange | null): number {
  if (!loop) return 0;
  return loopSteps(steps, loop)[0] ?? -1;
}

/** Index of the step that follows `from`, honoring the loop range. -1 means the piece is finished. */
export function nextStepIndex(
  steps: Step[],
  from: number,
  loop: LoopRange | null,
): number {
  if (loop) {
    // From a step outside the loop, the loop starts over.
    const order = loopSteps(steps, loop);
    const at = order.indexOf(from);
    return order[(at + 1) % order.length] ?? -1;
  }
  const next = from + 1;
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

/** Index of the step before `from`, honoring the loop range. -1 means `from` is the first step. */
export function previousStepIndex(
  steps: Step[],
  from: number,
  loop: LoopRange | null,
): number {
  if (loop) {
    // From a step outside the loop, the loop's last step comes before it.
    const order = loopSteps(steps, loop);
    const at = order.indexOf(from);
    return order[(at <= 0 ? order.length : at) - 1] ?? -1;
  }
  return from > 0 ? from - 1 : -1;
}

/**
 * The step `delta` playable steps away from `from` (+1 the next note, -1 the
 * previous one), for nudging the cursor one note at a time. Steps with nothing
 * to play for the hand mode are passed over, and a loop wraps around. Returns
 * `from` when there is nowhere to go (either end of the piece).
 */
export function stepBy(
  steps: Step[],
  from: number,
  delta: 1 | -1,
  opts: EngineOptions,
): number {
  let i = from;
  for (let guard = 0; guard <= steps.length; guard++) {
    const next =
      delta > 0
        ? nextStepIndex(steps, i, opts.loop)
        : previousStepIndex(steps, i, opts.loop);
    if (next < 0) return from;
    i = next;
    if (expectedMidi(steps[i], opts.handMode).size > 0) return i;
  }
  return from;
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
