/*
 * MusicXML metadata read with plain string matching, so the same code runs in
 * the browser and in the Node import script (scripts/import-songs.ts).
 */

function decodeXml(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function element(xml: string, pattern: RegExp): string | null {
  const text = xml.match(pattern)?.[1];
  return text ? decodeXml(text).trim() || null : null;
}

/** What a score says about itself, as shown in the song list. */
export interface SongMetadata {
  title: string;
  /** The composer (or artist, album…), when the score names one. */
  artist?: string;
}

/**
 * The title and composer from the score's metadata. The title falls back to
 * `fallback` (usually the file name) when the score has none.
 */
export function songMetadata(xml: string, fallback: string): SongMetadata {
  const title =
    element(xml, /<work-title>([^<]*)<\/work-title>/) ??
    element(xml, /<movement-title>([^<]*)<\/movement-title>/) ??
    fallback;
  const artist = element(xml, /<creator type="composer">([^<]*)<\/creator>/);
  return artist ? { title, artist } : { title };
}

/** Songs saved before the artist field stored "Title — Artist" as one title. */
const LEGACY_SEPARATOR = " — ";

/**
 * Metadata for a stored song: its `artist` field, or, for a song saved before
 * that field existed, the artist split off the end of its title.
 */
export function storedMetadata(title: string, artist?: string): SongMetadata {
  if (artist) return { title, artist };
  const at = title.lastIndexOf(LEGACY_SEPARATOR);
  if (at <= 0) return { title };
  const rest = title.slice(at + LEGACY_SEPARATOR.length).trim();
  return rest ? { title: title.slice(0, at).trim(), artist: rest } : { title };
}

export function isMusicXml(text: string): boolean {
  return /<score-partwise|<score-timewise/.test(text);
}
