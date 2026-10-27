import type { MeasureMark, RollNote } from "../../engine/noteRoll";
import type { Hand, HandMode } from "../../engine/types";
import { noteName } from "../Keyboard/keys";

/** One key's column on the canvas, in CSS pixels. */
export interface Lane {
  x: number;
  width: number;
  black: boolean;
}

/** The colors the roll draws with, read from the page's CSS variables. */
export interface RollPalette {
  background: string;
  /** White-key columns. */
  lane: string;
  /** Lines between white-key columns. */
  line: string;
  /** Octave and measure lines. */
  guide: string;
  /** The line the notes land on. */
  playhead: string;
  /** Measure numbers. */
  muted: string;
  /** The outline of the notes to play now. */
  text: string;
  /** A hairline around every note. */
  noteEdge: string;
  right: string;
  rightDark: string;
  onRight: string;
  left: string;
  leftDark: string;
  onLeft: string;
}

/** Everything one frame of the roll is drawn from. */
export interface RollFrame {
  width: number;
  height: number;
  dpr: number;
  lanes: ReadonlyMap<number, Lane>;
  /** The moment on the roll's clock that sits at the bottom edge, where the keys are. */
  playhead: number;
  /** Seconds visible above the playhead. */
  ahead: number;
  /** Already placed on the roll's clock for the visible window. */
  notes: readonly RollNote[];
  measures: readonly MeasureMark[];
  /** The step the player is on: its notes are outlined and glow. */
  currentStep: number;
  /** The hand not being practiced is drawn faded. */
  handMode: HandMode;
  /** Whether to write note names on notes tall enough to hold one. */
  labels: boolean;
  palette: RollPalette;
}

const NOTE_RADIUS = 4;
/** Pixels between a note and the next one in the same lane, so repeated notes read separately. */
const NOTE_GAP = 2;
const LANE_INSET = 1;
const MIN_NOTE_HEIGHT = 6;
const DIM_ALPHA = 0.28;
const GLOW_BLUR = 14;
/** The notes emerge from darkness at the top rather than popping in. */
const FADE_HEIGHT = 36;
const LABEL_MIN_HEIGHT = 18;
const LABEL_FONT = "600 11px system-ui, -apple-system, sans-serif";
const MEASURE_FONT = "500 10px system-ui, -apple-system, sans-serif";

export function drawNoteRoll(
  ctx: CanvasRenderingContext2D,
  frame: RollFrame,
): void {
  const { width, height, dpr, palette } = frame;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, width, height);
  drawLanes(ctx, frame);
  drawMeasures(ctx, frame);
  drawNotes(ctx, frame);
  drawEdges(ctx, frame);
}

/** The canvas y of a moment: the playhead is at the bottom and time runs upward. */
function yAt(frame: RollFrame, time: number): number {
  return frame.height - (time - frame.playhead) * (frame.height / frame.ahead);
}

/** Crisp 1px lines sit on half pixels. */
function crisp(v: number): number {
  return Math.round(v) + 0.5;
}

function drawLanes(ctx: CanvasRenderingContext2D, frame: RollFrame) {
  const { lanes, height, palette } = frame;
  ctx.fillStyle = palette.lane;
  for (const lane of lanes.values()) {
    if (!lane.black) ctx.fillRect(lane.x, 0, lane.width, height);
  }
  ctx.lineWidth = 1;
  for (const [midi, lane] of lanes) {
    if (lane.black) continue;
    // Every white key is divided from the next; each C gets a stronger octave guide.
    ctx.strokeStyle = midi % 12 === 0 ? palette.guide : palette.line;
    ctx.beginPath();
    ctx.moveTo(crisp(lane.x), 0);
    ctx.lineTo(crisp(lane.x), height);
    ctx.stroke();
  }
  // Black keys cut darker columns through the white ones, as on the keyboard.
  ctx.fillStyle = palette.background;
  for (const lane of lanes.values()) {
    if (lane.black) ctx.fillRect(lane.x, 0, lane.width, height);
  }
}

function drawMeasures(ctx: CanvasRenderingContext2D, frame: RollFrame) {
  const { width, height, palette } = frame;
  ctx.lineWidth = 1;
  ctx.strokeStyle = palette.guide;
  ctx.fillStyle = palette.muted;
  ctx.font = MEASURE_FONT;
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  for (const mark of frame.measures) {
    const y = crisp(yAt(frame, mark.time));
    if (y < 0 || y > height) continue;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.fillText(String(mark.measure + 1), 6, y - 3);
  }
}

function practicedHand(handMode: HandMode): Hand | null {
  return handMode === "both" ? null : handMode === "left" ? "L" : "R";
}

function drawNotes(ctx: CanvasRenderingContext2D, frame: RollFrame) {
  const practiced = practicedHand(frame.handMode);
  const placed = frame.notes.flatMap((note) => {
    const lane = frame.lanes.get(note.midi);
    return lane ? [{ note, lane }] : [];
  });
  // White-key notes first so black-key notes, which overlap them, draw on top.
  for (const black of [false, true]) {
    for (const { note, lane } of placed) {
      if (lane.black !== black) continue;
      const dimmed = practiced !== null && note.hand !== practiced;
      drawNote(ctx, frame, note, lane, dimmed);
    }
  }
}

function drawNote(
  ctx: CanvasRenderingContext2D,
  frame: RollFrame,
  note: RollNote,
  lane: Lane,
  dimmed: boolean,
) {
  const { height, palette } = frame;
  const bottom = yAt(frame, note.start);
  const h = Math.max(MIN_NOTE_HEIGHT, bottom - yAt(frame, note.end) - NOTE_GAP);
  const top = bottom - h;
  if (top > height || bottom < 0) return;

  const x = lane.x + LANE_INSET;
  const w = lane.width - 2 * LANE_INSET;
  const current = !dimmed && note.stepIndex === frame.currentStep;
  const right = note.hand === "R";
  const fill = right
    ? lane.black
      ? palette.rightDark
      : palette.right
    : lane.black
      ? palette.leftDark
      : palette.left;

  ctx.globalAlpha = dimmed ? DIM_ALPHA : 1;
  ctx.beginPath();
  ctx.roundRect(x, top, w, h, Math.min(NOTE_RADIUS, w / 2));
  if (current) {
    ctx.shadowColor = fill;
    ctx.shadowBlur = GLOW_BLUR;
  }
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = current ? 1.5 : 1;
  ctx.strokeStyle = current ? palette.text : palette.noteEdge;
  ctx.stroke();

  if (frame.labels && !dimmed && h >= LABEL_MIN_HEIGHT) {
    // The name sits just above the note's lower end, which may already be below the keys.
    const baseline = Math.min(bottom, height) - 5;
    const name = noteName(note.midi);
    ctx.font = LABEL_FONT;
    if (baseline - 12 >= top && ctx.measureText(name).width <= w - 4) {
      ctx.fillStyle = right ? palette.onRight : palette.onLeft;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(name, x + w / 2, baseline);
    }
  }
  ctx.globalAlpha = 1;
}

function drawEdges(ctx: CanvasRenderingContext2D, frame: RollFrame) {
  const { width, height, palette } = frame;
  const fade = ctx.createLinearGradient(0, 0, 0, FADE_HEIGHT);
  fade.addColorStop(0, palette.background);
  fade.addColorStop(1, "transparent");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, width, FADE_HEIGHT);
  ctx.fillStyle = palette.playhead;
  ctx.fillRect(0, height - 2, width, 2);
}
