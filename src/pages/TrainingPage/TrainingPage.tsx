import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard } from "../../components/Keyboard/Keyboard";
import { noteName } from "../../components/Keyboard/keys";
import { NoteRoll } from "../../components/NoteRoll/NoteRoll";
import { PianoStage } from "../../components/PianoStage/PianoStage";
import {
  ScoreView,
  type ScoreClick,
  type ScoreInfo,
} from "../../components/ScoreView/ScoreView";
import { SongInfo } from "../../components/SongInfo/SongInfo";
import { Status } from "../../components/Status/Status";
import { Toolbar, type CursorNote } from "../../components/Toolbar/Toolbar";
import { parseTrainingView } from "../../components/Toolbar/ViewToggle";
import {
  expectedMidi,
  expectedNotes,
  initialState,
  jumpTo,
  loopStartIndex,
  loopSteps,
  measureNoteTimes,
  noteOff as engineNoteOff,
  noteOn as engineNoteOn,
  stepBy,
  sustainedNotes,
  type EngineState,
  endingsInLoop,
} from "../../engine/practiceEngine";
import { buildNoteRoll } from "../../engine/noteRoll";
import type {
  EndingSet,
  Hand,
  HandMode,
  KeyState,
  LoopRange,
  Step,
} from "../../engine/types";
import { useMidiInput } from "../../midi/useMidiInput";
import { usePlayback } from "../../midi/usePlayback";
import { synthNoteOff, synthNoteOn } from "../../midi/synth";
import type { Song } from "../../songs";
import { useLandscapeLock } from "./useLandscapeLock";
import { useSetting, useStoredSetting } from "./useSetting";
import "./TrainingPage.css";

const FULL_KEYBOARD_KEY = "piano-trainer.full-keyboard.v1";
const KEYBOARD_SOUND_KEY = "piano-trainer.keyboard-sound.v1";
const KEY_LABELS_KEY = "piano-trainer.key-labels.v1";
const DARK_SCORE_KEY = "piano-trainer.dark-score.v1";
const VIEW_KEY = "piano-trainer.view.v1";

interface TrainingPageProps {
  /** The song to train on; undefined while the library loads or when it is gone. */
  song: Song | undefined;
  /** True while the song library is still loading. */
  loading: boolean;
  /** Whether the user is signed in, to explain why a song is missing. */
  signedIn: boolean;
  onHome: () => void;
}

/**
 * Practicing one song: the toolbar, keyboard, score and status line. App keys
 * this page on the song id, so opening another song starts from a clean slate.
 */
