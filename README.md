# Piano Trainer

A personal flowkey-style practice app: sheet music on the bottom, a keyboard on top, driven by a MIDI piano (or by tapping the on-screen keys).

## Features

- **Wait mode** — the cursor only advances once every note in the current slice has been struck. Wrong notes flash red and don't advance.
- **Loop** — pick a start and end measure (or "Start here" / "End here" at the current cursor position); the cursor wraps back automatically.
- **Hand select** — Left / Both / Right. The other hand's notes are skipped so you're never stuck waiting on a note you're not practicing.
- Web MIDI input from any connected keyboard; tap-to-play fallback with a small synth for testing without a piano.

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
- `src/midi/useMidiInput.ts` subscribes to all Web MIDI inputs; `synth.ts` is a throwaway Web Audio voice for the on-screen keys.

## Adding songs

Drop a `.musicxml` (or uncompressed `.xml`) file into `src/songs/` and register it in `src/songs/index.ts`. Piano scores with two staves work out of the box. Good free sources: MuseScore (export as MusicXML), mutopiaproject.org, musescore's public-domain collections. Compressed `.mxl` files need to be unzipped first (OSMD can also load them directly if you read the file as a Blob).

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

- Playback of the non-selected hand (and a metronome) using Web Audio with a sampled piano.
- Dim or hide the non-selected staff in the score when practicing one hand.
- Highlight the loop range in the score.
- A song library view with per-song progress, stored in localStorage or a small backend.
- Replace the triangle synth with a sampled piano (e.g. Salamander samples) for nicer feedback.
