import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, noteName } from "./components/Keyboard";
import { ScoreView, type ScoreInfo } from "./components/ScoreView";
import { SettingsMenu } from "./components/SettingsMenu";
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
import { usePlayback } from "./midi/usePlayback";
import { loadPiano, synthNoteOff, synthNoteOn } from "./midi/synth";
import { songSource } from "./songs";
import {
  loadSelectedSongId,
  saveSelectedSongId,
  useSongLibrary,
} from "./songs/library";

export default function App() {
  const library = useSongLibrary();
  const [songId, setSongId] = useState(
    () => loadSelectedSongId() ?? library.songs[0].id,
  );
  // Falls back to the first song if the remembered one was removed.
  const song = library.songs.find((s) => s.id === songId) ?? library.songs[0];
  useEffect(() => saveSelectedSongId(song.id), [song.id]);
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
  const [fullKeyboard, setFullKeyboard] = useState(true);
  const [onScreenSound, setOnScreenSound] = useState(true);
  const [speed, setSpeed] = useState(1);

  // Fetch the piano samples up front so the first note does not fall back to the plain tone.
  useEffect(() => {
    void loadPiano();
  }, []);

  const [engine, setEngine] = useState<EngineState>(() => initialState());

  // Engine inputs are read through refs so MIDI callbacks always see fresh values.
  const optsRef = useRef({ handMode, loop });
  optsRef.current = { handMode, loop };
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  // While the song plays, the cursor follows playback and the player's input is not scored.
  const playback = usePlayback({
    onStep: (i) => setEngine(jumpTo(stepsRef.current, i, optsRef.current)),
    onEnd: () => {
      const { loop } = optsRef.current;
      const steps = stepsRef.current;
      setEngine(
        jumpTo(steps, loop ? loopStart(steps, loop) : 0, optsRef.current),
      );
    },
  });
  const playingRef = useRef(playback.playing);
  playingRef.current = playback.playing;

  const handleNoteOn = useCallback((midi: number) => {
    if (playingRef.current) return;
    const time = performance.now();
    setEngine((s) =>
      engineNoteOn(s, stepsRef.current, midi, optsRef.current, time),
    );
  }, []);
  const handleNoteOff = useCallback((midi: number) => {
    setEngine((s) => engineNoteOff(s, midi));
  }, []);

  const midi = useMidiInput({
    onNoteOn: handleNoteOn,
    onNoteOff: handleNoteOff,
  });

  // Reset the engine (and stop playback) whenever the song, hand mode or loop changes.
  const stopPlayback = playback.stop;
  useEffect(() => {
    stopPlayback();
    setEngine(
      jumpTo(steps, loop ? loopStart(steps, loop) : 0, { handMode, loop }),
    );
  }, [handMode, loop, steps, stopPlayback]);

  const handleReady = useCallback((info: ScoreInfo) => {
    setScoreError(null);
    setSteps(info.steps);
    setMeasureCount(info.measureCount);
    setLoop(null);
  }, []);

  const currentStep = steps[engine.stepIndex];
  const expected = useMemo(
    () => expectedMidi(currentStep, handMode),
    [currentStep, handMode],
  );

  const keyStates = useMemo(() => {
    const m = new Map<number, KeyState>();
    for (const n of expected) m.set(n, "expected");
    // A held note that fell out of the chord window stays "expected" until it is struck again.
    for (const n of engine.held)
      m.set(
        n,
        engine.hits.has(n) ? "correct" : expected.has(n) ? "expected" : "pressed",
      );
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
      const end =
        which === "end" ? currentMeasure : (l?.endMeasure ?? measureCount - 1);
      return {
        startMeasure: Math.min(start, end),
        endMeasure: Math.max(start, end),
      };
    });
  };

  const restart = () => {
    playback.stop();
    setEngine(
      jumpTo(steps, loop ? loopStart(steps, loop) : 0, { handMode, loop }),
    );
  };

  const startPlayback = (playSpeed: number) => {
    const from = engine.finished
      ? loop
        ? loopStart(steps, loop)
        : 0
      : engine.stepIndex;
    playback.play(steps, from, { handMode, loop, speed: playSpeed });
  };

  const togglePlayback = () =>
    playback.playing ? playback.stop() : startPlayback(speed);

  const changeSpeed = (value: number) => {
    setSpeed(value);
    // Pick up the new speed from the current step.
    if (playback.playing) startPlayback(value);
  };

  // Left and right are independent toggles; at least one hand always stays selected.
  const leftOn = handMode !== "right";
  const rightOn = handMode !== "left";
  const toggleHand = (hand: "left" | "right") => {
    const left = hand === "left" ? !leftOn : leftOn;
    const right = hand === "right" ? !rightOn : rightOn;
    if (left && right) setHandMode("both");
    else if (left) setHandMode("left");
    else if (right) setHandMode("right");
  };

  return (
    <div className="app">
      <header className="toolbar">
        <select
          className="song-select"
          value={songId}
          onChange={(e) => setSongId(e.target.value)}
          aria-label="Song"
        >
          {library.songs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <input
          ref={fileInputRef}
          type="file"
          accept=".musicxml,.xml,.mxl,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml"
          hidden
          onChange={onPickFile}
        />

        <div className="toolbar-actions">
          <button
            className={`icon-button${playback.playing ? " active" : ""}`}
            onClick={togglePlayback}
            disabled={steps.length === 0}
            aria-label={playback.playing ? "Stop" : "Play"}
            title="Play the song from the cursor (the selected hands only)"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                fill="currentColor"
                d={playback.playing ? "M6 6h12v12H6z" : "M8 5v14l11-7z"}
              />
            </svg>
          </button>
          <button
            className={`hand-button hand-L${leftOn ? " active" : ""}`}
            onClick={() => toggleHand("left")}
            aria-pressed={leftOn}
            aria-label="Left hand"
            title="Left hand"
          >
            L
          </button>
          <button
            className={`hand-button hand-R${rightOn ? " active" : ""}`}
            onClick={() => toggleHand("right")}
            aria-pressed={rightOn}
            aria-label="Right hand"
            title="Right hand"
          >
            R
          </button>

          <SettingsMenu>
            <div className="settings-row">
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Load a .musicxml, .xml or .mxl file"
              >
                Load song…
              </button>
              {song.user && (
                <button
                  onClick={() => {
                    library.removeSong(song.id);
                    setSongId(library.songs[0].id);
                  }}
                  title="Remove this song from the library"
                >
                  Remove song
                </button>
              )}
              <button onClick={restart}>Restart</button>
            </div>

            <div className="settings-row">
              <label>
                Loop
                <select
                  value={loop ? loop.startMeasure : ""}
                  onChange={(e) =>
                    setLoop({
                      startMeasure: Number(e.target.value),
                      endMeasure: Math.max(
                        Number(e.target.value),
                        loop?.endMeasure ?? Number(e.target.value),
                      ),
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
                    setLoop((l) =>
                      l
                        ? {
                            ...l,
                            endMeasure: Math.max(
                              l.startMeasure,
                              Number(e.target.value),
                            ),
                          }
                        : l,
                    )
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
            </div>
            <div className="settings-row">
              <button
                onClick={() => setLoopFromHere("start")}
                title="Set loop start to the current measure"
              >
                Start here
              </button>
              <button
                onClick={() => setLoopFromHere("end")}
                title="Set loop end to the current measure"
              >
                End here
              </button>
              {loop && <button onClick={() => setLoop(null)}>Clear</button>}
            </div>

            <div className="settings-row">
              <label>
                Speed
                <select
                  value={speed}
                  onChange={(e) => changeSpeed(Number(e.target.value))}
                >
                  {[0.5, 0.75, 1, 1.25].map((v) => (
                    <option key={v} value={v}>
                      {v * 100}%
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="settings-row">
              <label>
                <input
                  type="checkbox"
                  checked={fullKeyboard}
                  onChange={(e) => setFullKeyboard(e.target.checked)}
                />
                88 keys
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={onScreenSound}
                  onChange={(e) => setOnScreenSound(e.target.checked)}
                />
                Sound
              </label>
            </div>
          </SettingsMenu>
        </div>
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
            {playback.playing
              ? "Playing…"
              : engine.finished
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
        {scoreError && (
          <p className="error">Could not load score: {scoreError}</p>
        )}
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
