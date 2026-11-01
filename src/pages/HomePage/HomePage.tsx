import { useRef, useState } from "react";
import type { User } from "firebase/auth";
import type { Song } from "../../songs";
import { useCoverUrl } from "../../songs/cover";
import {
  readSongFile,
  type ImportedSong,
  type SongDetails,
} from "../../songs/library";
import { SCAN_ACCEPT, loadScanOptions } from "../../songs/omr";
import { downloadImported, downloadSong } from "../../songs/download";
import { recentlyPlayed } from "../../songs/recent";
import type { PendingScan } from "../../songs/pendingScan";
import { Button } from "../../components/Button/Button";
import { ScanDialog } from "../../components/ScanDialog/ScanDialog";
import { SongDialog } from "../../components/SongDialog/SongDialog";
import { HomeHeader } from "./HomeHeader";
import {
  LayoutToggle,
  loadLayout,
  saveLayout,
  type Layout,
} from "./LayoutToggle";
import { SongSection } from "./SongSection";
import { PendingScanNotice, ScanStatus } from "./ScanStatus";
import { useScan } from "./useScan";
import "./HomePage.css";

interface Props {
  songs: Song[];
  /** The ids of the songs opened recently, newest first (see songs/recent.ts). */
  recentIds: string[];
  loading: boolean;
  error: string | null;
  user: User | null;
  onOpen: (id: string) => void;
  /** Saves a new song. Throws (with a message for the user) if that fails. */
  onAdd: (song: ImportedSong, details: SongDetails) => Promise<void>;
  /** Changes a song's title, artist or cover. Throws if that fails. */
  onEdit: (song: Song, details: SongDetails) => Promise<void>;
  onRemove: (song: Song) => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

/** The edit dialog for a song, previewing its current cover. */
function EditSongDialog({
  song,
  onEdit,
  onClose,
}: {
  song: Song;
  onEdit: Props["onEdit"];
  onClose: () => void;
}) {
  const coverUrl = useCoverUrl(song);
  return (
    <SongDialog
      heading="Edit song"
      submitLabel="Save"
      initialTitle={song.title}
      initialArtist={song.artist ?? ""}
      initialCoverUrl={coverUrl}
      onSubmit={(details) => onEdit(song, details)}
      onClose={onClose}
    />
  );
}

/** The start screen: the song lists, importing and removing songs, and the account. */
export function HomePage({
  songs,
  recentIds,
  loading,
  error,
  user,
  onOpen,
  onAdd,
  onEdit,
  onRemove,
  onSignIn,
  onSignOut,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  /** A song read from a file (or scanned), waiting in the Add song dialog. */
  const [adding, setAdding] = useState<PendingScan | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = songs.find((s) => s.id === editingId);
  const [pickError, setPickError] = useState<string | null>(null);
  const [layout, setLayout] = useState(loadLayout);
  const chooseLayout = (next: Layout) => {
    setLayout(next);
    saveLayout(next);
  };

  const scan = useScan(user, { onScanned: setAdding, onError: setPickError });
  const { scanning, pending } = scan;

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setAdding({ song: await readSongFile(file), fileName: file.name });
      setPickError(null);
    } catch (err) {
      setPickError(err instanceof Error ? err.message : String(err));
    }
  };

  const onPickScan = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) scan.pickFile(file);
  };

  /** Saves a song; a saved scan is no longer pending. */
  const add = async (song: ImportedSong, details: SongDetails) => {
    await onAdd(song, details);
    scan.saved(song.id);
  };

  /** Saves a score to the device, e.g. to correct a scan in MuseScore or Audiveris. */
  const download = async (job: Promise<void>) => {
    try {
      await job;
    } catch (err) {
      setPickError(err instanceof Error ? err.message : String(err));
    }
  };

  const remove = (song: Song) => {
    const where = song.user ? "your songs" : "the shared library, for everyone";
    if (confirm(`Remove "${song.title}" from ${where}?`)) onRemove(song);
  };

  const shared = songs.filter((s) => !s.user);
  const own = songs.filter((s) => s.user);
  /** The last song opened from each list, shown at the top. */
  const recent = recentlyPlayed(recentIds, songs);
  const showRecent = !loading && recent.length > 0;
  /** The song opened last time, marked in the lists below. */
  const lastSongId = recentIds[0] ?? null;

  /** What every song list needs besides its songs. */
  const listProps = {
    layout,
    user,
    onOpen,
    onEdit: (s: Song) => setEditingId(s.id),
    onDownload: (s: Song) => download(downloadSong(s)),
    onRemove: remove,
  };

  /** The layout toggle and Upload button, in the head of the first section. */
  const tools = (
    <>
      <LayoutToggle layout={layout} onChange={chooseLayout} />
      {/* {canScan(user) && (
        <Button
          onClick={() => scanInputRef.current?.click()}
          disabled={scanning !== null}
          title="Turn a PDF or photo of printed sheet music into a song"
        >
          Scan
        </Button>
      )} */}
      {user && (
        <Button
          variant="primary"
          onClick={() => fileInputRef.current?.click()}
          title="Load a .musicxml, .xml or .mxl file"
        >
          Upload
        </Button>
      )}
    </>
  );

  return (
    <div className="home">
      <HomeHeader
        user={user}
        loading={loading}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
      />

      <main className="home-body">
        {(pickError ?? error) && (
          <p className="home-error">{pickError ?? error}</p>
        )}
        {loading && (
          <p className="visually-hidden" role="status">
            Loading songs…
          </p>
        )}
        {showRecent && (
          <SongSection
            title="Recently played"
            tools={tools}
            songs={recent}
            lastSongId={null}
            {...listProps}
          />
        )}
        <SongSection
          title="Library"
          tools={showRecent ? undefined : tools}
          loading={loading}
          skeletonCount={6}
          songs={shared}
          lastSongId={lastSongId}
          placeholder="The library is empty."
          {...listProps}
        />
        <SongSection
          title="Your songs"
          loading={loading}
          skeletonCount={2}
          songs={own}
          lastSongId={lastSongId}
          placeholder={
            user
              ? "Songs you load from a MusicXML file appear here."
              : "Sign in to upload your own songs."
          }
          {...listProps}
        >
          {pending && !scanning && !adding && (
            <PendingScanNotice
              scan={pending}
              onAdd={() => setAdding(pending)}
              onDownload={() => download(downloadImported(pending.song))}
              onDiscard={scan.discardPending}
            />
          )}
          {scanning && (
            <ScanStatus
              name={scanning.name}
              progress={scanning.progress}
              onCancel={scanning.cancel}
            />
          )}
        </SongSection>
        <p className="build-info">Build {__BUILD_TIME__}</p>
      </main>

      <input
        ref={fileInputRef}
        type="file"
        accept=".musicxml,.xml,.mxl,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml"
        hidden
        onChange={onPickFile}
      />
      <input
        ref={scanInputRef}
        type="file"
        accept={SCAN_ACCEPT}
        hidden
        onChange={onPickScan}
      />
      {scan.scanFile && (
        <ScanDialog
          fileName={scan.scanFile.name}
          initialOptions={loadScanOptions()}
          onScan={scan.start}
          onClose={scan.closeOptions}
        />
      )}
      {adding && (
        <SongDialog
          heading="Add song"
          submitLabel="Add song"
          initialTitle={adding.song.title}
          initialArtist={adding.song.artist ?? ""}
          initialCoverUrl={null}
          fileName={adding.fileName}
          onSubmit={(details) => add(adding.song, details)}
          onClose={() => setAdding(null)}
        />
      )}
      {editing && (
        <EditSongDialog
          song={editing}
          onEdit={onEdit}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}
