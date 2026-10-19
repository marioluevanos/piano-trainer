import type { OpenSheetMusicDisplay, Note } from "opensheetmusicdisplay";
import type { Hand, Step, StepNote } from "../engine/types";

/**
 * OSMD stores pitches as "halfTone" where A4 = 57; MIDI has A4 = 69.
 * (OSMD's Pitch.calcFrequency uses 440 * 2^((halfTone - 57) / 12).)
 */
const OSMD_HALFTONE_TO_MIDI = 12;

function handForNote(note: Note): Hand {
  // Staff 0 is the top (treble) staff, staff 1 the bottom (bass) staff in a piano part.
  const staffId = note.ParentStaffEntry?.ParentStaff?.idInMusicSheet ?? 0;
  return staffId === 0 ? "R" : "L";
}

function isPlayable(note: Note): boolean {
  if (note.isRest() || note.IsGraceNote) return false;
  if (!note.Pitch) return false;
  // Tied continuation: the key is already held from the previous step.
  if (note.NoteTie && note.NoteTie.StartNote !== note) return false;
  return true;
}

/**
 * Walk the OSMD cursor from start to end and record, for each cursor position,
 * every note that begins there. The cursor is reset afterwards, so the visual
 * cursor ends up at the start of the piece.
 */
export function buildSteps(osmd: OpenSheetMusicDisplay): Step[] {
  const cursor = osmd.cursor;
  cursor.reset();
  const steps: Step[] = [];
  let guard = 0;

  while (!cursor.Iterator.EndReached) {
    const seen = new Set<string>();
    const notes: StepNote[] = [];
    for (const note of cursor.NotesUnderCursor()) {
      if (!isPlayable(note)) continue;
      const hand = handForNote(note);
      const midi = note.Pitch.getHalfTone() + OSMD_HALFTONE_TO_MIDI;
      const key = `${hand}:${midi}`;
      if (seen.has(key)) continue; // same pitch doubled across voices
      seen.add(key);
      notes.push({ midi, hand });
    }
    steps.push({
      index: steps.length,
      measure: cursor.Iterator.CurrentMeasureIndex,
      timestamp: cursor.Iterator.currentTimeStamp.RealValue,
      notes,
    });
    cursor.next();
    if (++guard > 100000) break; // safety against a malformed sheet
  }

  cursor.reset();
  return steps;
}
