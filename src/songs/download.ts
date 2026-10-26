/*
 * Saving a score to the device, so a scanned song can be corrected in
 * Audiveris or MuseScore and uploaded again. Compressed scores download as
 * .mxl, plain MusicXML as .musicxml.
 */
import { decodeScore, type Song } from "./index";
import type { ImportedSong } from "./library";

const XML_TYPE = "application/vnd.recordare.musicxml+xml";

/** A file name from a song title: no path or control characters, sensible length. */
function fileName(title: string, format: Song["format"]): string {
  const base =
    title
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "score";
  return `${base}.${format === "mxl" ? "mxl" : "musicxml"}`;
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before the URL goes away.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function blobFor(format: Song["format"], score: string | Blob): Promise<Blob> {
  if (score instanceof Blob) return score;
  return new Blob([score], { type: format === "mxl" ? "application/vnd.recordare.musicxml" : XML_TYPE });
}

/** Download a song from the library (fetching its score first). */
export async function downloadSong(song: Song) {
  save(await blobFor(song.format, await song.load()), fileName(song.title, song.format));
}

/** Download a song that was read or scanned but not saved yet. */
export async function downloadImported(song: ImportedSong) {
  const score = await decodeScore(song.format, song.bytes);
  save(await blobFor(song.format, score), fileName(song.title, song.format));
}