export function TrainingPage({
  song,
  loading,
  signedIn,
  onHome,
}: TrainingPageProps) {
  // Keyed on the id: the song objects are rebuilt whenever the list updates.
  const source = useMemo(() => song?.load(), [song?.id]);

  // Training is laid out for landscape.
  useLandscapeLock();

  const [steps, setSteps] = useState<Step[]>([]);
  const [measureCount, setMeasureCount] = useState(0);
  const [endings, setEndings] = useState<EndingSet[]>([]);
  const [credits, setCredits] = useState<string[]>([]);
  const [scoreError, setScoreError] = useState<string | null>(null);

  const [handMode, setHandMode] = useState<HandMode>("both");
  const [loopRange, setLoopRange] = useState<LoopRange | null>(null);
  // Kept apart from the range so it survives clearing or changing the loop.
  const [followRepeats, setFollowRepeats] = useState(false);
  const loop = useMemo(
    () => loopRange && { ...loopRange, followRepeats },
    [loopRange, followRepeats],
  );
  const loopEndings = useMemo(
    () => (loop && !followRepeats ? endingsInLoop(endings, loop) : null),
    [endings, loop, followRepeats],
  );
  const [fullKeyboard, changeFullKeyboard] = useSetting(FULL_KEYBOARD_KEY);
  const [onScreenSound, changeOnScreenSound] = useSetting(KEYBOARD_SOUND_KEY);
  const [keyLabels, changeKeyLabels] = useSetting(KEY_LABELS_KEY);
  const [darkScore, changeDarkScore] = useSetting(DARK_SCORE_KEY, false);
  const [view, changeView] = useStoredSetting(
    VIEW_KEY,
    "both",
    parseTrainingView,
  );
  const [speed, setSpeed] = useState(1);

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
    setEndings(info.endings);
    setCredits(info.credits);
    setLoopRange(null);
  }, []);

  const currentStep = steps[engine.stepIndex];
  const expected = useMemo(
    () => expectedMidi(currentStep, handMode),
    [currentStep, handMode],
  );

  const sustained = useMemo(
    () => sustainedNotes(steps, engine.stepIndex, handMode),
    [steps, engine.stepIndex, handMode],
  );

  const keyStates = useMemo(() => {
    const m = new Map<number, KeyState>();
    for (const n of expected) m.set(n, "expected");
    // A tied note still sounding stays lit until the tie ends; holding it down is correct.
    const sustainedMidi = new Set<number>();
    for (const n of sustained) {
      if (expected.has(n.midi)) continue;
      sustainedMidi.add(n.midi);
      m.set(n.midi, "expected");
    }
    // A held note that fell out of the chord window stays "expected" until it is struck again.
    for (const n of engine.held)
      m.set(
        n,
        engine.hits.has(n) || sustainedMidi.has(n)
          ? "correct"
          : expected.has(n)
            ? "expected"
            : "pressed",
      );
    for (const n of engine.misses) m.set(n, "wrong");
    for (const n of engine.hits) if (!engine.held.has(n)) m.set(n, "correct");
    return m;
  }, [expected, sustained, engine.held, engine.misses, engine.hits]);

  const hands = useMemo(() => {
    const m = new Map<number, Hand>();
    for (const n of sustained) m.set(n.midi, n.hand);
    for (const n of expectedNotes(currentStep, handMode)) m.set(n.midi, n.hand);
    return m;
  }, [currentStep, handMode, sustained]);

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

  // The falling notes, laid out the way playback will play them.
  const roll = useMemo(
    () => buildNoteRoll(steps, loop, speed),
    [steps, loop, speed],
  );

  const currentMeasure = currentStep ? currentStep.measure : 0;

  // The note under the cursor, for "Start here" and "End here".
  const cursorNote = useMemo<CursorNote | null>(() => {
    if (!currentStep) return null;
    const times = measureNoteTimes(steps, currentStep.measure);
    return {
      measure: currentStep.measure,
      timestamp: currentStep.timestamp,
      first: currentStep.timestamp <= times[0] + 1e-6,
      last: currentStep.timestamp >= times[times.length - 1] - 1e-6,
    };
  }, [steps, currentStep]);

  // Note numbers for a loop that starts or ends mid-measure, for its labels.
  const loopNotes = useMemo(() => {
    const noteNumber = (measure: number, timestamp: number | undefined) => {
      if (timestamp === undefined) return null;
      const i = measureNoteTimes(steps, measure).findIndex(
        (t) => Math.abs(t - timestamp) < 1e-6,
      );
      return i < 0 ? null : i + 1;
    };
    return {
      start: loop ? noteNumber(loop.startMeasure, loop.startTimestamp) : null,
      end: loop ? noteNumber(loop.endMeasure, loop.endTimestamp) : null,
    };
  }, [steps, loop]);
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

  // Jump to the tapped note (the nearest one in the measure); playback
  // continues from there.
  const seekTo = ({ measure, timestamp }: ScoreClick) => {
    // A repeated measure appears once per pass; inside a loop, pick the pass it plays.
    const candidates = loop
      ? loopSteps(steps, loop).map((k) => steps[k])
      : steps;
    const found =
      timestamp === null
        ? candidates.find((s) => s.measure >= measure)
        : candidates.find(
            (s) => s.measure === measure && s.timestamp >= timestamp - 1e-6,
          );
    const i = found?.index ?? -1;
    if (i < 0) return;
    const next = jumpTo(steps, i, { handMode, loop });
    setEngine(next);
    if (playback.playing) startPlayback(speed, next.stepIndex);
  };

  // Move the cursor one note back or forward; playback continues from there.
  const nudge = (delta: 1 | -1) => {
    const opts = { handMode, loop };
    const i = stepBy(steps, engine.stepIndex, delta, opts);
    if (steps.length === 0 || i === engine.stepIndex) return;
    setEngine(jumpTo(steps, i, opts));
    if (playback.playing) startPlayback(speed, i);
  };
  const nudgeRef = useRef(nudge);
  nudgeRef.current = nudge;

  // Arrow keys nudge the cursor, except while a control has focus.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const delta =
        e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : null;
      if (delta === null) return;
      const target = e.target as HTMLElement;
      if (target.closest("input, select, textarea, [role=dialog]")) return;
      e.preventDefault();
      nudgeRef.current(delta);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const togglePlayback = () =>
    playback.playing ? playback.stop() : startPlayback(speed);

  const changeSpeed = (value: number) => {
    setSpeed(value);
    // Pick up the new speed from the current step.
    if (playback.playing) startPlayback(value);
  };

  return (
    <div className="training-page">
      <SongInfo credits={credits} dark={darkScore} />
      {/* Hidden rather than unmounted when not shown: rendering the score is what produces the steps. */}
      <section
        className={darkScore ? "score-area score-dark" : "score-area"}
        hidden={view === "roll"}
      >
        {scoreError && (
          <p className="error">Could not load score: {scoreError}</p>
        )}
        {source ? (
          <ScoreView
            source={source}
            dark={darkScore}
            cursorStep={engine.stepIndex}
            loop={loop}
            onReady={handleReady}
            onScoreClick={seekTo}
            onError={setScoreError}
          />
        ) : (
          <p className="score-placeholder">
            {loading
              ? "Loading song…"
              : signedIn
                ? "This song is no longer available."
                : "This song is not available. If it is one of yours, sign in on the home page."}
          </p>
        )}
      </section>
      <section
        className={view === "roll" ? "keyboard-area fill" : "keyboard-area"}
      >
        <PianoStage range={range} labeled={keyLabels}>
          {view !== "score" && (
            <NoteRoll
              roll={roll}
              range={range}
              handMode={handMode}
              stepIndex={engine.stepIndex}
              playing={playback.playing}
              position={playback.position}
              labels={keyLabels}
            />
          )}
          <Keyboard
            keyStates={keyStates}
            hands={hands}
            labels={keyLabels ? labels : undefined}
            range={range}
            onNoteOn={onScreenNoteOn}
            onNoteOff={onScreenNoteOff}
          />
        </PianoStage>
        <Toolbar
          playing={playback.playing}
          canPlay={steps.length > 0}
          handMode={handMode}
          loop={loop}
          cursorNote={cursorNote}
          loopNotes={loopNotes}
          currentMeasure={currentMeasure}
          measureCount={measureCount}
          speed={speed}
          fullKeyboard={fullKeyboard}
          sound={onScreenSound}
          keyLabels={keyLabels}
          onHome={onHome}
          onTogglePlayback={togglePlayback}
          onNudge={nudge}
          onRestart={restart}
          onHandModeChange={setHandMode}
          onLoopChange={setLoopRange}
          followRepeats={followRepeats}
          onFollowRepeatsChange={setFollowRepeats}
          loopEndings={loopEndings}
          onSpeedChange={changeSpeed}
          onFullKeyboardChange={changeFullKeyboard}
          onSoundChange={changeOnScreenSound}
          onKeyLabelsChange={changeKeyLabels}
          darkScore={darkScore}
          onDarkScoreChange={changeDarkScore}
          view={view}
          onViewChange={changeView}
        />
      </section>
      <Status midi={midi} />
    </div>
  );
}

function loopStart(steps: Step[], loop: LoopRange): number {
  return Math.max(0, loopStartIndex(steps, loop));
}
