/*
 * Where songs live in Firestore. Shared by the app and scripts/upload-songs.ts.
 *
 * A song is two documents with the same id: a small one in `songs` (the title,
 * read to build the song list) and one in `scores` holding the score itself as
 * bytes: gzip-compressed MusicXML for "xml", the .mxl archive as-is for "mxl".
 * Keeping them apart means the list never downloads every score.
 *
 * A song may also have a square cover image in `covers/{id}` (`data` bytes plus
 * its MIME `type`). The `songs` doc then carries a `coverVersion` number, which
 * changes whenever the cover does, so a cached image is never shown stale.
 */

/** The bundled library everyone can read. Written only by the upload script. */
export const LIBRARY_DOC = "pianoTrainer/library";

/** Songs a signed-in user imported. */
export const userDoc = (uid: string) => `pianoTrainerUsers/${uid}`;

/** Firestore refuses documents over 1 MiB; leave room for the field names. */
export const MAX_SCORE_BYTES = 1_000_000;

/** Covers are small square images; this keeps them far below the doc limit. */
export const MAX_COVER_BYTES = 300_000;
