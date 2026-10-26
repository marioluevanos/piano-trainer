# Sheet music scanner

The service behind the home page's **Scan sheet music** button. It turns a PDF or an image of printed sheet music into a compressed MusicXML (`.mxl`) file, which the app then saves like any uploaded song. It is free, open-source software all the way down: [Audiveris](https://github.com/Audiveris/audiveris) (AGPL) does the optical music recognition, Tesseract reads the text, and [server.ts](server.ts) wraps them in one HTTP endpoint.

```
POST /scan?<options>   body: the PDF or image bytes
                Authorization: Bearer <Firebase ID token>
                Content-Type: application/pdf | image/png | image/jpeg | image/tiff | image/bmp | image/gif
                X-File-Name: <original file name>     (optional; picks the input type)
                → 200 with the .mxl bytes, header X-Omr-Movements: <n>
                → 4xx/5xx with JSON { "error": "<message for the user>" }
                Accept: application/x-ndjson   → 200 streaming progress (below) instead
GET  /health    → 200 ok
```

### Progress stream

With `Accept: application/x-ndjson` the response starts at once and carries one JSON object per line while Audiveris works, so the app can draw a real progress bar. Closing the connection (the app's **Cancel**) kills the Audiveris process.

```
{"type":"progress","value":0,"waiting":true}                       queued behind another scan
{"type":"progress","value":0.03}                                    starting up
{"type":"progress","value":0.41,"step":"HEADS","sheet":1,"sheets":2}  about once a second
{"type":"done","movements":1,"mxl":"<base64 of the .mxl>"}
{"type":"error","status":422,"error":"<message for the user>"}     instead of done
```

`value` is 0–1. It comes from Audiveris' log: it announces the page count and each of its 20 processing steps per page (`StepMonitoring | HEADS` and so on), and `ProgressTracker` in `server.ts` weights the steps by measured duration (beams and note heads take most of the time) and creeps through the current step by elapsed time, so the bar keeps moving during a long step. Without the Accept header the response is the plain `.mxl`, as `curl` gets it.

### Scan options

The query string tunes the Audiveris engine for one scan; the app's scan dialog sets these. Each becomes a `-constant` on the Audiveris command line; anything not in this table is ignored.

| Option                                                                                 | Values                                              | Audiveris constant                                               |
| -------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| `quality`                                                                              | `standard` (default), `poor`, `synthetic`           | `org.audiveris.omr.sheet.Profiles.defaultQuality`                |
| `font`                                                                                 | `Bravura` (default), `Leland`, `Primus`, `FinaleJazz`, `JazzPerc` | `org.audiveris.omr.ui.symbol.MusicFont.defaultMusicFamily` |
| `lyrics`, `chordNames`, `fingerings`, `articulations`, `dynamics`, `smallHeads`, `implicitTuplets` | `0` or `1`                              | `org.audiveris.omr.sheet.ProcessingSwitches.<switch>` (`dynamics` sets both the above- and below-staff switches) |

Audiveris' defaults are: lyrics, articulations and dynamics on; chord names, fingerings, small heads and implicit tuplets off. Other switches exist (tablatures, percussion, tremolos, pluckings…); add them to `BOOLEAN_OPTIONS` in `server.ts` if a score needs one.

## Who can scan

Only the Google accounts in `OMR_ALLOWED_EMAILS` (default `marioluevanos@gmail.com`). The server verifies the Firebase ID token with Firebase Auth and requires the token's verified email to be on that list; everyone else gets 403. The app hides the button for other accounts (`SCAN_USERS` in [src/songs/omr.ts](../src/songs/omr.ts)), but the server is what enforces it. Keep the two lists the same.

## Run it locally

Audiveris only ships for x86_64 Linux, so the image is built for `linux/amd64`. On an Apple Silicon Mac, Docker runs it under emulation: it works, just slower (a page takes a few minutes instead of about one).

```sh
npm run omr:build    # docker build --platform linux/amd64 -t piano-omr omr
npm run omr:dev      # serve on :8080 with OMR_DEV_NO_AUTH=1 (no sign-in check; local testing only)
```

Then point the app at it with `VITE_OMR_URL=http://localhost:8080` in `.env.local` and run `npm run dev`. Or scan from the shell:

```sh
curl -sS -X POST --data-binary @score.pdf -H 'Content-Type: application/pdf' \
  -H 'X-File-Name: score.pdf' 'http://localhost:8080/scan?quality=poor&lyrics=0' -o score.mxl
```

To run Audiveris by hand (its log is useful when a scan finds nothing):

```sh
docker run --rm --platform linux/amd64 -v "$PWD:/work" piano-omr \
  /opt/audiveris/bin/Audiveris -batch -transcribe -export -output /work/out -- /work/score.pdf
```

## Deploy

The service runs on Cloud Run in the `mario-luevanos` project, scaling to zero between scans, so it costs nothing while idle and a personal amount of use stays within the free tier. Cloud Build builds the Dockerfile on x86 hardware, so the Mac's architecture does not matter.

```sh
gcloud auth login
npm run deploy:omr
```

That runs `gcloud run deploy piano-omr --source omr` with 4 GiB of memory, 2 CPUs, one request per instance and a 15-minute request timeout (Audiveris is memory-hungry and a page takes about a minute). The first deploy asks to enable the Cloud Run, Cloud Build and Artifact Registry APIs. When it finishes it prints the service URL: put it in `.env` as `VITE_OMR_URL` and redeploy the app (`npm run build && npm run deploy`).

The service accepts unauthenticated HTTP (`--allow-unauthenticated`) because the browser calls it directly; the Firebase ID token check in `server.ts` is the access control. To allow another account, change `OMR_ALLOWED_EMAILS` in the `deploy:omr` script and `SCAN_USERS` in the app.

## Environment

| Variable               | Default                        | Meaning                                                     |
| ---------------------- | ------------------------------ | ----------------------------------------------------------- |
| `PORT`                 | `8080`                         | Listening port (Cloud Run sets it)                          |
| `OMR_ALLOWED_EMAILS`   | `marioluevanos@gmail.com`      | Comma-separated Google emails allowed to scan               |
| `OMR_MAX_BYTES`        | 25 MB                          | Largest accepted upload                                     |
| `OMR_TIMEOUT_MS`       | 15 min                         | Longest Audiveris run before the scan fails with 504        |
| `OMR_QUEUE`            | `3`                            | Scans allowed to wait behind the running one (then 503)     |
| `AUDIVERIS`            | `/opt/audiveris/bin/Audiveris` | The Audiveris launcher                                      |
| `GOOGLE_CLOUD_PROJECT` | `mario-luevanos`               | The Firebase project the ID tokens come from                |
| `TESSDATA_PREFIX`      | `/opt/tessdata`                | Tesseract language files (English, from tessdata 4.1.0)     |
| `JAVA_TOOL_OPTIONS`    | headless, 75% of RAM           | JVM flags for Audiveris                                     |
| `OMR_DEV_NO_AUTH`      | unset                          | `1` skips the sign-in check. Local testing only             |

## What to expect from a scan

Recognition is never perfect. Clean, printed piano music scans well; photos need to be sharp, straight and evenly lit. Handwritten music does not work. Expect to lose some dynamics and articulations, and occasionally a triplet or a grace note. The result is a normal `.mxl`, so when something is wrong, open it in MuseScore, fix it, export MusicXML and upload that instead.

Audiveris writes one file per movement it detects on the pages; the server returns the largest and reports the count in `X-Omr-Movements`. Scans run one at a time per instance.
