import { useEffect, useRef, useState } from "react";

interface Props {
  title: string;
  onEdit: () => void;
  onRemove: () => void;
}

/** A "more" button over a song card that opens a small menu to edit or remove the song. */
export function SongMenu({ title, onEdit, onRemove }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on a tap outside the menu or on Escape, and focus the first item on open.
  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className={`song-menu${open ? " open" : ""}`} ref={rootRef}>
      <button
        ref={buttonRef}
        className="song-menu-button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`More actions for ${title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="More actions"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
          />
        </svg>
      </button>
      {open && (
        <div className="song-menu-panel" role="menu" aria-label={title}>
          <button role="menuitem" onClick={choose(onEdit)}>
            Edit
          </button>
          <button role="menuitem" className="danger" onClick={choose(onRemove)}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
