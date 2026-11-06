import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  IDLE_TRACKER,
  currentSession,
  isActive,
  noteAt,
  settle,
  stopAt,
  type Session,
  type TrackerState,
} from "./activity";

/** How often an open session is saved while the clock runs. */
const FLUSH_MS = 60_000;

/** What the clock shows right now. */
export interface PracticeClock {
  /** Seconds counted in the open session, or 0 when none is open. */
  seconds: number;
  /** Whether the clock is running. */
  active: boolean;
}

export interface PracticeTracker {
  /** The player played a note of this song. */
  note: (songId: string) => void;
  /** The player left the song: the clock stops now (the session may still resume). */
  stop: () => void;
  /** The clock as of now, for a display that polls it. */
  peek: () => PracticeClock;
}

/**
 * Keeps the practice clock (see activity.ts) across pages and songs, and hands
 * each session to `record` as it grows: once a minute while practicing, when
 * the clock stops, and when the page is hidden or unloaded. Every function
 * returned is stable, so the training page can call them from its MIDI handlers.
 */
export function usePracticeTracker(
  record: (session: Session) => void,
): PracticeTracker {
  const state = useRef<TrackerState>(IDLE_TRACKER);
  /** The `end` of the session as last recorded, to skip unchanged saves. */
  const recordedEnd = useRef(0);
  const recordRef = useRef(record);
  recordRef.current = record;

  const flush = useCallback(() => {
    const session = currentSession(state.current, Date.now());
    if (!session || session.end === recordedEnd.current) return;
    recordedEnd.current = session.end;
    recordRef.current(session);
  }, []);

  const stop = useCallback(() => {
    state.current = stopAt(state.current, Date.now());
    flush();
  }, [flush]);

  const note = useCallback((songId: string) => {
    state.current = noteAt(state.current, Date.now(), songId);
  }, []);

  const peek = useCallback((): PracticeClock => {
    const now = Date.now();
    return {
      seconds: currentSession(state.current, now)?.seconds ?? 0,
      active: isActive(state.current, now),
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      state.current = settle(state.current, Date.now());
      flush();
    }, FLUSH_MS);
    // The clock cannot run while the app is in the background.
    const onHidden = () => {
      if (document.visibilityState === "hidden") stop();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", stop);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", stop);
      stop();
    };
  }, [flush, stop]);

  // One object for the life of the app, so pages can depend on it in effects.
  return useMemo(() => ({ note, stop, peek }), [note, stop, peek]);
}
