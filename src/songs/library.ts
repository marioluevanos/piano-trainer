import { useCallback, useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import {
  Bytes,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { decodeScore, gzipText, type Song } from "./index";
import { isMusicXml, songTitle } from "./metadata";
import { LIBRARY_DOC, MAX_SCORE_BYTES, userDoc } from "./paths";

const SELECTED_KEY = "piano-trainer.selected-song.v1";

/** The id of the song selected last time, if any. */
export function loadSelectedSongId(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
}

export function saveSelectedSongId(id: string) {
  try {
    localStorage.setItem(SELECTED_KEY, id);
  } catch {
    // Not remembering the selection is harmless.
  }
}

/* ---------- Importing ---------- */

/** An imported song, with its score bytes in the stored form (see paths.ts). */
interface ImportedSong {
  id: string;
  title: string;
  format: Song["format"];
  bytes: Uint8Array<ArrayBuffer>;
}

/** Turn a .musicxml / .xml / .mxl file into a song. Throws on unsupported input. */
async function songFromFile(file: File): Promise<ImportedSong> {
  const fallback = file.name.replace(/\.(musicxml|xml|mxl)$/i, "");
  const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const isMxl = /\.mxl$/i.test(file.name) || file.type.includes("zip");
  if (isMxl) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return { id, title: fallback, format: "mxl", bytes };
  }
  const text = await file.text();
  if (!isMusicXml(text)) {
    throw new Error(
      `${file.name} is not a MusicXML file. Export MusicXML from MuseScore (File → Export).`,
    );
  }
  return { id, title: songTitle(text, fallback), format: "xml", bytes: await gzipText(text) };
}

/* ---------- Songs in Firestore ---------- */

function cloudSong(snap: QueryDocumentSnapshot, base: string, user: boolean): Song {
  const { title, format } = snap.data() as Pick<Song, "title" | "format">;
  return {
    id: snap.id,
    title,
    format,
    user,
    load: async () => {
      const score = await getDoc(doc(db, base, "scores", snap.id));
      const bytes = score.get("data") as Bytes | undefined;
      if (!bytes) throw new Error(`the score for "${title}" is missing`);
      return decodeScore(format, new Uint8Array(bytes.toUint8Array()));
    },
  };
}

/** Save a song to the signed-in user's library in Firestore. */
async function uploadSong(uid: string, song: ImportedSong) {
  const { bytes } = song;
  if (bytes.length > MAX_SCORE_BYTES) {
    throw new Error(`"${song.title}" is too large to sync (over 1 MB compressed).`);
  }
  const base = userDoc(uid);
  const batch = writeBatch(db);
  batch.set(doc(db, base, "songs", song.id), {
    title: song.title,
    format: song.format,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, base, "scores", song.id), { data: Bytes.fromUint8Array(bytes) });
  await batch.commit();
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * The song list: the shared library from Firestore, plus the songs the
 * signed-in user imported, which live in their account and follow it across
 * devices. Importing requires signing in.
 */
export function useSongLibrary() {
  /** `undefined` until Firebase has restored (or ruled out) a session. */
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [shared, setShared] = useState<Song[] | null>(null);
  const [cloud, setCloud] = useState<Song[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(
    () =>
      onSnapshot(
        collection(db, LIBRARY_DOC, "songs"),
        (snap) =>
          setShared(
            snap.docs
              .map((d) => cloudSong(d, LIBRARY_DOC, false))
              .sort((a, b) => a.title.localeCompare(b.title)),
          ),
        (err) => {
          setError(`Could not load the song library: ${err.message}`);
          setShared([]);
        },
      ),
    [],
  );

  useEffect(() => {
    if (!user) {
      setCloud(null);
      return;
    }
    const base = userDoc(user.uid);
    return onSnapshot(
      collection(db, base, "songs"),
      (snap) =>
        setCloud(
          snap.docs
            .map((d) => ({ song: cloudSong(d, base, true), at: d.get("createdAt") }))
            .sort((a, b) => (a.at?.toMillis() ?? Infinity) - (b.at?.toMillis() ?? Infinity))
            .map(({ song }) => song),
        ),
      (err) => {
        setError(`Could not load your songs: ${err.message}`);
        setCloud([]);
      },
    );
  }, [user]);

  const addSong = useCallback(
    async (file: File): Promise<Song | null> => {
      if (!user) {
        setError("Sign in to upload songs.");
        return null;
      }
      try {
        const song = await songFromFile(file);
        await uploadSong(user.uid, song);
        setError(null);
        const { id, title, format, bytes } = song;
        return { id, title, format, user: true, load: () => decodeScore(format, bytes) };
      } catch (err) {
        setError(message(err));
        return null;
      }
    },
    [user],
  );

  const removeSong = useCallback(
    async (id: string) => {
      if (!user) return;
      const base = userDoc(user.uid);
      const batch = writeBatch(db);
      batch.delete(doc(db, base, "songs", id));
      batch.delete(doc(db, base, "scores", id));
      await batch.commit().catch((err) => setError(message(err)));
    },
    [user],
  );

  const signIn = useCallback(async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      setError(null);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        setError(`Could not sign in: ${message(err)}`);
      }
    }
  }, []);

  const signOut = useCallback(() => {
    firebaseSignOut(auth).catch((err) => setError(message(err)));
  }, []);

  return {
    songs: [...(shared ?? []), ...(cloud ?? [])],
    /** True until the shared list, the session and (if signed in) the user's songs are known. */
    loading: user === undefined || shared === null || (!!user && cloud === null),
    user: user ?? null,
    signIn,
    signOut,
    addSong,
    removeSong,
    error,
  };
}
