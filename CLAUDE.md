# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A personal flowkey-style piano practice web app (React 19 + Vite + TypeScript). It renders MusicXML with OpenSheetMusicDisplay (OSMD) and listens to a MIDI keyboard via Web MIDI, or to taps on an on-screen SVG keyboard. Features: wait mode, measure loop, left/both/right hand selection, and importing user MusicXML files.

## Commands

```sh
npm run dev       # Vite dev server on :5173, bound to LAN (--host) so a phone can connect
npm run build     # tsc --noEmit type-check, then vite build into dist/
npm test          # node:test runner over src/engine/*.test.ts (no test framework installed)
npm run import-songs -- <folder> [--dry-run] [--force]   # bring .mxl/.musicxml songs into src/songs/
npm run upload-songs [-- --dry-run] [--prune]            # publish src/songs/ to Firestore

# Run a single test by name
node --test --experimental-strip-types --test-name-pattern="loop wraps" src/engine/*.test.ts
```

There is no linter configured. `tsc` runs in strict mode with `noUnusedLocals`/`noUnusedParameters`, so unused symbols fail the build.

## Architecture

Data flow: MusicXML → OSMD render → `buildSteps` cursor walk → `Step[]` → practice engine ← MIDI note on/off. The engine's `stepIndex` drives both the OSMD visual cursor and the keyboard key states.

- **`Step[]` is the sync model.** [src/score/buildSteps.ts](src/score/buildSteps.ts) walks the OSMD cursor once after render. Each cursor position becomes one `Step` holding every note that starts there. Step indices therefore map 1:1 to `cursor.next()` calls. [src/components/ScoreView.tsx](src/components/ScoreView.tsx) relies on this: it moves the visual cursor by calling `next()` forward from its last position, or `reset()` and replays when going backward.
- **Pitch and hand mapping.** OSMD half-tones are offset by 12 from MIDI (OSMD A4 = 57, MIDI A4 = 69). Hand comes from the staff: the first staff is right hand, any other staff is left hand. Rests, grace notes and tied continuations are excluded from steps.
- **Practice engine is pure.** [src/engine/practiceEngine.ts](src/engine/practiceEngine.ts) is a DOM-free state machine (`noteOn`, `noteOff`, `jumpTo`) over immutable `EngineState`. Wait mode, loop wrap-around and hand filtering all live here. Steps with nothing to play for the selected hand are skipped automatically. Put new practice logic here and test it in `practiceEngine.test.ts`.
- **Engine files run directly under Node.** Tests use `--experimental-strip-types`, not Vite. Runtime imports inside `src/engine/` must include the `.ts` extension (as the test file does), and type-only imports must use `import type` so they are erased. Do not import browser or Vite-only modules into the engine.
- **App wiring.** [src/App.tsx](src/App.tsx) owns all state. MIDI callbacks read steps and options through refs so they never see stale closures. The engine is reset via `jumpTo` whenever steps, hand mode or loop change. Key states (`expected`, `correct`, `wrong`, `pressed`) are derived from engine state in a memo.
- **Songs live in Firestore** (project `mario-luevanos`, shared with a Portfolio app). [src/songs/paths.ts](src/songs/paths.ts) documents the layout: each song is a small `songs/{id}` doc (title, format) plus a `scores/{id}` doc holding the score as bytes (gzip-compressed XML, or the raw `.mxl`), so the list never downloads scores. The shared library is `pianoTrainer/library/...`, published from `src/songs/*.musicxml` by `npm run upload-songs` ([scripts/upload-songs.ts](scripts/upload-songs.ts), Admin SDK, needs `gcloud auth application-default login`). `src/songs/` is no longer bundled into the app. [src/songs/library.ts](src/songs/library.ts) `useSongLibrary` merges the shared list with the user's imported songs in `pianoTrainerUsers/{uid}/...`. Importing requires signing in with Google; the home page ([src/components/HomePage.tsx](src/components/HomePage.tsx)) only offers it then. Each `Song` has a `load()` that fetches its score; App memoizes it by song id. Firestore uses a persistent cache, so opened songs work offline. [firestore.rules](firestore.rules) is the whole project's rule set (Portfolio only uses the Admin SDK, which bypasses rules); deploy it with `npm run deploy:rules`.
- **MIDI and sound.** `useMidiInput` subscribes to all Web MIDI inputs and re-attaches on device changes. `synth.ts` plays the Salamander Grand Piano samples in `public/piano/` (one every three semitones, pitch-shifted), falling back to a triangle tone until they load. It serves on-screen key taps and song playback.
- **Playback.** [src/engine/playback.ts](src/engine/playback.ts) is a pure planner that turns `Step[]` (each step carries `bpm`, each note a `duration` in whole notes) into timed events for the hand mode and loop. `usePlayback` schedules them ahead on the audio clock and moves the engine cursor via `jumpTo`; player input is ignored while it runs.

## Constraints

- Web MIDI needs a secure context (https or localhost). Chrome, Edge and Opera support it; Safari does not.
- `vite.config.ts` uses `base: "./"` so the same build works in a browser and inside a Capacitor Android WebView. Keep asset paths relative.
- The README describes the planned Capacitor Android route and a fallback native MIDI plugin feeding into `useMidiInput.ts`.
