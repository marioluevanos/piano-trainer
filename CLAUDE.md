# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A personal flowkey-style piano practice web app (React 19 + Vite + TypeScript). It renders MusicXML with OpenSheetMusicDisplay (OSMD) and listens to a MIDI keyboard via Web MIDI, or to taps on an on-screen SVG keyboard. Features: wait mode, measure loop, left/both/right hand selection, and importing user MusicXML files.

## Commands

```sh
npm run dev       # Vite dev server on :5173, bound to LAN (--host) so a phone can connect
npm run build     # tsc --noEmit type-check, then vite build into dist/
npm test          # node:test runner over src/engine/*.test.ts (no test framework installed)

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
- **Songs.** Bundled songs are `.musicxml` files in `src/songs/` imported with Vite's `?raw` suffix and registered in `BUNDLED_SONGS` in [src/songs/index.ts](src/songs/index.ts). User-imported songs are stored in localStorage under `piano-trainer.songs.v1` by [src/songs/library.ts](src/songs/library.ts). Compressed `.mxl` files are stored as base64 and handed to OSMD as a Blob.
- **MIDI and sound.** `useMidiInput` subscribes to all Web MIDI inputs and re-attaches on device changes. `synth.ts` is a throwaway Web Audio voice used only for on-screen key taps.

## Constraints

- Web MIDI needs a secure context (https or localhost). Chrome, Edge and Opera support it; Safari does not.
- `vite.config.ts` uses `base: "./"` so the same build works in a browser and inside a Capacitor Android WebView. Keep asset paths relative.
- The README describes the planned Capacitor Android route and a fallback native MIDI plugin feeding into `useMidiInput.ts`.
