/**
 * Sheet music scanner: turns a PDF or an image of printed sheet music into a
 * compressed MusicXML (.mxl) file with Audiveris, for the app's "Scan sheet
 * music" button. Runs in the Docker image next to this file (see README.md).
 *
 *   POST /scan?<options>  body: the PDF/image bytes
 *                         Authorization: Bearer <Firebase ID token>
 *                         Content-Type: application/pdf or image/...
 *                         X-File-Name: the original file name (optional, picks the input type)
 *                         → 200 with the .mxl bytes, or a JSON { error } with a 4xx/5xx status
 *                         With "Accept: application/x-ndjson" the response streams progress
 *                         instead (one JSON object per line, see Message below), ending with
 *                         the .mxl as base64. Closing the connection cancels the scan.
 *   GET  /health          → 200 "ok"
 *
 * Scan options (query string) tune the Audiveris engine; see OPTIONS below.
 *   quality=standard|poor|synthetic   expected image quality (Profiles.defaultQuality)
 *   font=Bravura|Leland|Primus|FinaleJazz|JazzPerc   the edition's music font (head templates)
 *   lyrics|chordNames|fingerings|articulations|dynamics|smallHeads|implicitTuplets=0|1
 *                                     recognize that kind of item (ProcessingSwitches)
 * Anything else is ignored; only whitelisted constants reach the command line.
 *
 * Only the Google accounts in OMR_ALLOWED_EMAILS may scan: the ID token is
 * verified with Firebase Auth and its (verified) email must be in the list.
 * Audiveris needs a lot of memory, so scans run one at a time.
 *
 * Environment:
 *   PORT                 listening port (8080)
 *   OMR_ALLOWED_EMAILS   comma-separated Google emails allowed to scan (marioluevanos@gmail.com)
 *   OMR_MAX_BYTES        largest accepted upload (25 MB)
 *   OMR_TIMEOUT_MS       longest Audiveris run (15 min)
 *   OMR_QUEUE            scans allowed to wait for the running one (3)
 *   AUDIVERIS            path of the Audiveris launcher (/opt/audiveris/bin/Audiveris)
 *   GOOGLE_CLOUD_PROJECT the Firebase project whose users sign in (mario-luevanos)
 *   OMR_DEV_NO_AUTH=1    skip the token check, for local testing with curl only
 */
import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { createInterface } from "node:readline";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const PORT = Number(process.env.PORT ?? 8080);
const ALLOWED_EMAILS = new Set(
  (process.env.OMR_ALLOWED_EMAILS ?? "marioluevanos@gmail.com")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);
const MAX_BYTES = Number(process.env.OMR_MAX_BYTES ?? 25 * 1024 * 1024);
const TIMEOUT_MS = Number(process.env.OMR_TIMEOUT_MS ?? 15 * 60 * 1000);
const QUEUE = Number(process.env.OMR_QUEUE ?? 3);
const AUDIVERIS = process.env.AUDIVERIS ?? "/opt/audiveris/bin/Audiveris";
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT ?? "mario-luevanos";
const DEV_NO_AUTH = process.env.OMR_DEV_NO_AUTH === "1";

const MXL_TYPE = "application/vnd.recordare.musicxml";
const NDJSON_TYPE = "application/x-ndjson";

