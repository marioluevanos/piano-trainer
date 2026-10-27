import { useEffect, useRef, useState } from "react";
import { Button } from "../Button/Button";
import { InfoIcon } from "../Icons/InfoIcon";
import "./SongInfo.css";

interface Props {
  /** The score's credit lines: title first, then subtitle, composer, lyricist. */
  credits: string[];
  /** Whether to use the dark sheet music palette. */
  dark?: boolean;
}

/** A floating button that opens a popover with the song's credits. */
export function SongInfo({ credits, dark }: Props) {
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

  if (credits.length === 0) return null;

  return (
    <div
      className={dark ? "score-info score-dark" : "score-info"}
      ref={infoRef}
    >
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
