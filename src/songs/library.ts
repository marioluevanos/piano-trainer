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
  deleteField,
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
import {
  LIBRARY_DOC,
  MAX_COVER_BYTES,
  MAX_SCORE_BYTES,
  userDoc,
} from "./paths";

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

/** A song read from a file but not saved yet, with its score bytes in the stored form (see paths.ts). */
export interface ImportedSong {
  id: string;
  title: string;
  format: Song["format"];
  bytes: Uint8Array<ArrayBuffer>;
}

/** What the user can set when adding or editing a song. */
export interface SongDetails {
  title: string;
  /** The new cover, null to remove it, or undefined to keep the current one. */
  cover?: Blob | null;
}

/** Turn a .musicxml / .xml / .mxl file into a song. Throws on unsupported input. */
export async function readSongFile(file: File): Promise<ImportedSong> {
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
  return {
    id,
    title: songTitle(text, fallback),
    format: "xml",
    bytes: await gzipText(text),
  };
}

/* ---------- Songs in Firestore ---------- */

function cloudSong(
  snap: QueryDocumentSnapshot,
  base: string,
  user: boolean,
): Song {
  const { title, format, coverVersion } = snap.data() as Pick<
    Song,
    "title" | "format" | "coverVersion"
  >;
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
    ...(coverVersion !== undefined && {
      coverVersion,
      loadCover: async () => {
        const cover = await getDoc(doc(db, base, "covers", snap.id));
        const bytes = cover.get("data") as Bytes | undefined;
        if (!bytes) throw new Error(`the cover for "${title}" is missing`);
        return new Blob([new Uint8Array(bytes.toUint8Array())], {
          type: cover.get("type"),
        });
      },
    }),
  };
}

async function coverDoc(cover: Blob) {
  if (cover.size > MAX_COVER_BYTES)
    throw new Error("The cover image is too large.");
  const bytes = new Uint8Array(await cover.arrayBuffer());
  return { data: Bytes.fromUint8Array(bytes), type: cover.type };
}

function checkTitle(title: string) {
  if (!title.trim()) throw new Error("The song needs a title.");
}

/** Save a song, and its cover if any, to the signed-in user's library in Firestore. */
async function uploadSong(
  uid: string,
  song: ImportedSong,
  { title, cover }: SongDetails,
) {
  const { bytes } = song;
  checkTitle(title);
  if (bytes.length > MAX_SCORE_BYTES) {
    throw new Error(`"${title}" is too large to sync (over 1 MB compressed).`);
  }
  const base = userDoc(uid);
  const batch = writeBatch(db);
  const coverVersion = cover ? Date.now() : undefined;
  batch.set(doc(db, base, "songs", song.id), {
    title: title.trim(),
    format: song.format,
    createdAt: serverTimestamp(),
    ...(coverVersion && { coverVersion }),
  });
  batch.set(doc(db, base, "scores", song.id), {
    data: Bytes.fromUint8Array(bytes),
  });
  if (cover) batch.set(doc(db, base, "covers", song.id), await coverDoc(cover));
  await batch.commit();
  return coverVersion;
}

const message = (err: unknown) =>
  err instanceof Error ? err.message : String(err);

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
            .map((d) => ({
              song: cloudSong(d, base, true),
              at: d.get("createdAt"),
            }))
            .sort(
              (a, b) =>
                (a.at?.toMillis() ?? Infinity) - (b.at?.toMillis() ?? Infinity),
            )
            .map(({ song }) => song),
        ),
      (err) => {
        setError(`Could not load your songs: ${err.message}`);
        setCloud([]);
      },
    );
  }, [user]);

  /** Save a song read with `readSongFile`. Throws if it cannot be saved. */
  const addSong = useCallback(
    async (song: ImportedSong, details: SongDetails): Promise<Song> => {
      if (!user) throw new Error("Sign in to upload songs.");
      const coverVersion = await uploadSong(user.uid, song, details);
      setError(null);
      const { id, format, bytes } = song;
      const { cover } = details;
      return {
        id,
        title: details.title.trim(),
        format,
        user: true,
        load: () => decodeScore(format, bytes),
        ...(coverVersion &&
          cover && { coverVersion, loadCover: async () => cover }),
      };
    },
    [user],
  );

  /** Change the title or cover of one of the user's songs. Throws if it cannot be saved. */
  const editSong = useCallback(
    async (id: string, { title, cover }: SongDetails) => {
      if (!user) throw new Error("Sign in to edit songs.");
      checkTitle(title);
      const base = userDoc(user.uid);
      const batch = writeBatch(db);
      batch.update(doc(db, base, "songs", id), {
        title: title.trim(),
        ...(cover !== undefined && {
          coverVersion: cover ? Date.now() : deleteField(),
        }),
      });
      if (cover) batch.set(doc(db, base, "covers", id), await coverDoc(cover));
      else if (cover === null) batch.delete(doc(db, base, "covers", id));
      await batch.commit();
      setError(null);
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
      batch.delete(doc(db, base, "covers", id));
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
      if (
        code !== "auth/popup-closed-by-user" &&
        code !== "auth/cancelled-popup-request"
      ) {
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
    loading:
      user === undefined || shared === null || (!!user && cloud === null),
    user: user ?? null,
    signIn,
    signOut,
    addSong,
    editSong,
    removeSong,
    error,
  };
}
