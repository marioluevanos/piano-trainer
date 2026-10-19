# Piano Trainer

A personal flowkey-style practice app: sheet music on the bottom, a keyboard on top, driven by a MIDI piano (or by tapping the on-screen keys).

## Features

- **Wait mode** — the cursor only advances once every note in the current slice has been struck. Wrong notes flash red and don't advance.
- **Loop** — pick a start and end measure (or "Start here" / "End here" at the current cursor position); the cursor wraps back automatically.
- **Hand select** — Left / Both / Right. The other hand's notes are skipped so you're never stuck waiting on a note you're not practicing.
- **Playback** — ▶ Play the selected hands from the cursor at 50–125% speed, with the cursor and keys following along. Loops repeat until stopped.
- Web MIDI input from any connected keyboard; tap-to-play fallback with a sampled grand piano for testing without a piano.

## Running it

```sh
npm install
npm run dev        # http://localhost:5173, also reachable on your LAN for a phone
npm test           # practice-engine unit tests
npm run build      # type-check + production build into dist/
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
- `src/components/ScoreView.tsx` owns the OSMD instance and moves the visual cursor to whatever step index the engine is on.
- `src/components/Keyboard.tsx` is an 88-key SVG; key states are `expected`, `correct`, `wrong`, `pressed`.
- `src/midi/useMidiInput.ts` subscribes to all Web MIDI inputs; `synth.ts` plays the Salamander Grand Piano samples in `public/piano/` for on-screen keys and playback.
- `src/engine/playback.ts` turns the steps into timed notes for the current hand mode, loop and speed; `src/midi/usePlayback.ts` schedules them on the audio clock.

## Adding songs

The app reads **MusicXML**, the standard exchange format for sheet music. Two ways to add a song:

| | Load in the app | Bundle with the app |
|---|---|---|
| How | **Load song…** button | Add a file to `src/songs/` and register it |
| Formats | `.musicxml`, `.xml`, `.mxl` | `.musicxml` or `.xml` only (uncompressed) |
| Where it lives | This browser's localStorage only | Every build, every device |

### Load in the app

Click **Load song…** and pick the file. Compressed `.mxl` works as is. The song stays in that browser until you click **Remove**; very large scores can fill the browser's storage.

### Bundle with the app

1. **Get an uncompressed MusicXML file.** If you have a `.mxl`, it is a zip archive holding the score plus a `META-INF/container.xml` manifest. Extract the score:

   ```sh
   unzip -l my-song.mxl     # list the contents; the score is the .xml that is not in META-INF/
   unzip -p my-song.mxl score.xml > src/songs/my-song.musicxml
   ```

   `META-INF/container.xml` names the score file (`<rootfile full-path="...">`) if the archive holds more than one. Alternatively, in MuseScore use File → Export → MusicXML and choose the uncompressed `.musicxml` option.

2. **Register it** in `src/songs/index.ts`:

   ```ts
   import mySong from "./my-song.musicxml?raw";

   export const BUNDLED_SONGS: Song[] = [
     // ...existing songs
     { id: "my-song", title: "My Song — Composer", format: "xml", data: mySong },
   ];
   ```

   The `?raw` suffix makes Vite import the file as text, which is why bundled songs must be uncompressed. `id` must be unique.

3. **Check it:** `npm run dev`, pick the song, try each hand and press ▶ Play. `npm run build` catches a mistyped import.

### What makes a score work well

- **One piano part with two staves.** The top staff is the right hand; any other staff is the left hand. A score with a separate part per hand, or with everything on one staff, will assign hands wrongly.
- **A tempo marking.** Playback uses the score's tempo (and any tempo changes); without one it plays at 100 bpm.
- **What the app skips:** rests, grace notes and the held part of tied notes are never waited on or played.

### Other formats

- **MIDI (`.mid`):** open it in [MuseScore Studio](https://musescore.org) (free). In the MIDI import panel, make sure a piano track is split across treble and bass staves. MIDI records when keys were pressed, not how the music is written, so fix odd rhythms (try a different quantization), notes on the wrong staff (Ctrl/Cmd+Shift+↑/↓) and the key signature, then export MusicXML. A messy import makes wait mode feel wrong, so the cleanup is worth it.
- **Finale (`.mus`, `.musx`):** only Finale can open these; export MusicXML from Finale. Finale was discontinued in 2024.
- **PDF or scans:** optical music recognition such as [Audiveris](https://audiveris.github.io) can produce MusicXML, but expect to correct mistakes in MuseScore.

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
