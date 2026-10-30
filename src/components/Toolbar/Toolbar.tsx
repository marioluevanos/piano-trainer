import { useCallback, useState } from "react";
import { setLoopMeasure } from "../../engine/practiceEngine";
import type { HandMode, LoopRange } from "../../engine/types";
import { Button } from "../Button/Button";
import { ChevronLeftIcon } from "../Icons/ChevronLeftIcon";
import { ChevronRightIcon } from "../Icons/ChevronRightIcon";
import { LoopIcon } from "../Icons/LoopIcon";
import { MetronomeIcon } from "../Icons/MetronomeIcon";
import { PlayIcon } from "../Icons/PlayIcon";
import { RestartIcon } from "../Icons/RestartIcon";
import { SlidersIcon } from "../Icons/SlidersIcon";
import { StopIcon } from "../Icons/StopIcon";
import {
  SettingsDrawer,
  SettingsGroup,
  type SettingsTab,
} from "../SettingsDrawer/SettingsDrawer";
import { Stepper } from "../Stepper/Stepper";
import { Switch } from "../Switch/Switch";
import { useMediaQuery } from "../useMediaQuery";
import { togglePair } from "./togglePair";
import { ViewToggle, type TrainingView } from "./ViewToggle";
import "./Toolbar.css";

/** Screens too narrow for every button: the view toggles move into the settings drawer. */
const NARROW_QUERY = "(max-width: 640px)";

/** Speed runs from 25% to 200% in steps of 5%. */
const SPEED_MIN = 0.25;
const SPEED_MAX = 2;
const SPEED_STEP = 0.05;
const SPEED_PRESETS = [0.5, 0.75, 1];

/** How many measures a new loop spans when switched on from the drawer. */
const DEFAULT_LOOP_MEASURES = 2;

interface Props {
  /** Whether the song is playing back. */
  playing: boolean;
  /** False until the score is ready, which disables playback. */
  canPlay: boolean;
  handMode: HandMode;
  loop: LoopRange | null;
  /** 1-based note numbers the loop starts and ends on, when it starts or ends mid-measure. */
  loopNotes: { start: number | null; end: number | null };
  /** The measure under the cursor, zero-based. */
  currentMeasure: number;
  measureCount: number;
  /** The tempo at the cursor in quarter notes per minute, or null before the score loads. */
  bpm: number | null;
  speed: number;
  fullKeyboard: boolean;
  sound: boolean;
  /** Whether the expected notes' names show above the on-screen keys. */
  keyLabels: boolean;
  onHome: () => void;
  onTogglePlayback: () => void;
  /** Moves the cursor one playable note back (-1) or forward (1). */
  onNudge: (delta: 1 | -1) => void;
  onRestart: () => void;
  onHandModeChange: (mode: HandMode) => void;
  onLoopChange: (loop: LoopRange | null) => void;
  /** Whether the loop plays through repeat signs and endings as performed. */
  followRepeats: boolean;
  onFollowRepeatsChange: (follow: boolean) => void;
  /** Alternate endings the loop plays back to back (0-based measures), shown as a hint. */
  loopEndings: { first: number; last: number } | null;
  onSpeedChange: (speed: number) => void;
  onFullKeyboardChange: (full: boolean) => void;
  onSoundChange: (sound: boolean) => void;
  onKeyLabelsChange: (show: boolean) => void;
  /** Whether the sheet music is drawn light on dark. */
  darkScore: boolean;
  onDarkScoreChange: (dark: boolean) => void;
  /** What shows above the keyboard. */
  view: TrainingView;
  onViewChange: (view: TrainingView) => void;
}

/** "3" for a whole measure, "3.2" for its second note. */
export function loopEdgeLabel(measure: number, note: number | null): string {
  return note === null ? `${measure + 1}` : `${measure + 1}.${note}`;
}

/** "2–4", the loop's measures (with note numbers for mid-measure edges). */
export function loopRangeLabel(
  loop: LoopRange,
  notes: { start: number | null; end: number | null },
): string {
  return `${loopEdgeLabel(loop.startMeasure, notes.start)}–${loopEdgeLabel(loop.endMeasure, notes.end)}`;
}

/** The speed as a whole percentage, e.g. "80%". */
export function speedLabel(speed: number): string {
  return `${Math.round(speed * 100)}%`;
}

/**
 * The practice toolbar, fixed along the bottom: settings, hands, note nudging
 * and playback. A chip beside the measure shows the loop and speed while the
 * drawer is closed, so they are never a surprise.
 */
