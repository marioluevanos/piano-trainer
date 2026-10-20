/*
 * Where songs live in Firestore. Shared by the app and scripts/upload-songs.ts.
 *
 * A song is two documents with the same id: a small one in `songs` (the title,
 * read to build the song list) and one in `scores` holding the score itself as
 * bytes: gzip-compressed MusicXML for "xml", the .mxl archive as-is for "mxl".
 * Keeping them apart means the list never downloads every score.
 */

/** The bundled library everyone can read. Written only by the upload script. */
export const LIBRARY_DOC = "pianoTrainer/library";

/** Songs a signed-in user imported. */
export const userDoc = (uid: string) => `pianoTrainerUsers/${uid}`;

/** Firestore refuses documents over 1 MiB; leave room for the field names. */
export const MAX_SCORE_BYTES = 1_000_000;
