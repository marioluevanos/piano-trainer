# Piano Trainer

A personal flowkey-style practice app: sheet music on the bottom, a keyboard on top, driven by a MIDI piano (or by tapping the on-screen keys).

## Features

- **Wait mode** — the cursor only advances once every note in the current slice has been struck. Wrong notes flash red and don't advance.
- **Loop** — switch it on in the settings drawer and drag the handles on the score (or step the From/To measures); the cursor wraps back automatically.
- **Hand select** — Left / Both / Right. The other hand's notes are skipped so you're never stuck waiting on a note you're not practicing.
- **Playback** — ▶ Play the selected hands from the cursor at 50–125% speed, with the cursor and keys following along. Loops repeat until stopped.
- Web MIDI input from any connected keyboard; tap-to-play fallback with a sampled grand piano for testing without a piano.

## Running it

```sh
npm install
npm run dev        # http://localhost:5173, also reachable on your LAN for a phone
npm test           # practice-engine unit tests
npm run build      # type-check + production build into dist/
npm run import-songs -- <folder>   # add MusicXML / .mxl songs to library/ (see below)
npm run upload-songs               # publish library/ to the shared library in Firestore
npm run deploy                     # deploy dist/ to Firebase Hosting
npm run deploy:rules               # deploy firestore.rules (the whole mario-luevanos project's rules)
npm run omr:build                  # build the sheet music scanner's Docker image (omr/)
npm run omr:dev                    # run the scanner on :8080 for local testing
npm run deploy:omr                 # deploy the scanner to Cloud Run
```

Web MIDI needs a secure context (https or localhost). Chrome, Edge and Opera support it on desktop and Android; Firefox needs the site-permission add-on; Safari does not support it.

## How it works

```
MusicXML ──► OpenSheetMusicDisplay ──► cursor walk ──► Step[]
                      │                                  │
                      ▼                                  ▼
               rendered score  ◄── cursor index ◄── practice engine ◄── MIDI note on/off
                                                         │
                                                         ▼
                                                   keyboard key states
```

- `src/score/buildSteps.ts` walks OSMD's cursor once after rendering and records, for each vertical position, every note that starts there with its MIDI number and hand (staff 1 = right, staff 2 = left). That array of `Step`s is the sync model between the score and the keyboard.
- `src/engine/practiceEngine.ts` is a pure state machine (no DOM) implementing wait mode, loop wrap-around and hand filtering. It's covered by `practiceEngine.test.ts`.
- `src/components/ScoreView/ScoreView.tsx` owns the OSMD instance and moves the visual cursor to whatever step index the engine is on.
- `src/components/Keyboard/Keyboard.tsx` is an 88-key SVG; key states are `expected`, `correct`, `wrong`, `pressed`.
- `src/midi/useMidiInput.ts` subscribes to all Web MIDI inputs; `synth.ts` plays the Salamander Grand Piano samples in `public/piano/` for on-screen keys and playback.
- `src/engine/playback.ts` turns the steps into timed notes for the current hand mode, loop and speed; `src/midi/usePlayback.ts` schedules them on the audio clock.

## Adding songs

The app reads **MusicXML**, the standard exchange format for sheet music. Two ways to add a song:

|                  | Load in the app                                   | Scan sheet music                         | Shared library                                      |
| ---------------- | ------------------------------------------------- | ---------------------------------------- | --------------------------------------------------- |
| How              | **Upload song** button                            | **Scan sheet music** button              | `npm run import-songs`, then `npm run upload-songs` |
| Formats          | `.musicxml`, `.xml`, `.mxl`                       | `.pdf`, `.png`, `.jpg`, `.tif`, `.bmp`, `.gif` | `.musicxml`, `.xml`, `.mxl`                   |
| Who sees it      | You: this browser, or every device when signed in | You, on every device                     | Everyone, on every device                           |
| Needs a redeploy | No                                                | No                                       | No                                                  |

### Load in the app

Click **Upload song** and pick the file. Compressed `.mxl` works as is. Signed out, the song stays in that browser until you click **Remove**. Signed in (**Sign in to sync songs** in the settings menu), it is saved to your Google account in Firestore and shows up on every device; songs loaded while signed out move into the account at the next sign-in.

### Scan sheet music

