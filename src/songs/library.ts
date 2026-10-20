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
import { decodeScore, gzipText, localSource, type Song } from "./index";
import { isMusicXml, songTitle } from "./metadata";
import { LIBRARY_DOC, MAX_SCORE_BYTES, userDoc } from "./paths";

const STORAGE_KEY = "piano-trainer.songs.v1";
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

/* ---------- Songs imported while signed out (localStorage) ---------- */

/** A song kept in localStorage. `data` is XML text, or base64 for a .mxl. */
interface StoredSong {
  id: string;
  title: string;
  format: Song["format"];
  data: string;
}

function loadLocalSongs(): StoredSong[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredSong[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalSongs(songs: StoredSong[]): string | null {
  try {
    if (songs.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
    else localStorage.removeItem(STORAGE_KEY);
    return null;
  } catch (err) {
    return err instanceof Error && err.name === "QuotaExceededError"
      ? "Browser storage is full. Remove a song to make room."
      : "Could not save the song in this browser.";
  }
}

function localSong(s: StoredSong): Song {
  return {
    id: s.id,
    title: s.title,
    format: s.format,
    user: true,
    load: async () => localSource(s.format, s.data),
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

const base64ToBytes = (data: string) =>
  Uint8Array.from(atob(data), (c) => c.charCodeAt(0));

/** Turn a .musicxml / .xml / .mxl file into a song. Throws on unsupported input. */
export async function songFromFile(file: File): Promise<StoredSong> {
  const fallback = file.name.replace(/\.(musicxml|xml|mxl)$/i, "");
  const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const isMxl = /\.mxl$/i.test(file.name) || file.type.includes("zip");
  if (isMxl) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return { id, title: fallback, format: "mxl", data: bytesToBase64(bytes) };
  }
  const text = await file.text();
  if (!isMusicXml(text)) {
    throw new Error(
      `${file.name} is not a MusicXML file. Export MusicXML from MuseScore (File → Export).`,
    );
  }
  return { id, title: songTitle(text, fallback), format: "xml", data: text };
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
async function uploadSong(uid: string, song: StoredSong) {
  const bytes =
    song.format === "xml" ? await gzipText(song.data) : base64ToBytes(song.data);
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
 * The song list: the shared library from Firestore, plus the songs the user
 * imported. Signed in, imported songs live in Firestore and follow the account
 * across devices; signed out, they stay in this browser's localStorage, and
 * are moved into the account at the next sign-in.
 */
export function useSongLibrary() {
  /** `undefined` until Firebase has restored (or ruled out) a session. */
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [shared, setShared] = useState<Song[] | null>(null);
  const [cloud, setCloud] = useState<Song[] | null>(null);
  const [local, setLocal] = useState<StoredSong[]>(loadLocalSongs);
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

  useEffect(() => {
    const err = saveLocalSongs(local);
    if (err) setError(err);
  }, [local]);

  // Move songs imported while signed out into the account.
  useEffect(() => {
    if (!user || local.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const song of local) {
        if (cancelled) return;
        try {
          await uploadSong(user.uid, song);
          setLocal((prev) => prev.filter((s) => s.id !== song.id));
        } catch (err) {
          setError(message(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only on sign-in: songs added while signed in go straight to Firestore.
  }, [user]);

  const addSong = useCallback(
    async (file: File): Promise<Song | null> => {
      try {
        const song = await songFromFile(file);
        if (user) await uploadSong(user.uid, song);
        else setLocal((prev) => [...prev, song]);
        setError(null);
        return localSong(song);
      } catch (err) {
        setError(message(err));
        return null;
      }
    },
    [user],
  );

  const removeSong = useCallback(
    async (id: string) => {
      if (user && cloud?.some((s) => s.id === id)) {
        const base = userDoc(user.uid);
        const batch = writeBatch(db);
        batch.delete(doc(db, base, "songs", id));
        batch.delete(doc(db, base, "scores", id));
        await batch.commit().catch((err) => setError(message(err)));
      } else {
        setLocal((prev) => prev.filter((s) => s.id !== id));
      }
    },
    [user, cloud],
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
    songs: [...(shared ?? []), ...(user ? (cloud ?? []) : local.map(localSong))],
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
