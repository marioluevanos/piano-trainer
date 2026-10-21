import { useEffect, useRef, useState } from "react";
import type { HandMode, LoopRange } from "../../engine/types";
import { Button } from "../Button/Button";
import { SettingsMenu } from "../SettingsMenu/SettingsMenu";
import "./Toolbar.css";

interface Props {
  title?: string;
  /** Whether the song is playing back. */
  playing: boolean;
  /** False until the score is ready, which disables playback. */
  canPlay: boolean;
  handMode: HandMode;
  loop: LoopRange | null;
  /** The measure under the cursor, zero-based. */
  currentMeasure: number;
  measureCount: number;
  speed: number;
  fullKeyboard: boolean;
  sound: boolean;
  onHome: () => void;
  onTogglePlayback: () => void;
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
}

/**
 * The practice toolbar: a fixed gear button that slides in a bar with the
 * playback, hand and settings controls.
 */
export function Toolbar({
  title,
  playing,
  canPlay,
  handMode,
  loop,
  // currentMeasure,
  measureCount,
  speed,
  fullKeyboard,
  sound,
  onHome,
  onTogglePlayback,
  onRestart,
  onHandModeChange,
  onLoopChange,
  followRepeats,
  onFollowRepeatsChange,
  loopEndings,
  onSpeedChange,
  onFullKeyboardChange,
  onSoundChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const toolbarRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Hide the toolbar when the player taps or scrolls anywhere else. Scrolling is
  // detected from wheel/touch gestures rather than `scroll` events, so the score
  // auto-scrolling to follow the cursor does not close it.
  useEffect(() => {
    if (!open) return;
    const isOutside = (e: Event) => {
      const target = e.target as Node;
      return (
        !toolbarRef.current?.contains(target) &&
        !toggleRef.current?.contains(target)
      );
    };
    const close = (e: Event) => {
      if (isOutside(e)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
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
  }, [open]);

  // Left and right are independent toggles; at least one hand always stays selected.
  const leftOn = handMode !== "right";
  const rightOn = handMode !== "left";
  const toggleHand = (hand: "left" | "right") => {
    const left = hand === "left" ? !leftOn : leftOn;
    const right = hand === "right" ? !rightOn : rightOn;
    if (left && right) onHandModeChange("both");
    else if (left) onHandModeChange("left");
    else if (right) onHandModeChange("right");
  };

  const measureOptions = Array.from({ length: measureCount }, (_, i) => i);

  // const setLoopFromHere = (which: "start" | "end") => {
  //   const start =
  //     which === "start" ? currentMeasure : (loop?.startMeasure ?? 0);
  //   const end =
  //     which === "end" ? currentMeasure : (loop?.endMeasure ?? measureCount - 1);
  //   onLoopChange({
  //     startMeasure: Math.min(start, end),
  //     endMeasure: Math.max(start, end),
  //   });
  // };

  return (
    <>
      <Button
        ref={toggleRef}
        className="toolbar-toggle"
        size="lg"
        icon
        round
        variant="primary"
        active={open}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Hide toolbar" : "Show toolbar"}
        aria-expanded={open}
        title={open ? "Hide toolbar" : "Show toolbar"}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            fill="currentColor"
            d="M19.14 12.94a7.5 7.5 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2.4h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.59.24-1.13.56-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.67 8.88a.5.5 0 0 0 .12.64l2.03 1.58a7.5 7.5 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.3.6.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54c.04.24.25.42.49.42h3.84c.24 0 .45-.18.49-.42l.36-2.54c.59-.24 1.13-.56 1.63-.94l2.39.96c.22.08.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2Z"
          />
        </svg>
      </Button>

      {/* Slides in from the bottom while open; inert while hidden so it cannot be tabbed into. */}
      <header
        ref={toolbarRef}
        className={`toolbar${open ? " open" : ""}`}
        inert={!open}
      >
        <Button
          icon
          onClick={onHome}
          aria-label="Songs"
          title="Back to the song list"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              fill="currentColor"
              d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4-4.6-4.6z"
            />
          </svg>
        </Button>
        <span className="toolbar-title">{title}</span>

        <div className="toolbar-actions">
          <Button
            icon
            active={playing}
            onClick={onTogglePlayback}
            disabled={!canPlay}
            aria-label={playing ? "Stop" : "Play"}
            title="Play the song from the cursor (the selected hands only)"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                fill="currentColor"
                d={playing ? "M6 6h12v12H6z" : "M8 5v14l11-7z"}
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
              <Button onClick={onRestart}>Restart</Button>
              {loop && (
                <Button onClick={() => onLoopChange(null)}>Clear</Button>
              )}
            </div>

            <div className="settings-row">
              <label>
                Loop
                <select
                  value={loop ? loop.startMeasure : ""}
                  onChange={(e) => {
                    // "off" has an empty value, which Number() would turn into measure 1.
                    if (e.target.value === "") return onLoopChange(null);
                    const start = Number(e.target.value);
                    onLoopChange({
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
                    loop &&
                    onLoopChange({
                      ...loop,
                      endMeasure: Math.max(
                        loop.startMeasure,
                        Number(e.target.value),
                      ),
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
            <div className="settings-row">
              {/* <Button
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
              </Button> */}
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
            </div>
          </SettingsMenu>
        </div>
      </header>
    </>
  );
}
