import { useEffect, useRef, useState } from "react";
import { makeCover } from "../songs/cover";
import type { SongDetails } from "../songs/library";
import { Button } from "./Button/Button";

interface Props {
  heading: string;
  submitLabel: string;
  initialTitle: string;
  /** The current cover, shown until the user picks another or removes it. */
  initialCoverUrl: string | null;
  /** The score file being added, shown as a reminder of what was picked. */
  fileName?: string;
  /** Saves the details. Throws (with a message for the user) if that fails. */
  onSubmit: (details: SongDetails) => Promise<void>;
  onClose: () => void;
}

/** A modal for a song's title and optional square cover, used to add and to edit songs. */
export function SongDialog({
  heading,
  submitLabel,
  initialTitle,
  initialCoverUrl,
  fileName,
  onSubmit,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(initialTitle);
  /** A new cover, null once removed, or undefined while unchanged. */
  const [cover, setCover] = useState<Blob | null | undefined>(undefined);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    if (!cover) {
      setCoverUrl(null);
      return;
    }
    const url = URL.createObjectURL(cover);
    setCoverUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [cover]);

  const preview = cover === undefined ? initialCoverUrl : coverUrl;

  const pickCover = async (file: File | undefined) => {
    if (!file) return;
    try {
      setCover(await makeCover(file));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit({ title, cover });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="song-dialog"
      aria-labelledby="song-dialog-heading"
      // Escape closes the dialog; keep it open while saving.
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <h2 id="song-dialog-heading">{heading}</h2>
        <div className="song-dialog-body">
          <div
            className={`cover-picker${dragging ? " dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pickCover(e.dataTransfer.files[0]);
            }}
          >
            <Button
              className="cover-pick"
              onClick={() => imageInputRef.current?.click()}
              aria-label={preview ? "Change cover image" : "Add cover image"}
              disabled={busy}
            >
              {preview ? (
                <img src={preview} alt="" />
              ) : (
                <span className="cover-pick-empty">
                  <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
                    <path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" />
                  </svg>
                  Add cover
                </span>
              )}
            </Button>
            {preview && (
              <Button
                className="cover-clear"
                size="sm"
                icon
                round
                onClick={() => setCover(null)}
                aria-label="Remove cover image"
                title="Remove cover image"
                disabled={busy}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z"
                  />
                </svg>
              </Button>
            )}
          </div>
          <div className="song-dialog-fields">
            <label>
              Title
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={300}
                required
                disabled={busy}
              />
            </label>
            {fileName && <p className="song-dialog-file">{fileName}</p>}
            <p className="song-dialog-hint">The cover is optional and is cropped square.</p>
          </div>
        </div>
        {error && <p className="song-dialog-error">{error}</p>}
        <div className="song-dialog-actions">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !title.trim()}>
            {busy ? "Saving…" : submitLabel}
          </Button>
        </div>
      </form>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          pickCover(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </dialog>
  );
}