/** Input types Audiveris reads, by extension; the content type is the fallback. */
const INPUT_EXTENSIONS = new Set([".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".gif"]);
const EXTENSION_BY_TYPE: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/tiff": ".tif",
  "image/bmp": ".bmp",
  "image/gif": ".gif",
};

/* ---------- Scan options → Audiveris constants ---------- */

const SWITCHES = "org.audiveris.omr.sheet.ProcessingSwitches";
const QUALITIES: Record<string, string> = { standard: "Standard", poor: "Poor", synthetic: "Synthetic" };
const FONTS = new Set(["Bravura", "Leland", "Primus", "FinaleJazz", "JazzPerc"]);
/** Boolean options and the processing switches each one sets. */
const BOOLEAN_OPTIONS: Record<string, string[]> = {
  lyrics: ["lyrics"],
  chordNames: ["chordNames"],
  fingerings: ["fingerings"],
  articulations: ["articulations"],
  dynamics: ["dynamicsAboveStaff", "dynamicsBelowStaff"],
  smallHeads: ["smallHeads"],
  implicitTuplets: ["implicitTuplets"],
};

/** `-constant KEY=VALUE` arguments for the recognized options in `query`. */
function constantArgs(query: URLSearchParams): string[] {
  const constants: string[] = [];
  const quality = QUALITIES[query.get("quality")?.toLowerCase() ?? ""];
  if (quality) constants.push(`org.audiveris.omr.sheet.Profiles.defaultQuality=${quality}`);
  const font = query.get("font") ?? "";
  if (FONTS.has(font)) constants.push(`org.audiveris.omr.ui.symbol.MusicFont.defaultMusicFamily=${font}`);
  for (const [option, switches] of Object.entries(BOOLEAN_OPTIONS)) {
    const value = query.get(option);
    if (value !== "0" && value !== "1") continue;
    for (const name of switches) constants.push(`${SWITCHES}.${name}=${value === "1"}`);
  }
  return constants.flatMap((c) => ["-constant", c]);
}

initializeApp({ projectId: PROJECT_ID });
if (DEV_NO_AUTH) console.warn("OMR_DEV_NO_AUTH is set: anyone can scan. Never deploy like this.");

// A plain field rather than a constructor parameter property: Node's type
// stripping only erases types, it does not rewrite TypeScript-only syntax.
class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/* ---------- Auth ---------- */

/** The verified email of the signed-in user, or throws 401/403. */
async function authorize(req: IncomingMessage): Promise<string> {
  if (DEV_NO_AUTH) return "dev";
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "Sign in to scan sheet music.");
  let email: string | undefined;
  let verified = false;
  try {
    const decoded = await getAuth().verifyIdToken(token);
    email = decoded.email?.toLowerCase();
    verified = decoded.email_verified === true;
  } catch {
    throw new HttpError(401, "Your sign-in has expired. Sign in again to scan.");
  }
  if (!email || !verified || !ALLOWED_EMAILS.has(email)) {
    throw new HttpError(403, "Scanning is not enabled for this account.");
  }
  return email;
}

/* ---------- Request body ---------- */

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > MAX_BYTES) throw new HttpError(413, tooLarge());
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BYTES) throw new HttpError(413, tooLarge());
    chunks.push(chunk as Buffer);
  }
  if (!size) throw new HttpError(400, "The upload is empty.");
  return Buffer.concat(chunks);
}

function tooLarge() {
  return `The file is too large to scan (over ${Math.round(MAX_BYTES / 1024 / 1024)} MB).`;
}

/** The extension Audiveris should see, from the file name or the content type. */
function inputExtension(req: IncomingMessage): string {
  const name = decodeURIComponent(String(req.headers["x-file-name"] ?? ""));
  const fromName = extname(name).toLowerCase();
  if (INPUT_EXTENSIONS.has(fromName)) return fromName;
  const type = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  const fromType = EXTENSION_BY_TYPE[type];
  if (fromType) return fromType;
  throw new HttpError(
    415,
    "Pick a PDF or a PNG, JPEG, TIFF, BMP or GIF image of printed sheet music.",
  );
}

/* ---------- Progress ---------- */

/**
 * Audiveris' processing steps per page, in order, weighted by how long each
 * takes relative to the others (measured on a two-page piano score; beams
 * and note heads dominate). Units are roughly seconds per page.
 */
const STEP_WEIGHTS: Record<string, number> = {
  LOAD: 1,
  BINARY: 1,
  SCALE: 0.2,
  GRID: 1,
  HEADERS: 1,
  STEM_SEEDS: 0.3,
  BEAMS: 6,
  LEDGERS: 0.5,
  HEADS: 4,
  STEMS: 0.6,
  REDUCTION: 0.2,
  CUE_BEAMS: 0.1,
  TEXTS: 1.5,
  MEASURES: 0.2,
  CHORDS: 0.2,
  CURVES: 1.2,
  SYMBOLS: 1,
  LINKS: 0.2,
  RHYTHMS: 0.3,
  PAGE: 2,
};
const STEPS = Object.keys(STEP_WEIGHTS);
const PAGE_WEIGHT = Object.values(STEP_WEIGHTS).reduce((a, b) => a + b, 0);
/** JVM start and book loading before the first step, and the MusicXML export after the last. */
const STARTUP_WEIGHT = 4;
const EXPORT_WEIGHT = 1;

/** What the client is told as the scan advances (one JSON line each). */
type Message =
  | { type: "progress"; value: number; step?: string; sheet?: number; sheets?: number; waiting?: true }
  | { type: "done"; movements: number; mxl: string }
  | { type: "error"; status: number; error: string };

/**
 * Follows Audiveris' log to estimate how far a scan has come: which page and
 * step it is on, plus a guess at progress within the current step from the
 * time spent in it (so the bar keeps moving during a long step, up to 90% of
 * that step).
 */
