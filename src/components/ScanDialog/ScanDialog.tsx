import { useEffect, useRef, useState } from "react";
import { SCAN_FONTS, type ScanOptions } from "../../songs/omr";
import { Button } from "../Button/Button";
import "../SongDialog/SongDialog.css";
import "./ScanDialog.css";

interface Props {
  /** The PDF or image about to be scanned. */
  fileName: string;
  initialOptions: ScanOptions;
  onScan: (options: ScanOptions) => void;
  onClose: () => void;
}

const FONT_LABELS: Record<ScanOptions["font"], string> = {
  Bravura: "Bravura (Dorico, most publishers)",
  Leland: "Leland (MuseScore)",
  Primus: "Primus (Primus / older engravings)",
  FinaleJazz: "Finale Jazz (handwritten-look jazz charts)",
  JazzPerc: "Jazz Perc (jazz percussion)",
};

const ITEMS: { key: keyof ScanOptions; label: string; hint?: string }[] = [
  { key: "lyrics", label: "Lyrics" },
  { key: "dynamics", label: "Dynamics (p, f, crescendo…)" },
  { key: "articulations", label: "Articulations (staccato, accents…)" },
  { key: "chordNames", label: "Chord names (Am7, G/B…)" },
  { key: "fingerings", label: "Fingering digits" },
  { key: "smallHeads", label: "Small (cue) note heads", hint: "can misread ordinary notes" },
  { key: "implicitTuplets", label: "Triplets without a “3”" },
];

/** A modal shown before a scan: how the engine should read this particular score. */
export function ScanDialog({ fileName, initialOptions, onScan, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [options, setOptions] = useState(initialOptions);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const set = <K extends keyof ScanOptions>(key: K, value: ScanOptions[K]) =>
    setOptions((o) => ({ ...o, [key]: value }));

  return (
    <dialog
      ref={dialogRef}
      className="song-dialog scan-dialog"
      aria-labelledby="scan-dialog-heading"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onScan(options);
        }}
      >
        <h2 id="scan-dialog-heading">Scan sheet music</h2>
        <p className="song-dialog-file">{fileName}</p>

        <fieldset className="scan-fieldset">
          <legend>Image quality</legend>
          <label className="scan-choice">
            <input
              type="radio"
              name="quality"
              checked={options.quality === "standard"}
              onChange={() => set("quality", "standard")}
            />
            <span>
              Standard
              <small>A PDF from notation software or a clean scan</small>
            </span>
          </label>
          <label className="scan-choice">
            <input
              type="radio"
              name="quality"
              checked={options.quality === "poor"}
              onChange={() => set("quality", "poor")}
            />
            <span>
              Poor
              <small>A photo, a photocopy or a rough scan</small>
            </span>
          </label>
        </fieldset>

        <label className="scan-field">
          Music font of the edition
          <select value={options.font} onChange={(e) => set("font", e.target.value as ScanOptions["font"])}>
            {SCAN_FONTS.map((font) => (
              <option key={font} value={font}>
                {FONT_LABELS[font]}
              </option>
            ))}
          </select>
          <small>Note heads are matched against this font. If unsure, keep Bravura.</small>
        </label>

        <fieldset className="scan-fieldset">
          <legend>Look for</legend>
          {ITEMS.map(({ key, label, hint }) => (
            <label key={key} className="scan-choice">
              <input
                type="checkbox"
                checked={options[key] as boolean}
                onChange={(e) => set(key, e.target.checked as ScanOptions[typeof key])}
              />
              <span>
                {label}
                {hint && <small>{hint}</small>}
              </span>
            </label>
          ))}
          <p className="song-dialog-hint">
            Turn off what the piece does not have, so stray marks are not forced into those categories.
          </p>
        </fieldset>

        <div className="song-dialog-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Scan
          </Button>
        </div>
      </form>
    </dialog>
  );
}
