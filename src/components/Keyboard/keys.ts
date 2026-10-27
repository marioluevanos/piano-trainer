/**
 * The piano's keys: where each one sits and what it is called. Shared by the
 * on-screen keyboard and the note roll above it, so notes fall onto the keys
 * they belong to.
 */

export const FIRST_MIDI = 21; // A0
export const LAST_MIDI = 108; // C8

/** Key sizes in keyboard units (the SVG's viewBox). */
export const WHITE_W = 23;
export const WHITE_H = 120;
export const BLACK_W = 14;
export const BLACK_H = 76;
/** Room above the keys for the expected notes' names. */
export const LABEL_H = 28;

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

export interface KeyGeom {
  midi: number;
  black: boolean;
  /** Left edge in keyboard units. */
  x: number;
}

export function keyWidth(key: KeyGeom): number {
  return key.black ? BLACK_W : WHITE_W;
}

/** Lay out 88 keys. Black keys sit between their neighbouring whites, slightly offset like a real piano. */
function layoutAllKeys(): KeyGeom[] {
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

const ALL_KEYS = layoutAllKeys();

/** The keys of a range and the horizontal span they cover, in keyboard units. */
export interface KeyLayout {
  keys: KeyGeom[];
  /** Left edge of the first key. */
  x: number;
  width: number;
}

/** The keys from `lo` to `hi` (MIDI numbers, inclusive). */
export function layoutKeys([lo, hi]: [number, number]): KeyLayout {
  const keys = ALL_KEYS.filter((k) => k.midi >= lo && k.midi <= hi);
  if (keys.length === 0) return { keys, x: 0, width: 52 * WHITE_W };
  const x = Math.min(...keys.map((k) => k.x));
  const right = Math.max(...keys.map((k) => k.x + keyWidth(k)));
  return { keys, x, width: right - x };
}

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The keyboard SVG's viewBox for a layout, with room for labels above the keys when `labeled`. */
export function keyboardViewBox(layout: KeyLayout, labeled: boolean): ViewBox {
  const labelH = labeled ? LABEL_H : 0;
  return { x: layout.x, y: -labelH, width: layout.width, height: WHITE_H + labelH };
}
