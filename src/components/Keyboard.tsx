import { useMemo } from "react";
import type { Hand, KeyState } from "../engine/types";

const FIRST_MIDI = 21; // A0
const LAST_MIDI = 108; // C8
const WHITE_W = 23;
const WHITE_H = 120;
const BLACK_W = 14;
const BLACK_H = 76;

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];
const FLAT_NAMES = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];
const BLACK_PC = new Set([1, 3, 6, 8, 10]);

export function isBlackKey(midi: number): boolean {
  return BLACK_PC.has(midi % 12);
}

export function noteName(midi: number, preferFlats = true): string {
  const names = preferFlats ? FLAT_NAMES : NOTE_NAMES;
  return names[midi % 12];
}

export function noteNameWithOctave(midi: number): string {
  return `${noteName(midi)}${Math.floor(midi / 12) - 1}`;
}

interface KeyGeom {
  midi: number;
  black: boolean;
  x: number;
}

/** Lay out 88 keys. Black keys sit between their neighbouring whites, slightly offset like a real piano. */
function layoutKeys(): KeyGeom[] {
  const keys: KeyGeom[] = [];
  let whiteIndex = 0;
  for (let midi = FIRST_MIDI; midi <= LAST_MIDI; midi++) {
    const black = isBlackKey(midi);
    if (!black) {
      keys.push({ midi, black, x: whiteIndex * WHITE_W });
      whiteIndex++;
    } else {
      // Offset the black key within the gap so groups of 2 and 3 read correctly.
      const pc = midi % 12;
      const shift = pc === 1 || pc === 6 ? -2 : pc === 3 || pc === 10 ? 2 : 0;
      keys.push({ midi, black, x: whiteIndex * WHITE_W - BLACK_W / 2 + shift });
    }
  }
  return keys;
}

const KEYS = layoutKeys();
const TOTAL_W = 52 * WHITE_W;

export interface KeyboardProps {
  keyStates: ReadonlyMap<number, KeyState>;
  /** Which hand each highlighted key belongs to; drives per-hand colouring. */
  hands?: ReadonlyMap<number, Hand>;
  /** Labels drawn above the keys (e.g. the expected notes). */
  labels?: ReadonlyMap<number, string>;
  onNoteOn?: (midi: number) => void;
  onNoteOff?: (midi: number) => void;
  /** Lowest/highest MIDI note to display. Defaults to the full 88 keys. */
  range?: [number, number];
}

export function Keyboard({
  keyStates,
  hands,
  labels,
  onNoteOn,
  onNoteOff,
  range,
}: KeyboardProps) {
  const [lo, hi] = range ?? [FIRST_MIDI, LAST_MIDI];
  const visible = useMemo(
    () => KEYS.filter((k) => k.midi >= lo && k.midi <= hi),
    [lo, hi],
  );
  const minX = visible.length ? Math.min(...visible.map((k) => k.x)) : 0;
  const maxX = visible.length
    ? Math.max(...visible.map((k) => k.x + (k.black ? BLACK_W : WHITE_W)))
    : TOTAL_W;
  const labelH = 28;
  const cls = (k: KeyGeom) =>
    `key ${k.black ? "black" : "white"} ${keyStates.get(k.midi) ?? "idle"}${hands?.has(k.midi) ? ` hand-${hands.get(k.midi)}` : ""}`;

  const pointerHandlers = (midi: number) =>
    onNoteOn
      ? {
          onPointerDown: (e: React.PointerEvent) => {
            e.preventDefault();
            (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
            onNoteOn(midi);
          },
          onPointerUp: () => onNoteOff?.(midi),
          onPointerCancel: () => onNoteOff?.(midi),
          onPointerLeave: () => onNoteOff?.(midi),
        }
      : {};

  return (
    <svg
      className="keyboard"
      viewBox={`${minX} ${-labelH} ${maxX - minX} ${WHITE_H + labelH}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Piano keyboard"
    >
      {/* White keys first so black keys draw on top. */}
      {visible
        .filter((k) => !k.black)
        .map((k) => (
          <rect
            key={k.midi}
            className={cls(k)}
            x={k.x}
            y={0}
            width={WHITE_W}
            height={WHITE_H}
            rx={3}
            {...pointerHandlers(k.midi)}
          />
        ))}
      {visible
        .filter((k) => k.black)
        .map((k) => (
          <rect
            key={k.midi}
            className={cls(k)}
            x={k.x}
            y={0}
            width={BLACK_W}
            height={BLACK_H}
            rx={2}
            {...pointerHandlers(k.midi)}
          />
        ))}
      {labels &&
        visible
          .filter((k) => labels.has(k.midi))
          .map((k) => (
            <text
              key={`l${k.midi}`}
              className={`key-label${hands?.has(k.midi) ? ` hand-${hands.get(k.midi)}` : ""}`}
              x={k.x + (k.black ? BLACK_W : WHITE_W) / 2}
              y={-10}
              textAnchor="middle"
            >
              {labels.get(k.midi)}
            </text>
          ))}
    </svg>
  );
}
