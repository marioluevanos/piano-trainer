import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./components/Button/Button";
import { Keyboard, noteName } from "./components/Keyboard";
import {
  ScoreView,
  type ScoreClick,
  type ScoreInfo,
} from "./components/ScoreView";
import { HomePage } from "./components/HomePage";
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
import {
  loadSelectedSongId,
  saveSelectedSongId,
  useSongLibrary,
  type ImportedSong,
  type SongDetails,
} from "./songs/library";

export default function App() {
  const library = useSongLibrary();
  const [songId, setSongId] = useState(loadSelectedSongId);
  const song = library.songs.find((s) => s.id === songId);
  // Keyed on the id: the song objects are rebuilt whenever the list updates.
  const source = useMemo(() => song?.load(), [song?.id]);

  // The app opens on the home page. Opening a song pushes a history entry, so
  // the browser (or Android) back button returns to the song list.
  const [practicing, setPracticing] = useState(false);
  useEffect(() => {
    // A reload lands on the home page, so drop a stale practice entry.
    if (history.state?.practice) history.replaceState(null, "");
    const onPopState = () => setPracticing(!!history.state?.practice);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const [steps, setSteps] = useState<Step[]>([]);
  const [measureCount, setMeasureCount] = useState(0);
  const [scoreError, setScoreError] = useState<string | null>(null);

  const [handMode, setHandMode] = useState<HandMode>("both");
  const [loop, setLoop] = useState<LoopRange | null>(null);
  const [fullKeyboard, setFullKeyboard] = useState(true);
  const [onScreenSound, setOnScreenSound] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [toolbarOpen, setToolbarOpen] = useState(false);

  const openSong = (id: string) => {
    if (id !== songId) {
      // Drop the previous song's steps so nothing acts on them until the new score is ready.
      setSteps([]);
      setMeasureCount(0);
    }
    setSongId(id);
    saveSelectedSongId(id);
    setScoreError(null);
    setToolbarOpen(false);
    history.pushState({ practice: true }, "");
    setPracticing(true);
  };
  const goHome = () => history.back();

  const onAddSong = async (song: ImportedSong, details: SongDetails) => {
    const added = await library.addSong(song, details);
    openSong(added.id);
  };
  const toolbarRef = useRef<HTMLElement>(null);
  const toolbarToggleRef = useRef<HTMLButtonElement>(null);

  // Hide the toolbar when the player taps or scrolls anywhere else. Scrolling is
  // detected from wheel/touch gestures rather than `scroll` events, so the score
  // auto-scrolling to follow the cursor does not close it.
  useEffect(() => {
    if (!toolbarOpen) return;
    const isOutside = (e: Event) => {
      const target = e.target as Node;
      return (
        !toolbarRef.current?.contains(target) &&
        !toolbarToggleRef.current?.contains(target)
      );
    };
    const close = (e: Event) => {
      if (isOutside(e)) setToolbarOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setToolbarOpen(false);
    };
    const opts = { capture: true, passive: true };
    document.addEventListener("pointerdown", close, opts);
    document.addEventListener("wheel", close, opts);
    document.addEventListener("touchmove", close, opts);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", close, opts);
      document.removeEventListener("wheel", close, opts);
      document.removeEventListener("touchmove", close, opts);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [toolbarOpen]);

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
  useEffect(() => {
    if (!practicing) playback.stop();
  }, [practicing, playback.stop]);
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
        engine.hits.has(n)
          ? "correct"
          : expected.has(n)
            ? "expected"
            : "pressed",
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

  const startPlayback = (playSpeed: number, from?: number) => {
    const start =
      from ??
      (engine.finished
        ? loop
          ? loopStart(steps, loop)
          : 0
        : engine.stepIndex);
    playback.play(steps, start, { handMode, loop, speed: playSpeed });
  };

  // Jump to a clicked note, or the start of the measure when the click missed
  // every note; playback continues from there.
  const seekTo = ({ measure, timestamp }: ScoreClick) => {
    const i =
      timestamp === null
        ? steps.findIndex((s) => s.measure >= measure)
        : steps.findIndex(
            (s) => s.measure === measure && s.timestamp >= timestamp - 1e-6,
          );
    if (i < 0) return;
    const next = jumpTo(steps, i, { handMode, loop });
    setEngine(next);
    if (playback.playing) startPlayback(speed, next.stepIndex);
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

  if (!practicing) {
    return (
      <HomePage
        songs={library.songs}
        lastSongId={songId}
        loading={library.loading}
        error={library.error}
        user={library.user}
        onOpen={openSong}
        onAdd={onAddSong}
        onEdit={library.editSong}
        onRemove={library.removeSong}
        onSignIn={library.signIn}
        onSignOut={library.signOut}
      />
    );
  }

  return (
    <div className="app">
      {/* Shown by CSS only on touch devices held in portrait. */}
      <div className="rotate-prompt" role="alert">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="7" y="2" width="10" height="20" rx="2" />
          <path d="M3 9a9 9 0 0 1 4-5M21 15a9 9 0 0 1-4 5" />
        </svg>
        <p>Rotate your device to landscape</p>
      </div>
      <Button
        ref={toolbarToggleRef}
        className="toolbar-toggle"
        size="lg"
        icon
        round
        active={toolbarOpen}
        onClick={() => setToolbarOpen((o) => !o)}
        aria-label={toolbarOpen ? "Hide toolbar" : "Show toolbar"}
        aria-expanded={toolbarOpen}
        title={toolbarOpen ? "Hide toolbar" : "Show toolbar"}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            fill="currentColor"
            d="M19.14 12.94a7.5 7.5 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2.4h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.59.24-1.13.56-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.67 8.88a.5.5 0 0 0 .12.64l2.03 1.58a7.5 7.5 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.3.6.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54c.04.24.25.42.49.42h3.84c.24 0 .45-.18.49-.42l.36-2.54c.59-.24 1.13-.56 1.63-.94l2.39.96c.22.08.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2Z"
          />
        </svg>
      </Button>

      {/* Slides in from the top while open; inert while hidden so it cannot be tabbed into. */}
      <header
        ref={toolbarRef}
        className={`toolbar${toolbarOpen ? " open" : ""}`}
        inert={!toolbarOpen}
      >
        <Button
          icon
          onClick={goHome}
          aria-label="Songs"
          title="Back to the song list"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path fill="currentColor" d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4-4.6-4.6z" />
          </svg>
        </Button>
        <span className="toolbar-title">{song?.title}</span>

        <div className="toolbar-actions">
          <Button
            icon
            active={playback.playing}
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
          </Button>
          <Button
            className="hand-button hand-L"
            icon
            active={leftOn}
            onClick={() => toggleHand("left")}
            aria-pressed={leftOn}
            aria-label="Left hand"
            title="Left hand"
          >
            L
          </Button>
          <Button
            className="hand-button"
            icon
            active={rightOn}
            onClick={() => toggleHand("right")}
            aria-pressed={rightOn}
            aria-label="Right hand"
            title="Right hand"
          >
            R
          </Button>

          <SettingsMenu>
            <div className="settings-row">
              <Button onClick={restart}>Restart</Button>
            </div>

            <div className="settings-row">
              <label>
                Loop
                <select
                  value={loop ? loop.startMeasure : ""}
                  onChange={(e) => {
                    // "off" has an empty value, which Number() would turn into measure 1.
                    if (e.target.value === "") return setLoop(null);
                    const start = Number(e.target.value);
                    setLoop({
                      startMeasure: start,
                      endMeasure: Math.max(start, loop?.endMeasure ?? start),
                    });
                  }}
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
              <Button
                onClick={() => setLoopFromHere("start")}
                title="Set loop start to the current measure"
              >
                Start here
              </Button>
              <Button
                onClick={() => setLoopFromHere("end")}
                title="Set loop end to the current measure"
              >
                End here
              </Button>
              {loop && <Button onClick={() => setLoop(null)}>Clear</Button>}
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
      </section>

      <section className="score-area">
        {scoreError && (
          <p className="error">Could not load score: {scoreError}</p>
        )}
        {source ? (
          <ScoreView
            source={source}
            cursorStep={engine.stepIndex}
            onReady={handleReady}
            onScoreClick={seekTo}
            onError={setScoreError}
          />
        ) : (
          <p className="score-placeholder">
            {library.loading ? "Loading song…" : "This song is no longer available."}
          </p>
        )}
      </section>

      <section className="status">
        <span>
          {midi.status === "ready"
            ? midi.inputs.length
              ? `MIDI: ${midi.inputs.map((i) => i.name).join(", ")}`
              : "MIDI ready — no keyboard connected"
            : midi.status === "unsupported"
              ? "Web MIDI not supported in this browser"
              : midi.status === "denied"
                ? "MIDI access denied"
                : midi.status === "requesting"
                  ? "Requesting MIDI access…"
                  : midi.status === "unavailable"
                    ? "MIDI unavailable on this device — on-screen keys still work"
                    : `MIDI error (${midi.error})`}
          {(midi.status === "unavailable" || midi.status === "error") && (
            <Button
              className="status-retry"
              size="xs"
              onClick={midi.retry}
              title={midi.error ?? undefined}
            >
              Retry
            </Button>
          )}
        </span>
        <span>
          {playback.playing
            ? `Playing…${loop ? ` · loop ${loop.startMeasure + 1}–${loop.endMeasure + 1}` : ""}`
            : engine.finished
              ? "Finished! 🎉"
              : steps.length
                ? `Measure ${currentMeasure + 1} / ${measureCount}${loop ? ` · loop ${loop.startMeasure + 1}–${loop.endMeasure + 1}` : ""}`
                : "Loading score…"}
          {" · "}
          {engine.completedSteps} played, {engine.wrongNotes} wrong
        </span>
      </section>
    </div>
  );
}

function loopStart(steps: Step[], loop: LoopRange): number {
  const i = steps.findIndex((s) => s.measure >= loop.startMeasure);
  return i < 0 ? 0 : i;
}
