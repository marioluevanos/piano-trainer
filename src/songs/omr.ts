/*
 * Scanning sheet music: a PDF or an image of printed music goes to the
 * scanner service in omr/ (Audiveris behind a small HTTP server), which
 * returns a compressed MusicXML (.mxl) file that then takes the normal import
 * path (readSongFile). The service's URL is VITE_OMR_URL; without it the
 * feature is hidden. The service only accepts the accounts in SCAN_USERS
 * (and enforces that itself from the Firebase ID token).
 */
import type { User } from "firebase/auth";
import { fromBase64 } from "./base64";

const OMR_URL = (import.meta.env.VITE_OMR_URL as string | undefined)?.replace(/\/+$/, "");

/** Google accounts allowed to scan; must match OMR_ALLOWED_EMAILS on the service. */
const SCAN_USERS = ["marioluevanos@gmail.com"];

/** What the scanner reads, for the file picker. */
export const SCAN_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.tif,.tiff,.bmp,.gif,application/pdf,image/png,image/jpeg,image/tiff,image/bmp,image/gif";

/** Whether this user gets the "Scan sheet music" button. */
export function canScan(user: User | null): boolean {
  if (!OMR_URL || !user?.email) return false;
  return SCAN_USERS.includes(user.email.toLowerCase());
}

/* ---------- Scan options ---------- */

/** Music fonts Audiveris has note head templates for; pick the one the edition uses. */
export const SCAN_FONTS = ["Bravura", "Leland", "Primus", "FinaleJazz", "JazzPerc"] as const;
export type ScanFont = (typeof SCAN_FONTS)[number];

/** How the engine is tuned for one scan (sent as the query string, see omr/server.ts). */
export interface ScanOptions {
  /** "poor" relaxes recognition for rough scans and photos. */
  quality: "standard" | "poor";
  font: ScanFont;
  /** Kinds of items to look for. Turning off ones the piece lacks avoids false matches. */
  lyrics: boolean;
  chordNames: boolean;
  fingerings: boolean;
  articulations: boolean;
  dynamics: boolean;
  /** Cue-sized note heads (Audiveris warns these can cause collateral damage). */
  smallHeads: boolean;
  /** Triplets written without a "3". */
  implicitTuplets: boolean;
}

/** Audiveris' own defaults. */
export const DEFAULT_SCAN_OPTIONS: ScanOptions = {
  quality: "standard",
  font: "Bravura",
  lyrics: true,
  chordNames: false,
  fingerings: false,
  articulations: true,
  dynamics: true,
  smallHeads: false,
  implicitTuplets: false,
};

const OPTIONS_KEY = "piano-trainer.scan-options.v1";

/** The options used last time, so a second try starts from them. */
export function loadScanOptions(): ScanOptions {
  try {
    const raw = localStorage.getItem(OPTIONS_KEY);
    if (!raw) return DEFAULT_SCAN_OPTIONS;
    const stored = JSON.parse(raw) as Partial<ScanOptions>;
    const options = { ...DEFAULT_SCAN_OPTIONS };
    for (const key of Object.keys(options) as (keyof ScanOptions)[]) {
      const value = stored[key];
      if (typeof value === typeof options[key]) (options as Record<string, unknown>)[key] = value;
    }
    if (!SCAN_FONTS.includes(options.font)) options.font = DEFAULT_SCAN_OPTIONS.font;
    if (options.quality !== "poor") options.quality = "standard";
    return options;
  } catch {
    return DEFAULT_SCAN_OPTIONS;
  }
}

export function saveScanOptions(options: ScanOptions) {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
  } catch {
    // Not remembering the options is harmless.
  }
}

function query(options: ScanOptions): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    params.set(key, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
  }
  return params.toString();
}

/* ---------- Progress ---------- */

/** How far a scan has come, from the service's progress stream. */
export interface ScanProgress {
  /** 0..1 */
  value: number;
  /** The Audiveris step under way, e.g. "HEADS"; absent while starting or waiting. */
  step?: string;
  /** The page being processed, 1-based, and how many there are. */
  sheet?: number;
  sheets?: number;
  /** True while another scan is ahead of this one on the service. */
  waiting?: boolean;
}

