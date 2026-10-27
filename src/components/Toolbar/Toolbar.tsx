import type { HandMode, LoopRange } from "../../engine/types";
import { Button } from "../Button/Button";
import { SettingsMenu } from "../SettingsMenu/SettingsMenu";
import { ChevronLeftIcon } from "../Icons/ChevronLeftIcon";
import { ChevronRightIcon } from "../Icons/ChevronRightIcon";
import { PlayIcon } from "../Icons/PlayIcon";
import { RestartIcon } from "../Icons/RestartIcon";
import { StopIcon } from "../Icons/StopIcon";
import { useMediaQuery } from "../useMediaQuery";
import { togglePair } from "./togglePair";
import { ViewToggle, type TrainingView } from "./ViewToggle";
import "./Toolbar.css";

/** Screens too narrow for every button: the view toggles move into the settings panel. */
const NARROW_QUERY = "(max-width: 640px)";

interface Props {
  /** Whether the song is playing back. */
  playing: boolean;
  /** False until the score is ready, which disables playback. */
  canPlay: boolean;
  handMode: HandMode;
  loop: LoopRange | null;
  /** The note under the cursor, for setting a loop end on it; null before the score loads. */
  cursorNote: CursorNote | null;
  /** 1-based note numbers the loop starts and ends on, when it starts or ends mid-measure. */
  loopNotes: { start: number | null; end: number | null };
  /** The measure under the cursor, zero-based. */
  currentMeasure: number;
  measureCount: number;
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

/** Where the cursor is, in the terms a loop is set in. */
export interface CursorNote {
  measure: number;
  /** Absolute timestamp (whole notes). */
  timestamp: number;
  /** True on the measure's first note; a loop starting there takes the whole measure. */
  first: boolean;
  /** True on the measure's last note; a loop ending there takes the whole measure. */
  last: boolean;
}

/** The practice toolbar, fixed along the bottom: settings, hands, note nudging and playback. */
export function Toolbar({
  playing,
  canPlay,
  handMode,
  loop,
  cursorNote,
  loopNotes,
  currentMeasure,
  measureCount,
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

  const measureOptions = Array.from({ length: measureCount }, (_, i) => i);

  // A mid-measure loop end reads "3.2": measure 3, note 2.
  const loopEnd = (measure: number, note: number | null) =>
    note === null ? `${measure + 1}` : `${measure + 1}.${note}`;
  const loopLabel = loop
    ? ` • Loop ${loopEnd(loop.startMeasure, loopNotes.start)}–${loopEnd(loop.endMeasure, loopNotes.end)}`
    : "";

  // Start or end the loop on the note under the cursor. On a measure's first
  // (or last) note the loop takes the whole measure, so it shows no note label.
  // When the new end would fall before the other one, that end moves to the
  // whole cursor measure so the loop never runs backward.
  const setLoopFromHere = (which: "start" | "end") => {
    if (!cursorNote) return;
    const { measure, timestamp, first, last } = cursorNote;
    const next: LoopRange = {
      ...(loop ?? { startMeasure: 0, endMeasure: measureCount - 1 }),
    };
    if (which === "start") {
      next.startMeasure = measure;
      next.startTimestamp = first ? undefined : timestamp;
      const endsBefore =
        next.endMeasure < measure ||
        (next.endMeasure === measure &&
          next.endTimestamp !== undefined &&
          next.endTimestamp < timestamp);
      if (endsBefore) {
        next.endMeasure = measure;
        next.endTimestamp = undefined;
      }
    } else {
      next.endMeasure = measure;
      next.endTimestamp = last ? undefined : timestamp;
      const startsAfter =
        next.startMeasure > measure ||
        (next.startMeasure === measure &&
          next.startTimestamp !== undefined &&
          next.startTimestamp > timestamp);
      if (startsAfter) {
        next.startMeasure = measure;
        next.startTimestamp = undefined;
      }
    }
    onLoopChange(next);
  };

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
        {canPlay
          ? `Measure ${currentMeasure + 1}/${measureCount}${loopLabel}`
          : "Loading score…"}
      </span>

      <div className="toolbar-actions">
        <SettingsMenu>
          {loop && (
            <div className="settings-row">
              <Button onClick={() => onLoopChange(null)}>Clear</Button>
            </div>
          )}

          <div className="settings-row">
            <label>
              Loop
              <select
                value={loop ? loop.startMeasure : ""}
                onChange={(e) => {
                  // "off" has an empty value, which Number() would turn into measure 1.
                  if (e.target.value === "") return onLoopChange(null);
                  // A measure picked here starts on its first note; the
                  // end keeps its note unless it has to move.
                  const start = Number(e.target.value);
                  const end = Math.max(start, loop?.endMeasure ?? start);
                  onLoopChange({
                    startMeasure: start,
                    endMeasure: end,
                    endTimestamp:
                      end === loop?.endMeasure ? loop.endTimestamp : undefined,
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
                  loop &&
                  onLoopChange({
                    ...loop,
                    endMeasure: Math.max(
                      loop.startMeasure,
                      Number(e.target.value),
                    ),
                    endTimestamp: undefined,
                  })
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
          {(loopNotes.start !== null || loopNotes.end !== null) && (
            <p className="loop-note">
              {[
                loopNotes.start !== null && `Starts on note ${loopNotes.start}`,
                loopNotes.end !== null && `ends on note ${loopNotes.end}`,
              ]
                .filter(Boolean)
                .join(" · ")
                .replace(/^e/, "E")}
            </p>
          )}
          <div className="settings-row">
            <Button
              onClick={() => setLoopFromHere("start")}
              disabled={!cursorNote}
              title="Start the loop on the note under the cursor"
            >
              Start here
            </Button>
            <Button
              onClick={() => setLoopFromHere("end")}
              disabled={!cursorNote}
              title="End the loop on the note under the cursor"
            >
              End here
            </Button>
          </div>
          <div className="settings-row">
            <label title="Play the loop through its repeat signs and endings, as the music is performed">
              <input
                type="checkbox"
                checked={followRepeats}
                disabled={!loop}
                onChange={(e) => onFollowRepeatsChange(e.target.checked)}
              />
              Follow repeats
            </label>
          </div>
          {loopEndings && (
            <p className="settings-hint" role="note">
              Measures {loopEndings.first + 1}–{loopEndings.last + 1} are
              alternate endings, so this loop plays them back to back. Turn on
              Follow repeats to hear them as written.
            </p>
          )}

          <div className="settings-row">
            <label>
              Speed
              <select
                value={speed}
                onChange={(e) => onSpeedChange(Number(e.target.value))}
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
                onChange={(e) => onFullKeyboardChange(e.target.checked)}
              />
              88 keys
            </label>
            <label title="Play a sound when you tap the on-screen keyboard">
              <input
                type="checkbox"
                checked={sound}
                onChange={(e) => onSoundChange(e.target.checked)}
              />
              Keyboard Sound
            </label>
            <label title="Show the names of the notes to play above the on-screen keys">
              <input
                type="checkbox"
                checked={keyLabels}
                onChange={(e) => onKeyLabelsChange(e.target.checked)}
              />
              Note names
            </label>
            <label title="Draw the sheet music light on a dark background">
              <input
                type="checkbox"
                checked={darkScore}
                onChange={(e) => onDarkScoreChange(e.target.checked)}
              />
              Dark score
            </label>
          </div>
          {narrow && (
            <div className="settings-row" role="group" aria-label="View">
              <ViewToggle view={view} onChange={onViewChange} labeled />
            </div>
          )}
        </SettingsMenu>
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
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          icon
          onClick={() => onNudge(1)}
          disabled={!canPlay}
          aria-label="Next note"
          title="Next note (→)"
        >
          <ChevronRightIcon />
        </Button>
        <Button
          icon
          active={playing}
          onClick={onTogglePlayback}
          disabled={!canPlay}
          aria-label={playing ? "Stop" : "Play"}
          title="Play the song from the cursor (the selected hands only)"
        >
          {playing ? <StopIcon /> : <PlayIcon />}
        </Button>
      </div>
    </header>
  );
}
