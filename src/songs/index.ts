import { songTitle } from "./metadata";

export interface Song {
  id: string;
  title: string;
  /** "xml": `data` is MusicXML text. "mxl": `data` is a base64-encoded compressed MusicXML (.mxl) file. */
  format: "xml" | "mxl";
  data: string;
  /** True for songs the user imported (stored in localStorage, removable). */
  user?: boolean;
}

/**
 * Every .musicxml file in this folder, imported as text. Add songs with
 * `npm run import-songs -- <folder>`; the title comes from the score itself.
 */
const files = import.meta.glob<string>("./*.musicxml", {
  query: "?raw",
  import: "default",
  eager: true,
});

export const BUNDLED_SONGS: Song[] = Object.entries(files)
  .map(([path, data]): Song => {
    const id = path.replace(/^\.\/|\.musicxml$/g, "");
    return { id, title: songTitle(data, id), format: "xml", data };
  })
  .sort((a, b) => a.title.localeCompare(b.title));

/** What OSMD should load for this song: the XML text, or a Blob for a compressed .mxl. */
export function songSource(song: Song): string | Blob {
  if (song.format === "xml") return song.data;
  const bytes = Uint8Array.from(atob(song.data), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: "application/vnd.recordare.musicxml" });
}
