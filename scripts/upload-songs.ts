/**
 * Publish the songs in src/songs/ to the shared library in Firestore.
 *
 *   npm run upload-songs [-- --dry-run] [--prune]
 *
 * Uploads every src/songs/*.musicxml whose content changed since the last
 * upload (compared by hash). --prune also deletes library songs that no longer
 * have a file here. The app picks the changes up live; no redeploy needed.
 *
 * Writes go through the Admin SDK, which bypasses firestore.rules, using your
 * Google credentials: run `gcloud auth application-default login` once first.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { songTitle } from "../src/songs/metadata.ts";
import { LIBRARY_DOC, MAX_SCORE_BYTES } from "../src/songs/paths.ts";

const SONGS_DIR = fileURLToPath(new URL("../src/songs/", import.meta.url));

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const prune = args.includes("--prune");

  const db = getFirestore(initializeApp({ projectId: "mario-luevanos" }));
  const songsRef = db.collection(`${LIBRARY_DOC}/songs`);
  const scoresRef = db.collection(`${LIBRARY_DOC}/scores`);

  const uploaded = new Map(
    (await songsRef.get()).docs.map((d) => [d.id, d.get("sha") as string | undefined]),
  );
  const local = new Set<string>();
  let changed = 0;

  for (const file of readdirSync(SONGS_DIR).filter((f) => f.endsWith(".musicxml")).sort()) {
    const id = file.replace(/\.musicxml$/, "");
    local.add(id);
    const xml = readFileSync(join(SONGS_DIR, file), "utf8");
    const sha = createHash("sha256").update(xml).digest("hex");
    if (uploaded.get(id) === sha) continue;

    const title = songTitle(xml, id);
    const data = gzipSync(xml, { level: 9 });
    if (data.length > MAX_SCORE_BYTES) {
      console.error(`✗ ${file}: ${data.length} bytes compressed, over Firestore's limit`);
      process.exitCode = 1;
      continue;
    }
    if (!dryRun) {
      const batch = db.batch();
      batch.set(scoresRef.doc(id), { data });
      batch.set(songsRef.doc(id), {
        title,
        format: "xml",
        sha,
        updatedAt: FieldValue.serverTimestamp(),
      });
      await batch.commit();
    }
    changed++;
    const kb = (n: number) => `${Math.round(n / 1024)} kB`;
    console.log(`${uploaded.has(id) ? "↻" : "✓"} ${id}  "${title}"  ${kb(xml.length)} → ${kb(data.length)}`);
  }

  for (const id of uploaded.keys()) {
    if (local.has(id)) continue;
    if (!prune) {
      console.log(`? ${id}: in the library but not in src/songs/ (use --prune to delete it)`);
      continue;
    }
    if (!dryRun) {
      const batch = db.batch();
      batch.delete(songsRef.doc(id));
      batch.delete(scoresRef.doc(id));
      await batch.commit();
    }
    changed++;
    console.log(`✗ ${id}: deleted`);
  }

  const verb = dryRun ? "would change (dry run)" : "changed";
  console.log(`\n${changed} song${changed === 1 ? "" : "s"} ${verb}.`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
