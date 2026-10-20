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

/** "Title — Composer" from the score's metadata, or `fallback` if it has no title. */
export function songTitle(xml: string, fallback: string): string {
  const title =
    element(xml, /<work-title>([^<]*)<\/work-title>/) ??
    element(xml, /<movement-title>([^<]*)<\/movement-title>/);
  if (!title) return fallback;
  const composer = element(xml, /<creator type="composer">([^<]*)<\/creator>/);
  return composer ? `${title} — ${composer}` : title;
}

export function isMusicXml(text: string): boolean {
  return /<score-partwise|<score-timewise/.test(text);
}
