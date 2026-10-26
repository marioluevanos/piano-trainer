import { useEffect, useRef } from "react";
import { PianoIcon } from "../Icons/PianoIcon";
import { PlayIcon } from "../Icons/PlayIcon";
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
          className="mode-option"
          autoFocus
          onClick={() => onChoose("practice")}
        >
          <PianoIcon size={32} />
          <span className="mode-label">Play with piano</span>
          <span className="mode-hint">{practiceHint}</span>
        </button>
        <button
          type="button"
          className="mode-option"
          onClick={() => onChoose("listen")}
        >
          <PlayIcon size={32} />
          <span className="mode-label">Listen</span>
          <span className="mode-hint">Hear the song play along the score</span>
        </button>
      </div>
    </dialog>
  );
}
