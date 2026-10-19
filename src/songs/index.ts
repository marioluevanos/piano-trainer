import odeToJoy from "./ode-to-joy.musicxml?raw";

export interface Song {
  id: string;
  title: string;
  /** "xml": `data` is MusicXML text. "mxl": `data` is a base64-encoded compressed MusicXML (.mxl) file. */
  format: "xml" | "mxl";
  data: string;
  /** True for songs the user imported (stored in localStorage, removable). */
  user?: boolean;
}

/** Bundled songs. Drop any .musicxml file in this folder and register it here. */
export const BUNDLED_SONGS: Song[] = [
  { id: "ode-to-joy", title: "Ode to Joy — Beethoven", format: "xml", data: odeToJoy },
];

/** What OSMD should load for this song: the XML text, or a Blob for a compressed .mxl. */
export function songSource(song: Song): string | Blob {
  if (song.format === "xml") return song.data;
  const bytes = Uint8Array.from(atob(song.data), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: "application/vnd.recordare.musicxml" });
}
