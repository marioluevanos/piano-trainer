import { useEffect, useState } from "react";
import type { Song } from "./index";
import { MAX_COVER_BYTES } from "./paths";

/** Covers are stored at most this many pixels square. */
const COVER_SIZE = 512;

/**
 * Turn a picked image into a cover: crop the center to a square, scale it down
 * to COVER_SIZE and encode it as WebP (JPEG where the browser cannot).
 */
export async function makeCover(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name} is not an image this browser can read.`);
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const size = Math.min(COVER_SIZE, side);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  );
  bitmap.close();

  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.82));
  // Browsers that cannot encode WebP fall back to PNG, which is much larger.
  let blob = await encode("image/webp");
  if (blob?.type !== "image/webp") blob = await encode("image/jpeg");
  if (!blob) throw new Error(`Could not read ${file.name}.`);
  if (blob.size > MAX_COVER_BYTES) throw new Error(`${file.name} is too large for a cover.`);
  return blob;
}

/* ---------- Showing covers ---------- */

/**
 * Object URLs of loaded covers by song id, kept across renders and visits to
 * the home page so the list does not refetch or flicker. `key` is the id plus
 * the cover version; a newer version replaces (and revokes) the old URL.
 */
const cache = new Map<string, { key: string; url?: string; promise: Promise<string> }>();

const coverKey = (song: Song) => `${song.id}@${song.coverVersion}`;

function loadCoverUrl(song: Song) {
  const key = coverKey(song);
  const cached = cache.get(song.id);
  if (cached?.key === key) return cached;
  if (cached?.url) URL.revokeObjectURL(cached.url);
  const entry: { key: string; url?: string; promise: Promise<string> } = {
    key,
    promise: song.loadCover!().then((blob) => (entry.url = URL.createObjectURL(blob))),
  };
  // A failed load is retried the next time the cover is shown.
  entry.promise.catch(() => cache.get(song.id) === entry && cache.delete(song.id));
  cache.set(song.id, entry);
  return entry;
}

/** The cover image URL for a song, or null while it loads or when there is none. */
export function useCoverUrl(song: Song): string | null {
  const key = song.loadCover ? coverKey(song) : null;
  const cached = key ? cache.get(song.id) : undefined;
  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null);

  useEffect(() => {
    if (!key) return;
    let current = true;
    loadCoverUrl(song).promise.then(
      (url) => current && setLoaded({ key, url }),
      () => {}, // The placeholder stays.
    );
    return () => {
      current = false;
    };
    // `song` is rebuilt on every list update; the key captures what matters.
  }, [key]);

  if (!key) return null;
  if (cached?.key === key && cached.url) return cached.url;
  return loaded?.key === key ? loaded.url : null;
}
