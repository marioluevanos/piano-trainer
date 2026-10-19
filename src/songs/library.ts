import { useCallback, useEffect, useState } from "react";
import { BUNDLED_SONGS, type Song } from "./index";

const STORAGE_KEY = "piano-trainer.songs.v1";

function loadUserSongs(): Song[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Song[];
    return Array.isArray(parsed)
      ? parsed.map((s) => ({ ...s, user: true }))
      : [];
  } catch {
    return [];
  }
}

function saveUserSongs(songs: Song[]): string | null {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
    return null;
  } catch (err) {
    return err instanceof Error && err.name === "QuotaExceededError"
      ? "Browser storage is full. Remove a song to make room."
      : "Could not save the song in this browser.";
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function titleFromXml(xml: string, fallback: string): string {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const title =
    doc.querySelector("work > work-title")?.textContent?.trim() ||
    doc.querySelector("movement-title")?.textContent?.trim();
  const composer = doc
    .querySelector('identification > creator[type="composer"]')
    ?.textContent?.trim();
  if (!title) return fallback;
  return composer ? `${title} — ${composer}` : title;
}

/** Turn a .musicxml / .xml / .mxl file into a Song. Throws on unsupported input. */
export async function songFromFile(file: File): Promise<Song> {
  const fallback = file.name.replace(/\.(musicxml|xml|mxl)$/i, "");
  const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const isMxl = /\.mxl$/i.test(file.name) || file.type.includes("zip");
  if (isMxl) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return {
      id,
      title: fallback,
      format: "mxl",
      data: bytesToBase64(bytes),
      user: true,
    };
  }
  const text = await file.text();
  if (!/<score-partwise|<score-timewise/.test(text)) {
    throw new Error(
      `${file.name} is not a MusicXML file. Export MusicXML from MuseScore (File → Export).`,
    );
  }
  return {
    id,
    title: titleFromXml(text, fallback),
    format: "xml",
    data: text,
    user: true,
  };
}

export function useSongLibrary() {
  const [userSongs, setUserSongs] = useState<Song[]>(() => loadUserSongs());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const err = saveUserSongs(userSongs);
    if (err) setError(err);
  }, [userSongs]);

  const addSong = useCallback(async (file: File): Promise<Song | null> => {
    try {
      const song = await songFromFile(file);
      setUserSongs((prev) => [...prev, song]);
      setError(null);
      return song;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, []);

  const removeSong = useCallback((id: string) => {
    setUserSongs((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return {
    songs: [...BUNDLED_SONGS, ...userSongs],
    addSong,
    removeSong,
    error,
  };
}