class ProgressTracker {
  sheets = 1;
  sheet = 0;
  step: string | null = null;
  /** Units finished before the current step. */
  done = 0;
  private readonly started = Date.now();
  private stepStarted = Date.now();
  private exported = false;
  /** The highest value reported so far: the bar must not go backwards when the page count arrives. */
  private best = 0;

  onLine(line: string) {
    let m = /\b(\d+) sheets? in /.exec(line);
    if (m) this.sheets = Math.max(1, Number(m[1]));
    m = /#(\d+)\]\s+StepMonitoring\s+\d+\s+\|\s+([A-Z_]+)\s*$/.exec(line);
    if (m && m[2] in STEP_WEIGHTS) {
      this.sheet = Number(m[1]);
      this.step = m[2];
      this.stepStarted = Date.now();
      const before = STEPS.slice(0, STEPS.indexOf(this.step));
      this.done =
        STARTUP_WEIGHT +
        (this.sheet - 1) * PAGE_WEIGHT +
        before.reduce((sum, name) => sum + STEP_WEIGHTS[name], 0);
    }
    if (/Sheet#(\d+) disposed/.test(line)) {
      this.step = null;
      this.done = STARTUP_WEIGHT + this.sheet * PAGE_WEIGHT;
    }
    if (/exported to /.test(line)) this.exported = true;
  }

  private total() {
    return STARTUP_WEIGHT + this.sheets * PAGE_WEIGHT + EXPORT_WEIGHT;
  }

  /** 0..1, never decreasing, capped below 1 until the file is ready. */
  value(): number {
    this.best = Math.max(this.best, this.estimate());
    return this.best;
  }

  private estimate(): number {
    if (this.exported) return 0.99;
    let done = this.done;
    const now = Date.now();
    if (this.step) {
      // Seconds per unit so far says how fast this machine is; the first step has no history.
      const perUnit = this.done > STARTUP_WEIGHT ? (now - this.started) / 1000 / this.done : 1;
      const expected = STEP_WEIGHTS[this.step] * Math.min(5, Math.max(0.5, perUnit)) * 1000;
      done += STEP_WEIGHTS[this.step] * Math.min(0.9, (now - this.stepStarted) / expected);
    } else if (this.done === 0) {
      // Still starting up: creep through the startup budget.
      done = STARTUP_WEIGHT * Math.min(0.9, (now - this.started) / 6000);
    }
    return Math.min(0.99, done / this.total());
  }

  message(): Message {
    return {
      type: "progress",
      value: this.value(),
      ...(this.step && { step: this.step, sheet: this.sheet, sheets: this.sheets }),
    };
  }
}

/* ---------- Audiveris ---------- */

interface ScanResult {
  mxl: Buffer;
  /** How many .mxl files Audiveris wrote (one per movement it detected). */
  movements: number;
}

interface RunOptions {
  onProgress?: (message: Message) => void;
  /** Aborting kills Audiveris (the client went away). */
  signal?: AbortSignal;
}

/** Run Audiveris, following its log for progress. Resolves with the exit code and the log's tail. */
function run(
  args: string[],
  { onProgress, signal }: RunOptions,
): Promise<{ log: string; code: number; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(AUDIVERIS, args, { stdio: ["ignore", "pipe", "pipe"] });
    const tracker = new ProgressTracker();
    const tail: string[] = [];
    let timedOut = false;
    const onLine = (line: string) => {
      tail.push(line);
      if (tail.length > 200) tail.shift();
      tracker.onLine(line);
    };
    createInterface({ input: child.stdout }).on("line", onLine);
    createInterface({ input: child.stderr }).on("line", onLine);
    const ticker = setInterval(() => onProgress?.(tracker.message()), 1000);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, TIMEOUT_MS);
    const onAbort = () => child.kill("SIGKILL");
    signal?.addEventListener("abort", onAbort, { once: true });
    child.on("error", (err) => onLine(`[failed to start Audiveris: ${err.message}]`));
    child.on("close", (code) => {
      clearInterval(ticker);
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve({ log: tail.join("\n"), code: code ?? 1, timedOut });
    });
  });
}

async function findFiles(dir: string, ext: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await findFiles(path, ext)));
    else if (entry.name.toLowerCase().endsWith(ext)) out.push(path);
  }
  return out.sort();
}

