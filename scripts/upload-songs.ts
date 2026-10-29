/**
 * Publish the songs in library/ to the shared library in Firestore.
 *
 *   npm run upload-songs [-- --dry-run] [--prune]
 *
 * Uploads every library/*.musicxml whose content changed since the last
 * upload (compared by hash); a song whose score is unchanged but whose stored
 * title or artist differs from the score's metadata (e.g. after a change to
 * how it is read) gets just those fields updated. An image next to a score with the same name
 * (fur-elise.webp / .jpg / .jpeg / .png) becomes its cover. Covers are not
 * resized here, so make them square and small (under MAX_COVER_BYTES). --prune also deletes library songs that no longer
 * have a file here. The app picks the changes up live; no redeploy needed.
 *
 * A song edited in the app by a library editor (see firestore.rules) carries
 * `editedAt`. Its title, artist and cover are then left as edited: only the
 * score, and a cover whose image file changed here, are uploaded again. A
 * song removed in the app comes back on the next upload unless its file is
 * removed from library/ too.
 *
 * Writes go through the Admin SDK, which bypasses firestore.rules, using your
 * Google credentials: run `gcloud auth application-default login` once first.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { songMetadata } from "../src/songs/metadata.ts";
import { LIBRARY_DOC, MAX_COVER_BYTES, MAX_SCORE_BYTES } from "../src/songs/paths.ts";

const SONGS_DIR = fileURLToPath(new URL("../library/", import.meta.url));

const COVER_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const prune = args.includes("--prune");

  const db = getFirestore(initializeApp({ projectId: "mario-luevanos" }));
  const songsRef = db.collection(`${LIBRARY_DOC}/songs`);
  const scoresRef = db.collection(`${LIBRARY_DOC}/scores`);
  const coversRef = db.collection(`${LIBRARY_DOC}/covers`);

  const uploaded = new Map(
    (await songsRef.get()).docs.map((d) => [
      d.id,
      {
        title: d.get("title") as string | undefined,
        artist: d.get("artist") as string | undefined,
        sha: d.get("sha") as string | undefined,
        coverSha: d.get("coverSha") as string | undefined,
        coverVersion: d.get("coverVersion") as number | undefined,
        editedAt: d.get("editedAt") as unknown,
      },
    ]),
  );
  const files = readdirSync(SONGS_DIR);
  const local = new Set<string>();
  let changed = 0;

  for (const file of files.filter((f) => f.endsWith(".musicxml")).sort()) {
    const id = file.replace(/\.musicxml$/, "");
    local.add(id);
    const xml = readFileSync(join(SONGS_DIR, file), "utf8");
    const sha = sha256(xml);

    const coverFile = files.find(
      (f) => f.slice(0, -extname(f).length) === id && extname(f).toLowerCase() in COVER_TYPES,
    );
    const cover = coverFile ? readFileSync(join(SONGS_DIR, coverFile)) : undefined;
    if (cover && cover.length > MAX_COVER_BYTES) {
      console.error(`✗ ${coverFile}: ${cover.length} bytes, over the ${MAX_COVER_BYTES} byte cover limit`);
      process.exitCode = 1;
      continue;
    }
    const coverSha = cover && sha256(cover);
    const before = uploaded.get(id);
    const edited = !!before?.editedAt;
    // The app's edits win over the file's metadata.
    const { title, artist } = edited
      ? { title: before!.title ?? id, artist: before!.artist }
      : songMetadata(xml, id);
    const coverChanged = coverSha !== before?.coverSha;
    if (before?.sha === sha && !coverChanged) {
      if (edited || (before.title === title && before.artist === artist)) continue;
      if (!dryRun) {
        await songsRef.doc(id).update({ title, artist: artist ?? FieldValue.delete() });
      }
      changed++;
      console.log(`↻ ${id}  "${title}"${artist ? ` by ${artist}` : ""}  (metadata only)`);
      continue;
    }

    const data = gzipSync(xml, { level: 9 });
    if (data.length > MAX_SCORE_BYTES) {
      console.error(`✗ ${file}: ${data.length} bytes compressed, over Firestore's limit`);
      process.exitCode = 1;
      continue;
    }
    // Keep the cover version unless the image file changed, so clients keep
    // their cached image (and an edited song keeps the cover set in the app).
    const coverVersion = coverChanged
      ? cover && Date.now()
      : before?.coverVersion;
    if (!dryRun) {
      const batch = db.batch();
      batch.set(scoresRef.doc(id), { data });
      batch.set(songsRef.doc(id), {
        title,
        ...(artist && { artist }),
        format: "xml",
        sha,
        updatedAt: FieldValue.serverTimestamp(),
        ...(coverSha && { coverSha }),
        ...(coverVersion && { coverVersion }),
        ...(edited && { editedAt: before!.editedAt }),
      });
      if (coverChanged) {
        if (cover) {
          batch.set(coversRef.doc(id), {
            data: cover,
            type: COVER_TYPES[extname(coverFile!).toLowerCase()],
          });
        } else {
          batch.delete(coversRef.doc(id));
        }
      }
      await batch.commit();
    }
    changed++;
    const kb = (n: number) => `${Math.round(n / 1024)} kB`;
    const coverNote = !coverChanged ? "" : cover ? `  + cover ${kb(cover.length)}` : "  − cover";
    console.log(
      `${before ? "↻" : "✓"} ${id}  "${title}"${artist ? ` by ${artist}` : ""}  ${kb(xml.length)} → ${kb(data.length)}${coverNote}`,
    );
  }

  for (const id of uploaded.keys()) {
    if (local.has(id)) continue;
    if (!prune) {
      console.log(`? ${id}: in Firestore but not in library/ (use --prune to delete it)`);
      continue;
    }
    if (!dryRun) {
      const batch = db.batch();
      batch.delete(songsRef.doc(id));
      batch.delete(scoresRef.doc(id));
      batch.delete(coversRef.doc(id));
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
