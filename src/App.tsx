import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, noteName } from "./components/Keyboard/Keyboard";
import {
  ScoreView,
  type ScoreClick,
  type ScoreInfo,
} from "./components/ScoreView/ScoreView";
import { HomePage } from "./components/HomePage/HomePage";
import { Status } from "./components/Status/Status";
import { Toolbar } from "./components/Toolbar/Toolbar";
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

  // The home page follows the device; practice locks to landscape. Locking only
  // works where the browser allows it (an installed PWA or fullscreen).
  useEffect(() => {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: "landscape") => Promise<void>;
    };
    if (practicing) orientation.lock?.("landscape").catch(() => {});
    else orientation.unlock?.();
  }, [practicing]);

  const [steps, setSteps] = useState<Step[]>([]);
  const [measureCount, setMeasureCount] = useState(0);
  const [scoreError, setScoreError] = useState<string | null>(null);

  const [handMode, setHandMode] = useState<HandMode>("both");
  const [loop, setLoop] = useState<LoopRange | null>(null);
  const [fullKeyboard, setFullKeyboard] = useState(true);
  const [onScreenSound, setOnScreenSound] = useState(true);
  const [speed, setSpeed] = useState(1);

  const openSong = (id: string) => {
    if (id !== songId) {
      // Drop the previous song's steps so nothing acts on them until the new score is ready.
      setSteps([]);
      setMeasureCount(0);
    }
    setSongId(id);
    saveSelectedSongId(id);
    setScoreError(null);
    history.pushState({ practice: true }, "");
    setPracticing(true);
  };
  const goHome = () => history.back();

  const onAddSong = async (song: ImportedSong, details: SongDetails) => {
    const added = await library.addSong(song, details);
    openSong(added.id);
  };
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
      <Toolbar
        title={song?.title}
        playing={playback.playing}
        canPlay={steps.length > 0}
        handMode={handMode}
        loop={loop}
        currentMeasure={currentMeasure}
        measureCount={measureCount}
        speed={speed}
        fullKeyboard={fullKeyboard}
        sound={onScreenSound}
        onHome={goHome}
        onTogglePlayback={togglePlayback}
        onRestart={restart}
        onHandModeChange={setHandMode}
        onLoopChange={setLoop}
        onSpeedChange={changeSpeed}
        onFullKeyboardChange={setFullKeyboard}
        onSoundChange={setOnScreenSound}
      />

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
            {library.loading
              ? "Loading song…"
              : "This song is no longer available."}
          </p>
        )}
      </section>

      <Status
        midi={midi}
        playing={playback.playing}
        finished={engine.finished}
        loaded={steps.length > 0}
        loop={loop}
        currentMeasure={currentMeasure}
        measureCount={measureCount}
        completedSteps={engine.completedSteps}
        wrongNotes={engine.wrongNotes}
      />
    </div>
  );
}

function loopStart(steps: Step[], loop: LoopRange): number {
  const i = steps.findIndex((s) => s.measure >= loop.startMeasure);
  return i < 0 ? 0 : i;
}
