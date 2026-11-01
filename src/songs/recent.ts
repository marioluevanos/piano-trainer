/**
 * The songs opened most recently, newest first, remembered on the device so
 * the home page can put them at the top.
 */

const RECENT_KEY = "piano-trainer.recent-songs.v1";
/** Where the single last opened song was kept before the history existed. */
const LEGACY_SELECTED_KEY = "piano-trainer.selected-song.v1";
const MAX_RECENT = 20;

/** The ids of the recently opened songs, newest first; empty when none are known. */
export function loadRecentSongIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (raw !== null) {
      const ids: unknown = JSON.parse(raw);
      if (Array.isArray(ids) && ids.every((id) => typeof id === "string"))
        return ids;
    }
    const legacy = localStorage.getItem(LEGACY_SELECTED_KEY);
    return legacy ? [legacy] : [];
  } catch {
    return [];
  }
}

export function saveRecentSongIds(ids: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids));
  } catch {
    // Not remembering the history is harmless.
  }
}

/** The history with `id` as the newest entry, kept to the last few songs. */
export function withRecentSong(ids: string[], id: string): string[] {
  return [id, ...ids.filter((other) => other !== id)].slice(0, MAX_RECENT);
}

/** How many songs the home page shows as recently played. */
export const RECENT_SHOWN = 2;

/**
 * The songs to show as recently played, newest first: the last one opened from
 * the user's own songs and the last one from the shared library. When one of
 * the two is missing (nothing played from that list yet, or not signed in),
 * the next most recently played songs fill in, up to `RECENT_SHOWN`.
 */
export function recentlyPlayed<T extends { id: string; user?: boolean }>(
  ids: string[],
  songs: readonly T[],
): T[] {
  const byId = new Map(songs.map((s) => [s.id, s]));
  const played = ids.flatMap((id) => byId.get(id) ?? []);
  const newestOwn = played.find((s) => s.user);
  const newestShared = played.find((s) => !s.user);
  const picked = played.filter((s) => s === newestOwn || s === newestShared);
  for (const song of played) {
    if (picked.length >= RECENT_SHOWN) break;
    if (!picked.includes(song)) picked.push(song);
  }
  return played.filter((s) => picked.includes(s)).slice(0, RECENT_SHOWN);
}
