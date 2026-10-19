import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, noteName } from "./components/Keyboard";
import { ScoreView, type ScoreInfo } from "./components/ScoreView";
import {
  expectedMidi,
  expectedNotes,
  initialState,
  jumpTo,
  noteOff as engineNoteOff,
  noteOn as engineNoteOn,
  type EngineState,
} from "./engine/practiceEngine";
import type { Hand, HandMode, KeyState, LoopRange, Step } from "./engine/types";
import { useMidiInput } from "./midi/useMidiInput";
import { synthNoteOff, synthNoteOn } from "./midi/synth";
import { songSource } from "./songs";
import { useSongLibrary } from "./songs/library";

export default function App() {
  const library = useSongLibrary();
  const [songId, setSongId] = useState(library.songs[0].id);
  const song = library.songs.find((s) => s.id === songId) ?? library.songs[0];
  const source = useMemo(() => songSource(song), [song]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const added = await library.addSong(file);
    if (added) setSongId(added.id);
  };

  const [steps, setSteps] = useState<Step[]>([]);
  const [measureCount, setMeasureCount] = useState(0);
  const [scoreError, setScoreError] = useState<string | null>(null);

  const [handMode, setHandMode] = useState<HandMode>("both");
  const [loop, setLoop] = useState<LoopRange | null>(null);
  const [fullKeyboard, setFullKeyboard] = useState(false);
  const [onScreenSound, setOnScreenSound] = useState(true);

  const [engine, setEngine] = useState<EngineState>(() => initialState());

  // Engine inputs are read through refs so MIDI callbacks always see fresh values.
  const optsRef = useRef({ handMode, loop });
  optsRef.current = { handMode, loop };
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  const handleNoteOn = useCallback((midi: number) => {
    setEngine((s) => engineNoteOn(s, stepsRef.current, midi, optsRef.current));
  }, []);
  const handleNoteOff = useCallback((midi: number) => {
    setEngine((s) => engineNoteOff(s, midi));
  }, []);

  const midi = useMidiInput({ onNoteOn: handleNoteOn, onNoteOff: handleNoteOff });

  // Reset the engine whenever the song, hand mode or loop changes.
  useEffect(() => {
    setEngine(jumpTo(steps, loop ? loopStart(steps, loop) : 0, { handMode, loop }));
  }, [handMode, loop, steps]);

  const handleReady = useCallback((info: ScoreInfo) => {
    setScoreError(null);
    setSteps(info.steps);
    setMeasureCount(info.measureCount);
    setLoop(null);
  }, []);

  const currentStep = steps[engine.stepIndex];
  const expected = useMemo(() => expectedMidi(currentStep, handMode), [currentStep, handMode]);

  const keyStates = useMemo(() => {
    const m = new Map<number, KeyState>();
    for (const n of expected) m.set(n, "expected");
    for (const n of engine.held) m.set(n, expected.has(n) ? "correct" : "pressed");
    for (const n of engine.misses) m.set(n, "wrong");
    for (const n of engine.hits) if (!engine.held.has(n)) m.set(n, "correct");
    return m;
  }, [expected, engine.held, engine.misses, engine.hits]);

  const hands = useMemo(() => {
    const m = new Map<number, Hand>();
    for (const n of expectedNotes(currentStep, handMode)) m.set(n.midi, n.hand);
    return m;
  }, [currentStep, handMode]);

  const labels = useMemo(() => {
    const m = new Map<number, string>();
    for (const n of expected) m.set(n, noteName(n));
    return m;
  }, [expected]);

  // Keyboard range: the song's notes plus a little margin, unless the full 88 keys are requested.
  const range = useMemo<[number, number]>(() => {
    if (fullKeyboard || steps.length === 0) return [21, 108];
    const all = steps.flatMap((s) => s.notes.map((n) => n.midi));
    let lo = Math.min(...all) - 5;
    let hi = Math.max(...all) + 5;
    while (hi - lo < 36) {
      lo--;
      hi++;
    }
    return [Math.max(21, lo), Math.min(108, hi)];
  }, [steps, fullKeyboard]);

  const onScreenNoteOn = (m: number) => {
    if (onScreenSound) synthNoteOn(m);
    handleNoteOn(m);
  };
  const onScreenNoteOff = (m: number) => {
    synthNoteOff(m);
    handleNoteOff(m);
  };

  const currentMeasure = currentStep ? currentStep.measure : 0;
  const measureOptions = Array.from({ length: measureCount }, (_, i) => i);

  const setLoopFromHere = (which: "start" | "end") => {
    setLoop((l) => {
      const start = which === "start" ? currentMeasure : (l?.startMeasure ?? 0);
      const end = which === "end" ? currentMeasure : (l?.endMeasure ?? measureCount - 1);
      return { startMeasure: Math.min(start, end), endMeasure: Math.max(start, end) };
    });
  };

  const restart = () => setEngine(jumpTo(steps, loop ? loopStart(steps, loop) : 0, { handMode, loop }));

  return (
    <div className="app">
      <header className="toolbar">
        <div className="group" role="group" aria-label="Song">
          <select value={songId} onChange={(e) => setSongId(e.target.value)} aria-label="Song">
            {library.songs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <button onClick={() => fileInputRef.current?.click()} title="Load a .musicxml, .xml or .mxl file">
            Load song…
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".musicxml,.xml,.mxl,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml"
            hidden
            onChange={onPickFile}
          />
          {song.user && (
            <button
              onClick={() => {
                library.removeSong(song.id);
                setSongId(library.songs[0].id);
              }}
              title="Remove this song from the library"
            >
              Remove
            </button>
          )}
        </div>

        <div className="group" role="group" aria-label="Hand">
          {(["left", "both", "right"] as HandMode[]).map((h) => (
            <button key={h} className={handMode === h ? "active" : ""} onClick={() => setHandMode(h)}>
              {h === "left" ? "Left hand" : h === "right" ? "Right hand" : "Both hands"}
            </button>
          ))}
        </div>

        <div className="group" role="group" aria-label="Loop">
          <label>
            Loop
            <select
              value={loop ? loop.startMeasure : ""}
              onChange={(e) =>
                setLoop({
                  startMeasure: Number(e.target.value),
                  endMeasure: Math.max(Number(e.target.value), loop?.endMeasure ?? Number(e.target.value)),
                })
              }
            >
              <option value="">off</option>
              {measureOptions.map((i) => (
                <option key={i} value={i}>
                  m. {i + 1}
                </option>
              ))}
            </select>
            →
            <select
              value={loop ? loop.endMeasure : ""}
              disabled={!loop}
              onChange={(e) =>
                setLoop((l) => (l ? { ...l, endMeasure: Math.max(l.startMeasure, Number(e.target.value)) } : l))
              }
            >
              <option value="">—</option>
              {measureOptions.map((i) => (
                <option key={i} value={i}>
                  m. {i + 1}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => setLoopFromHere("start")} title="Set loop start to the current measure">
            Start here
          </button>
          <button onClick={() => setLoopFromHere("end")} title="Set loop end to the current measure">
            End here
          </button>
          {loop && <button onClick={() => setLoop(null)}>Clear</button>}
        </div>

        <button onClick={restart}>Restart</button>

        <label className="toggle">
          <input type="checkbox" checked={fullKeyboard} onChange={(e) => setFullKeyboard(e.target.checked)} />
          88 keys
        </label>
        <label className="toggle">
          <input type="checkbox" checked={onScreenSound} onChange={(e) => setOnScreenSound(e.target.checked)} />
          Sound
        </label>
      </header>

      <section className="keyboard-area">
        <Keyboard
          keyStates={keyStates}
          hands={hands}
          labels={labels}
          range={range}
          onNoteOn={onScreenNoteOn}
          onNoteOff={onScreenNoteOff}
        />
        <div className="status">
          <span>
            {midi.status === "ready"
              ? midi.inputs.length
                ? `MIDI: ${midi.inputs.map((i) => i.name).join(", ")}`
                : "MIDI ready — no keyboard connected (tap the keys above to test)"
              : midi.status === "unsupported"
                ? "Web MIDI not supported in this browser — tap the keys above"
                : midi.status === "denied"
                  ? "MIDI access denied"
                  : midi.status === "requesting"
                    ? "Requesting MIDI access…"
                    : "MIDI error"}
          </span>
          <span>
            {engine.finished
              ? "Finished! 🎉"
              : steps.length
                ? `Measure ${currentMeasure + 1} / ${measureCount}${loop ? ` · loop ${loop.startMeasure + 1}–${loop.endMeasure + 1}` : ""}`
                : "Loading score…"}
            {" · "}
            {engine.completedSteps} played, {engine.wrongNotes} wrong
          </span>
        </div>
      </section>

      <section className="score-area">
        {library.error && <p className="error">{library.error}</p>}
        {scoreError && <p className="error">Could not load score: {scoreError}</p>}
        <ScoreView
          source={source}
          cursorStep={engine.stepIndex}
          onReady={handleReady}
          onError={setScoreError}
        />
      </section>
    </div>
  );
}

function loopStart(steps: Step[], loop: LoopRange): number {
  const i = steps.findIndex((s) => s.measure >= loop.startMeasure);
  return i < 0 ? 0 : i;
}
