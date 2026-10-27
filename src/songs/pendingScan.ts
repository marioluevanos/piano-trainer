/*
 * The last scanned score, kept until it is saved as a song. A scan takes about
 * a minute per page, so closing the Add song dialog, reloading or navigating
 * away must not throw it out. It lives in localStorage (a scanned .mxl is well
 * under the 1 MB import limit, so it fits comfortably) and is cleared once the
 * song is saved or the user discards it.
 */
import { fromBase64, toBase64 } from "./base64";
import type { ImportedSong } from "./library";

const KEY = "piano-trainer.pending-scan.v1";

export interface PendingScan {
  song: ImportedSong;
  /** The PDF or image that was scanned, for the dialog and the notice. */
  fileName: string;
}

interface Stored {
  id: string;
  title: string;
  artist?: string;
  format: ImportedSong["format"];
  fileName: string;
  /** The score bytes as base64. */
  bytes: string;
}

export function savePendingScan({ song, fileName }: PendingScan) {
  try {
    const stored: Stored = {
      id: song.id,
      title: song.title,
      ...(song.artist && { artist: song.artist }),
      format: song.format,
      fileName,
      bytes: toBase64(song.bytes),
    };
    localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // Storage full or unavailable: the scan still lives in memory for this page.
  }
}

export function loadPendingScan(): PendingScan | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { id, title, artist, format, fileName, bytes } = JSON.parse(
      raw,
    ) as Stored;
    if (!id || !bytes || (format !== "xml" && format !== "mxl")) return null;
    return {
      song: {
        id,
        title,
        ...(artist && { artist }),
        format,
        bytes: fromBase64(bytes),
      },
      fileName,
    };
  } catch {
    return null;
  }
}

export function clearPendingScan() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