export function Toolbar({
  playing,
  canPlay,
  handMode,
  loop,
  loopNotes,
  currentMeasure,
  measureCount,
  bpm,
  speed,
  fullKeyboard,
  sound,
  keyLabels,
  onHome,
  onTogglePlayback,
  onNudge,
  onRestart,
  onHandModeChange,
  onLoopChange,
  followRepeats,
  onFollowRepeatsChange,
  loopEndings,
  onSpeedChange,
  onFullKeyboardChange,
  onSoundChange,
  onKeyLabelsChange,
  darkScore,
  onDarkScoreChange,
  view,
  onViewChange,
}: Props) {
  // Left and right are independent toggles; at least one hand always stays selected.
  const hands = togglePair(handMode, {
    first: "left",
    second: "right",
    both: "both",
  });
  const narrow = useMediaQuery(NARROW_QUERY);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tab, setTab] = useState<SettingsTab>("practice");
  const openDrawer = (to?: SettingsTab) => {
    if (to) setTab(to);
    setDrawerOpen(true);
  };
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Switching the loop on without one loops a few measures from the cursor.
  const toggleLoop = (on: boolean) => {
    if (!on) return onLoopChange(null);
    const last = Math.max(0, measureCount - 1);
    const start = Math.min(currentMeasure, last);
    onLoopChange({
      startMeasure: start,
      endMeasure: Math.min(last, start + DEFAULT_LOOP_MEASURES - 1),
    });
  };
  const stepLoop = (which: "start" | "end", delta: 1 | -1) => {
    if (!loop) return;
    const measure =
      (which === "start" ? loop.startMeasure : loop.endMeasure) + delta;
    onLoopChange(setLoopMeasure(loop, which, measure, measureCount));
  };

  const speedPercent = Math.round(speed * 100);
  const changeSpeed = (next: number) =>
    onSpeedChange(
      Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round(next * 100) / 100)),
    );
  const activeSettings = [
    loop && loopRangeLabel(loop, loopNotes),
    speedPercent !== 100 && speedLabel(speed),
  ].filter((s): s is string => !!s);

  const practice = (
    <>
      <section className="settings-section">
        <div className="settings-section-header">
          <Switch
            layout="inline"
            icon={<LoopIcon />}
            label="Loop section"
            checked={!!loop}
            disabled={!canPlay}
            onChange={toggleLoop}
          />
        </div>
        <div className="settings-fields">
          <div className="settings-field">
            <span className="settings-field-label">From measure</span>
            <Stepper
              label="From measure"
              display={
                loop ? loopEdgeLabel(loop.startMeasure, loopNotes.start) : "–"
              }
              disabled={!loop}
              canDecrement={!!loop && loop.startMeasure > 0}
              canIncrement={!!loop && loop.startMeasure < measureCount - 1}
              onDecrement={() => stepLoop("start", -1)}
              onIncrement={() => stepLoop("start", 1)}
            />
          </div>
          <div className="settings-field">
            <span className="settings-field-label">To measure</span>
            <Stepper
              label="To measure"
              display={
                loop ? loopEdgeLabel(loop.endMeasure, loopNotes.end) : "–"
              }
              disabled={!loop}
              canDecrement={!!loop && loop.endMeasure > 0}
              canIncrement={!!loop && loop.endMeasure < measureCount - 1}
              onDecrement={() => stepLoop("end", -1)}
              onIncrement={() => stepLoop("end", 1)}
            />
          </div>
        </div>
        <div className="settings-subrow">
          <p className="settings-help">Or drag the handles on the score</p>
          <Switch
            layout="inline"
            label="Follow repeats"
            checked={followRepeats}
            disabled={!loop}
            onChange={onFollowRepeatsChange}
            title="Play the loop through its repeat signs and endings, as the music is performed"
          />
        </div>
        {loopEndings && (
          <p className="settings-hint" role="note">
            Measures {loopEndings.first + 1}–{loopEndings.last + 1} are
            alternate endings, so this loop plays them back to back. Turn on
            Follow repeats to hear them as written.
          </p>
        )}
      </section>

      <section className="settings-section">
        <div className="settings-section-header">
          <h3 className="settings-section-title">
            <MetronomeIcon />
            Speed
          </h3>
          {bpm !== null && (
            <span className="settings-section-aside">
              ♩ = {Math.round(bpm * speed)}
              {speedPercent !== 100 && ` at ${speedPercent}%`}
            </span>
          )}
        </div>
        <div className="settings-fields">
          <div className="settings-field">
            <Stepper
              label="Speed"
              size="lg"
              display={speedLabel(speed)}
              canDecrement={speed > SPEED_MIN + 1e-6}
              canIncrement={speed < SPEED_MAX - 1e-6}
              onDecrement={() => changeSpeed(speed - SPEED_STEP)}
              onIncrement={() => changeSpeed(speed + SPEED_STEP)}
            />
          </div>
          <div
            className="settings-presets"
            role="group"
            aria-label="Speed presets"
          >
            {SPEED_PRESETS.map((v) => (
              <button
                key={v}
                type="button"
                className={`settings-preset${Math.abs(speed - v) < 1e-6 ? " selected" : ""}`}
                aria-pressed={Math.abs(speed - v) < 1e-6}
                onClick={() => changeSpeed(v)}
              >
                {Math.round(v * 100)}
              </button>
            ))}
          </div>
        </div>
      </section>
    </>
  );

  const display = (
    <>
      <SettingsGroup title="Keyboard">
        <Switch
          label="Show all 88 keys"
          description="Off zooms to the range this piece uses"
          checked={fullKeyboard}
          onChange={onFullKeyboardChange}
        />
        <Switch
          label="Note names on keys"
          checked={keyLabels}
          onChange={onKeyLabelsChange}
        />
        <Switch
          label="Keyboard sound"
          description="Play piano audio when you press a key"
          checked={sound}
          onChange={onSoundChange}
        />
      </SettingsGroup>
      <SettingsGroup title="Score">
        <Switch
          label="Dark score"
          description="Light notes on a dark page"
          checked={darkScore}
          onChange={onDarkScoreChange}
        />
      </SettingsGroup>
      {narrow && (
        <SettingsGroup title="View">
          <div className="settings-list-row" role="group" aria-label="View">
            <ViewToggle view={view} onChange={onViewChange} labeled />
          </div>
        </SettingsGroup>
      )}
    </>
  );

  return (
    <header className="toolbar">
      <Button
        icon
        onClick={onHome}
        aria-label="Songs"
        title="Back to the song list"
      >
        <ChevronLeftIcon />
      </Button>
      <span className="toolbar-measure" role="status">
        {canPlay ? (
          <>
            <span className="measure">Measure</span>{" "}
            <strong>{currentMeasure + 1}</strong> / {measureCount}
          </>
        ) : (
          "Loading score…"
        )}
      </span>
      {activeSettings.length > 0 && (
        <button
          type="button"
          className="toolbar-chip"
          onClick={() => openDrawer("practice")}
          aria-label={`Practice settings: ${[
            loop && `loop ${loopRangeLabel(loop, loopNotes)}`,
            speedPercent !== 100 && `speed ${speedLabel(speed)}`,
          ]
            .filter(Boolean)
            .join(", ")}`}
          title="Loop and speed"
        >
          {loop && <LoopIcon size={18} />}
          {activeSettings.map((s, i) => (
            <span key={s} className="toolbar-chip-part">
              {i > 0 && (
                <span className="toolbar-chip-divider" aria-hidden="true" />
              )}
              {s}
            </span>
          ))}
        </button>
      )}

      <div className="toolbar-actions">
        <Button
          icon
          active={drawerOpen}
          onClick={() => openDrawer()}
          aria-label="Settings"
          aria-expanded={drawerOpen}
          aria-haspopup="dialog"
          title="Settings"
        >
          <SlidersIcon />
        </Button>
        {!narrow && <ViewToggle view={view} onChange={onViewChange} />}
        <Button
          className="hand-button hand-L"
          icon
          active={hands.firstOn}
          onClick={() => onHandModeChange(hands.toggled("first"))}
          aria-pressed={hands.firstOn}
          aria-label="Left hand"
          title="Left hand"
        >
          L
        </Button>
        <Button
          className="hand-button"
          icon
          active={hands.secondOn}
          onClick={() => onHandModeChange(hands.toggled("second"))}
          aria-pressed={hands.secondOn}
          aria-label="Right hand"
          title="Right hand"
        >
          R
        </Button>
        <span className="toolbar-divider" aria-hidden="true" />
        <Button
          icon
          onClick={onRestart}
          aria-label="Restart"
          title="Restart from the beginning (of the loop, when one is set)"
        >
          <RestartIcon />
        </Button>
        <Button
          icon
          onClick={() => onNudge(-1)}
          disabled={!canPlay}
          aria-label="Previous note"
          title="Previous note (←)"
          className="prev-note"
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          icon
          onClick={() => onNudge(1)}
          disabled={!canPlay}
          aria-label="Next note"
          title="Next note (→)"
          className="next-note"
        >
          <ChevronRightIcon />
        </Button>
        <Button
          icon
          className="play-button"
          active={playing}
          onClick={onTogglePlayback}
          disabled={!canPlay}
          aria-label={playing ? "Stop" : "Play"}
          title="Play the song from the cursor (the selected hands only)"
        >
          {playing ? <StopIcon /> : <PlayIcon />}
        </Button>
      </div>

      <SettingsDrawer
        open={drawerOpen}
        tab={tab}
        onTabChange={setTab}
        onClose={closeDrawer}
        practice={practice}
        display={display}
      />
    </header>
  );
}
