import { useEffect, useRef, useState } from "react";
import { Button } from "../Button/Button";
import { InfoIcon } from "../Icons/InfoIcon";
import "./SongInfo.css";

interface Props {
  /** The score's credit lines: title first, then subtitle, composer, lyricist. */
  credits: string[];
  /** Whether to use the dark sheet music palette. */
  dark?: boolean;
  /** The tempo at the cursor in quarter notes per minute, or null before the score loads. */
  bpm?: number | null;
  /** Playback speed, 1 for the written tempo. */
  speed?: number;
  /** Whether the song is playing back, to show the speed it plays at. */
  playing?: boolean;
}

/**
 * Floats over the score's top-left corner: a button that opens a popover with
 * the song's credits, the tempo, and the speed while playing slower or faster.
 */
export function SongInfo({
  credits,
  dark,
  bpm = null,
  speed = 1,
  playing = false,
}: Props) {
  const infoRef = useRef<HTMLDivElement>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  // Close the info popover on outside press or Escape.
  useEffect(() => {
    if (!infoOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!infoRef.current?.contains(e.target as Node)) setInfoOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInfoOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [infoOpen]);

  const speedPercent = Math.round(speed * 100);
  if (credits.length === 0 && bpm === null) return null;

  return (
    <div
      className={dark ? "score-info score-dark" : "score-info"}
      ref={infoRef}
    >
      <div className="score-info-row">
        {credits.length > 0 && (
          <Button
            className="score-info-button"
            size="xs"
            icon
            round
            active={infoOpen}
            onClick={() => setInfoOpen((o) => !o)}
            aria-label="Song info"
            aria-expanded={infoOpen}
            title="Song info"
          >
            <InfoIcon size={18} />
          </Button>
        )}
        {bpm !== null && (
          <span className="score-tempo" title="Tempo">
            <span aria-hidden="true">♩ = </span>
            <span className="visually-hidden">Tempo </span>
            {Math.round(bpm)}
          </span>
        )}
        {playing && speedPercent !== 100 && (
          <span className="score-speed" role="status">
            playing at {speedPercent}%
          </span>
        )}
      </div>
      {infoOpen && (
        <div className="score-info-panel" role="dialog" aria-label="Song info">
          {credits.map((line, i) =>
            i === 0 ? <h2 key={i}>{line}</h2> : <p key={i}>{line}</p>,
          )}
        </div>
      )}
    </div>
  );
}
