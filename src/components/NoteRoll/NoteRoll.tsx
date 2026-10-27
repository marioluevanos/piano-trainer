import { useEffect, useMemo, useRef } from "react";
import {
  placeMeasures,
  placeNotes,
  rollStepTime,
  type NoteRoll as NoteRollModel,
} from "../../engine/noteRoll";
import type { HandMode } from "../../engine/types";
import { keyWidth, layoutKeys } from "../Keyboard/keys";
import { drawNoteRoll, type Lane, type RollPalette } from "./drawNoteRoll";
import { useElementSize } from "./useElementSize";
import "./NoteRoll.css";

/** How fast the notes fall, so they keep their proportions whatever the roll's height. */
const PX_PER_SECOND = 110;
/** A short roll still shows this much music above the keys. */
const MIN_AHEAD_SECONDS = 3;
/** A cursor move this far (seconds) jumps instead of scrolling there. */
const SNAP_SECONDS = 3;
/** How much of the remaining distance each frame covers when scrolling to the cursor. */
const EASE = 0.22;
const SETTLED = 0.002;

interface NoteRollProps {
  roll: NoteRollModel;
  /** The keyboard's range, so the lanes match its keys. */
  range: [number, number];
  handMode: HandMode;
  /** The step the player is on; the roll rests on it while nothing plays. */
  stepIndex: number;
  playing: boolean;
  /** Seconds into the pass while playing, null otherwise. */
  position: () => number | null;
  /** Whether to write note names on the notes. */
  labels: boolean;
}

/**
 * Notes falling onto the keyboard. While the song plays the roll scrolls in
 * time with the audio clock; otherwise it glides to the step under the cursor.
 */
export function NoteRoll({
  roll,
  range,
  handMode,
  stepIndex,
  playing,
  position,
  labels,
}: NoteRollProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height } = useElementSize(canvasRef);
  const lanes = useMemo(() => laneMap(range, width), [range, width]);
  // The playhead currently drawn; it lags the target while gliding.
  const shownRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    fitCanvas(canvas, width, height, dpr);
    const palette = readPalette(canvas);
    const ahead = Math.max(MIN_AHEAD_SECONDS, height / PX_PER_SECOND);

    let frame = 0;
    const draw = () => {
      frame = 0;
      const target = position() ?? rollStepTime(roll, stepIndex);
      const playhead = followPlayhead(shownRef.current, target, playing);
      shownRef.current = playhead;
      const to = playhead + ahead;
      drawNoteRoll(ctx, {
        width,
        height,
        dpr,
        lanes,
        playhead,
        ahead,
        notes: placeNotes(roll, playhead, to),
        measures: placeMeasures(roll, playhead, to),
        currentStep: stepIndex,
        handMode,
        labels,
        palette,
      });
      if (playing || playhead !== target) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [
    roll,
    lanes,
    width,
    height,
    handMode,
    stepIndex,
    playing,
    position,
    labels,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className="note-roll"
      role="img"
      aria-label="Upcoming notes"
    />
  );
}

/** Where to draw the playhead this frame: on the target while playing or far away, else part way there. */
function followPlayhead(
  shown: number | null,
  target: number,
  playing: boolean,
): number {
  if (playing || shown === null || Math.abs(target - shown) > SNAP_SECONDS) {
    return target;
  }
  const next = shown + (target - shown) * EASE;
  return Math.abs(target - next) < SETTLED ? target : next;
}

/** The keys' columns scaled to the canvas width, by MIDI note. */
function laneMap(
  range: [number, number],
  width: number,
): ReadonlyMap<number, Lane> {
  const layout = layoutKeys(range);
  const scale = width / layout.width;
  const lanes = new Map<number, Lane>();
  for (const key of layout.keys) {
    lanes.set(key.midi, {
      x: (key.x - layout.x) * scale,
      width: keyWidth(key) * scale,
      black: key.black,
    });
  }
  return lanes;
}

/** Sizes the backing store for the device's pixel density; setting it also clears the canvas. */
function fitCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  dpr: number,
) {
  const w = Math.round(width * dpr);
  const h = Math.round(height * dpr);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
}

function readPalette(element: Element): RollPalette {
  const style = getComputedStyle(element);
  const color = (name: string) => style.getPropertyValue(name).trim();
  return {
    background: color("--roll-bg"),
    lane: color("--roll-lane"),
    line: color("--roll-line"),
    guide: color("--roll-guide"),
    playhead: color("--roll-playhead"),
    noteEdge: color("--roll-note-edge"),
    muted: color("--muted"),
    text: color("--text"),
    right: color("--accent"),
    rightDark: color("--accent-dark"),
    onRight: color("--on-accent"),
    left: color("--left-hand"),
    leftDark: color("--left-hand-dark"),
    onLeft: color("--on-left-hand"),
  };
}
