/**
 * Bring MusicXML songs into the app.
 *
 *   npm run import-songs -- <folder or file>... [--force] [--dry-run]
 *
 * Reads every .mxl, .musicxml and .xml file it is given (folders are scanned,
 * not recursively), unpacks compressed .mxl archives, checks that each score
 * suits the app, and writes it as library/<title>.musicxml, ready for
 * `npm run upload-songs` to publish.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { isMusicXml, songMetadata } from "../src/songs/metadata.ts";

const SONGS_DIR = fileURLToPath(new URL("../library/", import.meta.url));
const SCORE_EXTENSIONS = new Set([".mxl", ".musicxml", ".xml"]);
/** Formats people often have that need converting first, with a hint. */
const CONVERT_HINTS: Record<string, string> = {
  ".mid": "MIDI: open it in MuseScore Studio, tidy it up, then export MusicXML",
  ".midi": "MIDI: open it in MuseScore Studio, tidy it up, then export MusicXML",
  ".mscz": "MuseScore file: open it in MuseScore Studio and export MusicXML",
  ".mus": "Finale file: export MusicXML from Finale",
  ".musx": "Finale file: export MusicXML from Finale",
  ".pdf": "PDF: convert with optical music recognition (e.g. Audiveris) first",
};

/* ---------- Unpacking .mxl (a zip archive) ---------- */

/** Every file in a zip archive, by name. Supports stored and deflated entries. */
function readZip(buf: Buffer): Map<string, Buffer> {
  // The end-of-central-directory record sits in the last 64 KiB + 22 bytes.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a valid .mxl (zip) archive");

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("corrupt zip directory");
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    if (method === 0) files.set(name, raw);
    else if (method === 8) files.set(name, inflateRawSync(raw));
    else throw new Error(`unsupported zip compression (method ${method})`);
  }
  return files;
}

/** The score inside a .mxl: the file META-INF/container.xml names, else the first .xml. */
function scoreFromMxl(buf: Buffer): string {
  const files = readZip(buf);
  const container = files.get("META-INF/container.xml")?.toString("utf8");
  const named = container?.match(/<rootfile[^>]*full-path="([^"]+)"/)?.[1];
  const name =
    (named && files.has(named) ? named : undefined) ??
    [...files.keys()].find((f) => !f.startsWith("META-INF/") && /\.(xml|musicxml)$/i.test(f));
  if (!name) throw new Error("no score found inside the .mxl");
  return files.get(name)!.toString("utf8");
}

/* ---------- Checks ---------- */

/** Things about a score that would make it play badly in the app. */
function scoreWarnings(xml: string): string[] {
  const warnings: string[] = [];
  if (/<score-timewise/.test(xml)) {
    warnings.push("timewise MusicXML is rarely supported; re-export as partwise from MuseScore");
  }
  const parts = (xml.match(/<score-part\b/g) ?? []).length;
  if (parts > 1) {
    warnings.push(
      `${parts} parts: only the first staff counts as right hand, every other staff as left hand`,
    );
  }
  const staves = Number(xml.match(/<staves>(\d+)<\/staves>/)?.[1] ?? 1);
  if (parts === 1 && staves < 2) {
    warnings.push("one staff only: every note will count as right hand");
  }
  if (!/<sound[^>]*\btempo="|<per-minute>/.test(xml)) {
    warnings.push("no tempo marking: playback will use 100 bpm");
  }
  return warnings;
}

/* ---------- Import ---------- */

function slug(text: string): string {
  return (
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/, "") || "song"
  );
}

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

/** Hash → file name of every song already in library/, to spot re-imports. */
function existingSongs(): Map<string, string> {
  const byHash = new Map<string, string>();
  for (const f of readdirSync(SONGS_DIR)) {
    if (f.endsWith(".musicxml")) byHash.set(sha(readFileSync(join(SONGS_DIR, f), "utf8")), f);
  }
  return byHash;
}

function collect(paths: string[]): string[] {
  const files: string[] = [];
  for (const p of paths) {
    const full = resolve(p);
    if (!existsSync(full)) {
      console.error(`✗ ${p}: not found`);
      process.exitCode = 1;
    } else if (statSync(full).isDirectory()) {
      for (const f of readdirSync(full).sort()) {
        if (!f.startsWith(".") && statSync(join(full, f)).isFile()) files.push(join(full, f));
      }
    } else {
      files.push(full);
    }
  }
  return files;
}

function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const dryRun = args.includes("--dry-run");
  const paths = args.filter((a) => !a.startsWith("--"));
  if (paths.length === 0) {
    console.log("Usage: npm run import-songs -- <folder or file>... [--force] [--dry-run]");
    process.exitCode = 1;
    return;
  }

  const existing = existingSongs();
  let imported = 0;

  for (const file of collect(paths)) {
    const name = basename(file);
    const ext = extname(file).toLowerCase();
    if (!SCORE_EXTENSIONS.has(ext)) {
      const hint = CONVERT_HINTS[ext];
      if (hint) console.log(`– ${name}: skipped. ${hint}.`);
      continue;
    }

    let xml: string;
    try {
      xml = ext === ".mxl" ? scoreFromMxl(readFileSync(file)) : readFileSync(file, "utf8");
    } catch (err) {
      console.error(`✗ ${name}: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
      continue;
    }
    if (!isMusicXml(xml)) {
      console.log(`– ${name}: skipped, not a MusicXML score.`);
      continue;
    }

    const already = existing.get(sha(xml));
    if (already) {
      console.log(`= ${name}: already imported as ${already}`);
      continue;
    }

    const { title, artist } = songMetadata(xml, basename(file, extname(file)));
    const target = `${slug(title)}.musicxml`; // file name from the title, not the composer
    const targetPath = join(SONGS_DIR, target);
    if (existsSync(targetPath) && !force) {
      console.error(`✗ ${name}: ${target} already exists with different content (use --force to replace it)`);
      process.exitCode = 1;
      continue;
    }

    if (!dryRun) writeFileSync(targetPath, xml);
    existing.set(sha(xml), target);
    imported++;
    console.log(`✓ ${name} → ${relative(process.cwd(), targetPath)}  "${title}"${artist ? ` by ${artist}` : ""}`);
    for (const w of scoreWarnings(xml)) console.log(`    ⚠ ${w}`);
  }

  const verb = dryRun ? "would be imported (dry run)" : "imported";
  console.log(`\n${imported} song${imported === 1 ? "" : "s"} ${verb}.`);
}

main();