/** What each Audiveris step is doing, in plain words for the progress line. */
const STEP_LABELS: Record<string, string> = {
  LOAD: "Loading the page",
  BINARY: "Cleaning up the image",
  SCALE: "Measuring the staves",
  GRID: "Finding the staves",
  HEADERS: "Reading clefs and key signatures",
  STEM_SEEDS: "Finding stems",
  BEAMS: "Finding beams",
  LEDGERS: "Finding ledger lines",
  HEADS: "Finding note heads",
  STEMS: "Attaching stems",
  REDUCTION: "Checking the notes",
  CUE_BEAMS: "Finding cue notes",
  TEXTS: "Reading text",
  MEASURES: "Finding measures",
  CHORDS: "Grouping chords",
  CURVES: "Finding slurs and ties",
  SYMBOLS: "Recognizing symbols",
  LINKS: "Linking symbols to notes",
  RHYTHMS: "Working out the rhythm",
  PAGE: "Finishing the page",
};

/** A short description of what the scanner is doing right now. */
export function describeScanProgress({ step, sheet, sheets, waiting }: ScanProgress): string {
  if (waiting) return "Waiting for the scanner";
  if (!step) return "Starting the scanner";
  const label = STEP_LABELS[step] ?? "Processing";
  return sheets && sheets > 1 ? `Page ${sheet} of ${sheets}: ${label.toLowerCase()}` : label;
}

type Message =
  | ({ type: "progress" } & ScanProgress)
  | { type: "done"; movements: number; mxl: string }
  | { type: "error"; status: number; error: string };

/** Read the service's newline-delimited JSON stream, reporting progress, until the file arrives. */
async function readStream(
  body: ReadableStream<Uint8Array>,
  onProgress?: (progress: ScanProgress) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffered += done ? decoder.decode() : decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffered.indexOf("\n")) >= 0) {
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      if (!line) continue;
      const message = JSON.parse(line) as Message;
      if (message.type === "progress") {
        const { type: _type, ...progress } = message;
        onProgress?.(progress);
      } else if (message.type === "done") {
        onProgress?.({ value: 1 });
        return fromBase64(message.mxl);
      } else {
        throw new Error(message.error);
      }
    }
    if (done) throw new Error("The scanner stopped before the score was ready. Try again.");
  }
}

/* ---------- Scanning ---------- */

/**
 * Scan `file` into a .mxl File named after it, reporting progress along the
 * way. Throws with a message for the user if the service refuses or finds no
 * music. `signal` cancels the scan on the service too.
 */
export async function scanSheetMusic(
  file: File,
  user: User,
  options: ScanOptions,
  signal?: AbortSignal,
  onProgress?: (progress: ScanProgress) => void,
): Promise<File> {
  if (!OMR_URL) throw new Error("Scanning is not set up.");
  const token = await user.getIdToken();
  let res: Response;
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    res = await fetch(`${OMR_URL}/scan?${query(options)}`, {
      method: "POST",
      headers: {
        Accept: "application/x-ndjson",
        Authorization: `Bearer ${token}`,
        "Content-Type": file.type || "application/octet-stream",
        "X-File-Name": encodeURIComponent(file.name),
      },
      body: file,
      signal,
    });
    if (!res.ok) {
      let message = `Scanning failed (${res.status}).`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) message = body.error;
      } catch {
        // Keep the status message.
      }
      throw new Error(message);
    }
    const streamed = res.headers.get("Content-Type")?.includes("application/x-ndjson");
    bytes = streamed && res.body ? await readStream(res.body, onProgress) : new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    if (signal?.aborted) throw new Error("Scan cancelled.");
    if (err instanceof TypeError) {
      throw new Error("The scanner could not be reached. Check your connection and try again.", {
        cause: err,
      });
    }
    throw err;
  }
  const name = file.name.replace(/\.[^.]+$/, "") + ".mxl";
  return new File([bytes], name, { type: "application/vnd.recordare.musicxml" });
}
