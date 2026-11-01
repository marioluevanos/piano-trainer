import { Button } from "../../components/Button/Button";
import { describeScanProgress, type ScanProgress } from "../../songs/omr";
import type { PendingScan } from "../../songs/pendingScan";
import "./ScanStatus.css";

/** A finished scan waiting to be added as a song, downloaded or thrown away. */
export function PendingScanNotice({
  scan,
  onAdd,
  onDownload,
  onDiscard,
}: {
  scan: PendingScan;
  onAdd: () => void;
  onDownload: () => void;
  onDiscard: () => void;
}) {
  return (
    <p className="home-notice" role="status">
      <span>
        Scanned <strong>{scan.fileName}</strong> is ready to add.
      </span>
      <Button size="sm" variant="primary" onClick={onAdd}>
        Add song
      </Button>
      <Button
        size="sm"
        onClick={onDownload}
        title="Save the scanned score to fix it in MuseScore or Audiveris"
      >
        Download
      </Button>
      <Button size="sm" onClick={onDiscard} title="Throw the scan away">
        Discard
      </Button>
    </p>
  );
}

/** The scanner's live progress on a file, with a way to stop it. */
export function ScanStatus({
  name,
  progress,
  onCancel,
}: {
  name: string;
  progress: ScanProgress;
  onCancel: () => void;
}) {
  const percent = Math.round(progress.value * 100);
  return (
    <div className="home-status" role="status">
      <span className="home-status-text">
        Scanning <strong>{name}</strong>
        <small>{describeScanProgress(progress)}…</small>
      </span>
      <span className="home-status-percent">{percent}%</span>
      <Button size="sm" onClick={onCancel}>
        Cancel
      </Button>
      <span
        className="home-progress"
        role="progressbar"
        aria-label="Scan progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span className="home-progress-fill" style={{ width: `${percent}%` }} />
      </span>
    </div>
  );
}
