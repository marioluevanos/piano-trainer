import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import { userDoc } from "../songs/paths";
import { dayKey, type Session } from "./activity";
import {
  loadSessions,
  mergeSessions,
  parseSessionMap,
  saveSessions,
  sessionsByDay,
  storedSession,
  withSession,
} from "./store";

/** The daily document holding the sessions that started on `day`. */
const practiceDay = (uid: string, day: string) =>
  doc(db, userDoc(uid), "practice", day);

/**
 * Every practice session known on this device, plus the ones in the user's
 * account once signed in. `record` stores a session (new, or counted further),
 * on the device and in the account. Signing in merges the device's sessions
 * into the account, so practice done signed out is not lost.
 */
export function usePracticeLog(user: User | null | undefined) {
  const [sessions, setSessions] = useState<Session[]>(loadSessions);
  // Read by the account snapshot, which must merge into the latest local list.
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  useEffect(() => {
    if (!user) return;
    const { uid } = user;
    return onSnapshot(collection(db, userDoc(uid), "practice"), (snap) => {
      const remote = snap.docs.flatMap((d) =>
        parseSessionMap(d.get("sessions")),
      );
      const remoteEnd = new Map(remote.map((s) => [s.start, s.end]));
      const merged = mergeSessions(sessionsRef.current, remote);
      sessionsRef.current = merged;
      setSessions(merged);
      saveSessions(merged);
      // Sessions the account lacks or has counted less far (practiced signed
      // out, or a write that failed) go up, a day at a time.
      const behind = merged.filter(
        (s) => (remoteEnd.get(s.start) ?? -1) < s.end,
      );
      if (behind.length === 0) return;
      const batch = writeBatch(db);
      for (const [day, list] of sessionsByDay(behind))
        batch.set(
          practiceDay(uid, day),
          { sessions: Object.fromEntries(list.map(storedSession)) },
          { merge: true },
        );
      batch.commit().catch(() => {
        // Still on the device; the next snapshot tries again.
      });
    });
  }, [user]);

  const record = useCallback(
    (session: Session) => {
      const next = withSession(sessionsRef.current, session);
      sessionsRef.current = next;
      setSessions(next);
      saveSessions(next);
      if (user) {
        const [key, stored] = storedSession(session);
        setDoc(
          practiceDay(user.uid, dayKey(session.start)),
          { sessions: { [key]: stored } },
          { merge: true },
        ).catch(() => {
          // Kept on the device; merged into the account on the next sign-in.
        });
      }
    },
    [user],
  );

  return { sessions, record };
}
