import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { readSongFile } from "../../songs/library";
import {
  saveScanOptions,
  scanSheetMusic,
  type ScanOptions,
  type ScanProgress,
} from "../../songs/omr";
import {
  clearPendingScan,
  loadPendingScan,
  savePendingScan,
  type PendingScan,
} from "../../songs/pendingScan";

interface Job {
  name: string;
  abort: AbortController;
  progress: ScanProgress;
}

interface Callbacks {
  /** A scan finished; it is also kept as the pending scan. */
  onScanned: (scan: PendingScan) => void;
  onError: (message: string) => void;
}

/**
 * Scanning sheet music into a song: the picked file waiting in the options
 * dialog, the scan in progress, and the finished scan kept (also across
 * reloads) until it is saved or discarded. Leaving the page stops a scan.
 */
export function useScan(user: User | null, { onScanned, onError }: Callbacks) {
  /** A picked PDF or image waiting in the scan options dialog. */
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const abort = job?.abort;
  useEffect(() => () => abort?.abort(), [abort]);
  const [pending, setPending] = useState<PendingScan | null>(loadPendingScan);

  const discardPending = () => {
    clearPendingScan();
    setPending(null);
  };

  /** Scans the picked file with the chosen options. */
  const start = async (options: ScanOptions) => {
    const file = scanFile;
    setScanFile(null);
    if (!file || !user) return;
    saveScanOptions(options);
    const abort = new AbortController();
    setJob({ name: file.name, abort, progress: { value: 0 } });
    try {
      const mxl = await scanSheetMusic(
        file,
        user,
        options,
        abort.signal,
        (progress) =>
          setJob((j) => (j && j.abort === abort ? { ...j, progress } : j)),
      );
      const scan = { song: await readSongFile(mxl), fileName: file.name };
      savePendingScan(scan);
      setPending(scan);
      onScanned(scan);
    } catch (err) {
      if (!abort.signal.aborted)
        onError(err instanceof Error ? err.message : String(err));
    } finally {
      setJob(null);
    }
  };

  return {
    scanFile,
    pickFile: setScanFile,
    closeOptions: () => setScanFile(null),
    start,
    /** The scan in progress, if any. */
    scanning: job && {
      name: job.name,
      progress: job.progress,
      cancel: () => job.abort.abort(),
    },
    pending,
    discardPending,
    /** Once the pending scan is saved as a song it is no longer pending. */
    saved(songId: string) {
      if (pending?.song.id === songId) discardPending();
    },
  };
}