/** Scan one PDF/image with Audiveris in batch mode and return the exported .mxl. */
async function scan(
  bytes: Buffer,
  ext: string,
  constants: string[],
  options: RunOptions,
): Promise<ScanResult> {
  const work = await mkdtemp(join(tmpdir(), "omr-"));
  try {
    const input = join(work, `score${ext}`);
    const output = join(work, "out");
    await writeFile(input, bytes);
    const started = Date.now();
    const { log, code, timedOut } = await run(
      ["-batch", "-transcribe", "-export", "-output", output, ...constants, "--", input],
      options,
    );
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (options.signal?.aborted) throw new HttpError(499, "Scan cancelled.");
    const files = await findFiles(output, ".mxl").catch(() => [] as string[]);
    console.log(`audiveris exit ${code} in ${seconds}s, ${files.length} .mxl file(s)`);
    if (!files.length) {
      console.log(log.split("\n").slice(-40).join("\n"));
      if (timedOut) throw new HttpError(504, "Scanning took too long. Try fewer pages at a time.");
      throw new HttpError(
        422,
        "No music was recognized. Use a clear scan or photo of printed (not handwritten) sheet music.",
      );
    }
    // Audiveris writes one file per movement it detects; the largest is the main score.
    const sized = await Promise.all(files.map(async (f) => ({ f, data: await readFile(f) })));
    sized.sort((a, b) => b.data.length - a.data.length);
    console.log(`returning ${basename(sized[0].f)} (${sized[0].data.length} bytes)`);
    return { mxl: sized[0].data, movements: files.length };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/* One scan at a time: Audiveris alone can use the whole instance's memory. */
let running: Promise<unknown> = Promise.resolve();
let waiting = 0;

function queued<T>(job: () => Promise<T>): Promise<T> {
  if (waiting >= QUEUE) {
    return Promise.reject(new HttpError(503, "The scanner is busy. Try again in a minute."));
  }
  waiting++;
  const next = running.then(
    () => {
      waiting--;
      return job();
    },
    () => {
      waiting--;
      return job();
    },
  );
  running = next.catch(() => {});
  return next;
}

/* ---------- HTTP ---------- */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Accept, Authorization, Content-Type, X-File-Name",
  "Access-Control-Expose-Headers": "X-Omr-Movements",
  "Access-Control-Max-Age": "86400",
};

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { ...CORS, "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { ...CORS, "Content-Type": "text/plain" });
    return res.end("ok");
  }
  if (req.method !== "POST" || url.pathname !== "/scan") {
    return sendJson(res, 404, { error: "Not found" });
  }
  const email = await authorize(req);
  const ext = inputExtension(req);
  const constants = constantArgs(url.searchParams);
  const bytes = await readBody(req);
  const streaming = (req.headers.accept ?? "").includes(NDJSON_TYPE);
  console.log(
    `scan ${ext} (${bytes.length} bytes) for ${email}${streaming ? ", streaming" : ""}`,
    constants.filter((a) => a !== "-constant"),
  );

  // The client closing the connection cancels the scan.
  const aborter = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) aborter.abort();
  });

  if (!streaming) {
    const { mxl, movements } = await queued(() =>
      scan(bytes, ext, constants, { signal: aborter.signal }),
    );
    res.writeHead(200, {
      ...CORS,
      "Content-Type": MXL_TYPE,
      "Content-Length": String(mxl.length),
      "X-Omr-Movements": String(movements),
    });
    return res.end(mxl);
  }

  // Progress mode: headers go out now, then one JSON line per update; errors
  // from here on are lines too, since the status is already sent.
  res.writeHead(200, {
    ...CORS,
    "Content-Type": NDJSON_TYPE,
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
  });
  const send = (message: Message) => {
    if (!res.writableEnded) res.write(JSON.stringify(message) + "\n");
  };
  send({ type: "progress", value: 0, waiting: true });
  try {
    const { mxl, movements } = await queued(() =>
      scan(bytes, ext, constants, { signal: aborter.signal, onProgress: send }),
    );
    send({ type: "done", movements, mxl: mxl.toString("base64") });
  } catch (err) {
    if (aborter.signal.aborted) {
      console.log("scan cancelled by the client");
    } else if (err instanceof HttpError) {
      send({ type: "error", status: err.status, error: err.message });
    } else {
      console.error(err);
      send({ type: "error", status: 500, error: "Scanning failed. Try again later." });
    }
  }
  res.end();
}

createServer((req, res) => {
  handle(req, res).catch((err: unknown) => {
    if (res.headersSent) return res.end();
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
    console.error(err);
    sendJson(res, 500, { error: "Scanning failed. Try again later." });
  });
}).listen(PORT, () => {
  console.log(`omr listening on :${PORT}, allowed: ${[...ALLOWED_EMAILS].join(", ") || "(nobody)"}`);
});
