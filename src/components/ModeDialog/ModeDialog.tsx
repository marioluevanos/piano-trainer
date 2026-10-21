import { useEffect, useRef } from "react";
import "./ModeDialog.css";

export type TrainingMode = "practice" | "listen";

interface Props {
  title?: string;
  /** What the player will practice with, e.g. the connected MIDI keyboard. */
  practiceHint: string;
  onChoose: (mode: TrainingMode) => void;
}

/**
 * Asked when a song opens: practice it on the piano (the default) or just
 * listen to it. Escape or a click outside picks practice.
 */
export function ModeDialog({ title, practiceHint, onChoose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="mode-dialog"
      aria-labelledby="mode-dialog-heading"
      onCancel={(e) => {
        e.preventDefault();
        onChoose("practice");
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onChoose("practice");
      }}
    >
      <h2 id="mode-dialog-heading">{title ?? "How do you want to start?"}</h2>
      <div className="mode-options">
        <button
          type="button"
          className="mode-option primary"
          autoFocus
          onClick={() => onChoose("practice")}
        >
          <svg
            viewBox="0 0 24 24"
            width="32"
            height="32"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 13v7M15 13v7" />
            <path
              fill="currentColor"
              stroke="none"
              d="M7.5 4h3v9h-3zM13.5 4h3v9h-3z"
            />
          </svg>
          <span className="mode-label">Play with piano</span>
          <span className="mode-hint">{practiceHint}</span>
        </button>
        <button
          type="button"
          className="mode-option"
          onClick={() => onChoose("listen")}
        >
          <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true">
            <path fill="currentColor" d="M8 5v14l11-7z" />
          </svg>
          <span className="mode-label">Listen</span>
          <span className="mode-hint">Hear the song play along the score</span>
        </button>
      </div>
    </dialog>
  );
}