Signed in with the allowed account, **Scan sheet music** takes a PDF or an image of printed music and turns it into a song with [Audiveris](https://github.com/Audiveris/audiveris), free open-source optical music recognition running in this project's own [omr/](omr/README.md) service. Picking a file opens the scan options: the image quality (choose **Poor** for photos and rough scans), the edition's music font, and which kinds of items to look for (turn off lyrics, chord names or fingerings the piece does not have, so stray marks are not forced into them). A page then takes about a minute, and the song opens in the usual **Add song** dialog. The scan is kept until you add or discard it, even across a reload.

Recognition is good on clean printed music and poor on photos that are blurry or skewed; handwriting does not work. When the result has mistakes, **Download** it (from the scan notice, or later from the song's ✎ row or ⋯ menu) and fix it by hand: in [Audiveris](https://github.com/Audiveris/audiveris/releases) itself (free, macOS build available), which shows what it recognized over the page and lets you correct it before exporting MusicXML, or in MuseScore for musical fixes. Then **Upload song** the corrected file. Only the account listed in `omr/server.ts` (`OMR_ALLOWED_EMAILS`) may scan; the button is hidden for everyone else and when `VITE_OMR_URL` is unset.

### Add to the shared library

This is two steps: `import-songs` checks the scores and copies them into `library/`, and `upload-songs` publishes that folder to Firestore, where the app reads its song list.

**1. Import.** Put the files in a folder (or use one you already have, like Downloads) and run:

```sh
npm run import-songs -- ~/Downloads/new-songs           # a folder: every .mxl, .musicxml and .xml in it
npm run import-songs -- song.mxl other.musicxml         # or individual files
npm run import-songs -- ~/Downloads/new-songs --dry-run # report what would happen, write nothing
```

For each file the script:

- unpacks a compressed `.mxl` (the score named in its `META-INF/container.xml`),
- writes the uncompressed score to `library/<title>.musicxml`, named from the score's title,
- skips files already imported (same content), files that are not MusicXML, and formats that need converting first (`.mid`, `.mscz`, `.mus`, `.pdf`, with a hint on how),
- warns about scores that will play badly: more than one part, a single staff, or no tempo marking.

It never overwrites a different song with the same name unless you pass `--force`.

**2. Upload.** The app does not bundle `library/`; publish it with:

```sh
npm run upload-songs                    # upload new and changed songs (compared by hash)
npm run upload-songs -- --prune         # also delete library songs whose file is gone
npm run upload-songs -- --dry-run       # report only
```

Open the app and the new songs appear without a redeploy. Try each hand and ▶ Play. To remove a song, delete its file and run with `--prune`. Commit `library/` too: it is the source the library is uploaded from.

**First time on a new computer**, give the upload script your Google credentials:

```sh
gcloud auth application-default login
```

On the consent page, tick every checkbox (or **Select all**). Leaving "See, edit, configure, and delete your Google Cloud data" unticked fails with `cloud-platform scope is required but not consented`. If the upload then complains about a quota project, run `gcloud auth application-default set-quota-project mario-luevanos`.

<details>
<summary>Doing it by hand</summary>

An `.mxl` is a zip archive: the score plus a `META-INF/container.xml` manifest naming it. Extract the score into the songs folder:

```sh
unzip -l my-song.mxl     # the score is the .xml that is not in META-INF/
unzip -p my-song.mxl score.xml > library/my-song.musicxml
```

Or in MuseScore use File → Export → MusicXML and choose the uncompressed `.musicxml` option. Either way, `npm run upload-songs` publishes any `.musicxml` file in `library/`.

</details>

### What makes a score work well

- **One piano part with two staves.** The top staff is the right hand; any other staff is the left hand. A score with a separate part per hand, or with everything on one staff, will assign hands wrongly.
- **A tempo marking.** Playback uses the score's tempo (and any tempo changes); without one it plays at 100 bpm.
- **What the app skips:** rests, grace notes and the held part of tied notes are never waited on or played.

### Other formats

- **MIDI (`.mid`):** open it in [MuseScore Studio](https://musescore.org) (free). In the MIDI import panel, make sure a piano track is split across treble and bass staves. MIDI records when keys were pressed, not how the music is written, so fix odd rhythms (try a different quantization), notes on the wrong staff (Ctrl/Cmd+Shift+↑/↓) and the key signature, then export MusicXML. A messy import makes wait mode feel wrong, so the cleanup is worth it.
- **Finale (`.mus`, `.musx`):** only Finale can open these; export MusicXML from Finale. Finale was discontinued in 2024.
- **PDF or scans:** use **Scan sheet music** (above), or run [Audiveris](https://audiveris.github.io) yourself; either way expect to correct mistakes in MuseScore.

### Where to find scores

MuseScore.com (download as MusicXML, or download the MuseScore file and export it), [Mutopia Project](https://www.mutopiaproject.org) (public domain) and MuseScore's public-domain collections. Many arrangements on MuseScore.com are copyrighted; they are fine for personal practice but should not be redistributed in a public build.

## Android

The app is plain web, so the Capacitor route is:

```sh
npm i @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Piano Trainer" com.yourname.pianotrainer --web-dir dist
npm run build && npx cap add android && npx cap sync && npx cap open android
```

Then build the APK from Android Studio. Two things to verify on your device before going further:

1. Whether the Android System WebView exposes `navigator.requestMIDIAccess` for your keyboard over USB-OTG / Bluetooth MIDI. Chrome for Android does; WebView usually does on recent versions, but it's device-dependent.
2. If it doesn't, write a small Capacitor plugin over `android.media.midi.MidiManager` that forwards note on/off to the web layer and plug it into `useMidiInput.ts` as a second source.

## Next steps worth doing

- Accompaniment: play the other hand while you practice one, plus a metronome.
- Dim or hide the non-selected staff in the score when practicing one hand.
- Highlight the loop range in the score.
- A song library view with per-song progress, stored in localStorage or a small backend.
