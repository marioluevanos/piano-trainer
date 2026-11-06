/**
 * Where practice sessions are kept: always on the device (localStorage), and
 * mirrored to the signed-in user's account in Firestore so streaks follow them
 * across devices.
 *
 * Firestore holds one document per local day, `pianoTrainerUsers/{uid}/practice/{YYYY-MM-DD}`,
 * with that day's sessions keyed by their start time:
 * `{ sessions: { "<start ms>": { end, seconds, songs } } }`. Keying by start
 * makes local and remote trivially mergeable: the same session on both sides
 * is the same key, and whichever side counted further wins.
 *
 * DOM-free except for the localStorage calls, which are guarded.
 */
import { dayKey, type Session } from "./activity.ts";

const STORAGE_KEY = "piano-trainer.practice.v1";

/** A session as stored, without its key. */
export interface StoredSession {
  end: number;
  seconds: number;
  songs: string[];
}

/** A session read back from storage, or null when the data is not one. */
export function parseSession(start: number, raw: unknown): Session | null {
  if (!Number.isFinite(start) || typeof raw !== "object" || raw === null)
    return null;
  const { end, seconds, songs } = raw as Record<string, unknown>;
  if (typeof end !== "number" || typeof seconds !== "number") return null;
  if (!Array.isArray(songs) || !songs.every((s) => typeof s === "string"))
    return null;
  return { start, end, seconds, songs };
}

/** The sessions of a stored map keyed by start time, skipping anything malformed. */
export function parseSessionMap(raw: unknown): Session[] {
  if (typeof raw !== "object" || raw === null) return [];
  const sessions: Session[] = [];
  for (const [key, value] of Object.entries(raw)) {
    const session = parseSession(Number(key), value);
    if (session) sessions.push(session);
  }
  return sessions;
}

/** The stored form of a session, under its key. */
export function storedSession(s: Session): [string, StoredSession] {
  return [String(s.start), { end: s.end, seconds: s.seconds, songs: s.songs }];
}

/** The sessions with `session` added or replacing the one with the same start, ordered by start. */
export function withSession(sessions: Session[], session: Session): Session[] {
  return mergeSessions(sessions, [session]);
}

/**
 * The union of two session lists by start time, ordered by start. Where both
 * have a session, the one counted further (the later `end`) is kept.
 */
export function mergeSessions(a: Session[], b: Session[]): Session[] {
  const byStart = new Map<number, Session>();
  for (const s of [...a, ...b]) {
    const have = byStart.get(s.start);
    if (!have || s.end > have.end) byStart.set(s.start, s);
  }
  return [...byStart.values()].sort((x, y) => x.start - y.start);
}

/** The sessions grouped by the day they started, for the daily documents. */
export function sessionsByDay(sessions: Session[]): Map<string, Session[]> {
  const m = new Map<string, Session[]>();
  for (const s of sessions) {
    const key = dayKey(s.start);
    const list = m.get(key);
    if (list) list.push(s);
    else m.set(key, [s]);
  }
  return m;
}

/* ---------- The device ---------- */

export function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? [] : parseSessionMap(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveSessions(sessions: Session[]) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Object.fromEntries(sessions.map(storedSession))),
    );
  } catch {
    // The account copy, if any, still has them.
  }
}
