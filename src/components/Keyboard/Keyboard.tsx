import { useMemo } from "react";
import type { Hand, KeyState } from "../../engine/types";
import {
  BLACK_H,
  BLACK_W,
  FIRST_MIDI,
  LAST_MIDI,
  WHITE_H,
  WHITE_W,
  keyWidth,
  keyboardViewBox,
  layoutKeys,
  type KeyGeom,
} from "./keys";
import "./Keyboard.css";

export interface KeyboardProps {
  keyStates: ReadonlyMap<number, KeyState>;
  /** Which hand each highlighted key belongs to; drives per-hand colouring. */
  hands?: ReadonlyMap<number, Hand>;
  /** Labels drawn above the keys (e.g. the expected notes). Without them the keyboard reserves no room for labels. */
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
  const layout = useMemo(() => layoutKeys([lo, hi]), [lo, hi]);
  const box = keyboardViewBox(layout, labels !== undefined);
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
      viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Piano keyboard"
    >
      {/* White keys first so black keys draw on top. */}
      {layout.keys
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
      {layout.keys
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
        layout.keys
          .filter((k) => labels.has(k.midi))
          .map((k) => (
            <text
              key={`l${k.midi}`}
              className={`key-label${hands?.has(k.midi) ? ` hand-${hands.get(k.midi)}` : ""}`}
              x={k.x + keyWidth(k) / 2}
              y={-8}
              textAnchor="middle"
            >
              {labels.get(k.midi)}
            </text>
          ))}
    </svg>
  );
}
