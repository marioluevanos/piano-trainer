export interface Song {
  id: string;
  title: string;
  /** The composer, artist or album, shown under the title; absent when unknown. */
  artist?: string;
  /** "xml": MusicXML text. "mxl": a compressed MusicXML (.mxl) archive. */
  format: "xml" | "mxl";
  /** True for songs the user imported (removable). */
  user?: boolean;
  /** Fetches the score: XML text, or a Blob for a compressed .mxl, ready for OSMD. */
  load: () => Promise<string | Blob>;
  /** Changes whenever the cover image does; absent when the song has none. */
  coverVersion?: number;
  /** Fetches the cover image. Present only when `coverVersion` is. */
  loadCover?: () => Promise<Blob>;
}

const MXL_TYPE = "application/vnd.recordare.musicxml";

async function pipe(
  bytes: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** MusicXML text as stored in Firestore (see paths.ts). */
export function gzipText(text: string): Promise<Uint8Array<ArrayBuffer>> {
  return pipe(new TextEncoder().encode(text), new CompressionStream("gzip"));
}

/** What OSMD should load for score bytes stored in Firestore. */
export async function decodeScore(
  format: Song["format"],
  bytes: Uint8Array<ArrayBuffer>,
): Promise<string | Blob> {
  if (format === "mxl") return new Blob([bytes], { type: MXL_TYPE });
  return new TextDecoder().decode(await pipe(bytes, new DecompressionStream("gzip")));
}
