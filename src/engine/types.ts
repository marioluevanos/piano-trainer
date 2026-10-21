export type Hand = "L" | "R";

/** Which hand(s) the player is practicing. */
export type HandMode = "both" | "left" | "right";

export interface StepNote {
  /** MIDI note number, 21 (A0) .. 108 (C8). */
  midi: number;
  hand: Hand;
  /** How long the note sounds, in whole notes (tied notes included). */
  duration: number;
}

/**
 * One vertical slice of the score: every note that starts at the same
 * moment, across both hands. This is the unit the cursor moves by.
 */
export interface Step {
  index: number;
  /** 0-based measure index. */
  measure: number;
  /** Position in whole notes from the start of the piece. */
  timestamp: number;
  /** Where this step's measure ends, in whole notes from the start of the piece. */
  measureEnd: number;
  /** Tempo at this step, in quarter notes per minute. */
  bpm: number;
  notes: StepNote[];
}

export interface LoopRange {
  /** 0-based inclusive measure indices. */
  startMeasure: number;
  endMeasure: number;
  /**
   * Play the range as performed, through its repeat signs and endings, instead
   * of each measure once in printed order.
   */
  followRepeats?: boolean;
}

/** The alternate endings of one repeat, in order; each spans measures `start`..`end` (0-based, inclusive). */
export type EndingSet = { start: number; end: number }[];

export type KeyState = "idle" | "expected" | "correct" | "wrong" | "pressed";
