import { useRef, useState } from "react";
import type { User } from "firebase/auth";
import type { Song } from "../../songs";
import { useCoverUrl } from "../../songs/cover";
import { readSongFile, type ImportedSong, type SongDetails } from "../../songs/library";
import { Button } from "../../components/Button/Button";
import { SongDialog } from "../../components/SongDialog/SongDialog";
import { SongMenu } from "../../components/SongMenu/SongMenu";
import { GridIcon } from "../../components/Icons/GridIcon";
import { ListIcon } from "../../components/Icons/ListIcon";
import { PencilIcon } from "../../components/Icons/PencilIcon";
import { TrashIcon } from "../../components/Icons/TrashIcon";
import "./HomePage.css";

type Layout = "list" | "grid";

const LAYOUT_KEY = "piano-trainer.song-layout.v1";

function loadLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

function saveLayout(layout: Layout) {
  try {
    localStorage.setItem(LAYOUT_KEY, layout);
  } catch {
    // Not remembering the layout is harmless.
  }
}

interface Props {
  songs: Song[];
  /** The song opened last time, marked in the list. */
  lastSongId: string | null;
  loading: boolean;
  error: string | null;
  user: User | null;
  onOpen: (id: string) => void;
  /** Saves a new song. Throws (with a message for the user) if that fails. */
  onAdd: (song: ImportedSong, details: SongDetails) => Promise<void>;
  /** Changes a song's title or cover. Throws if that fails. */
  onEdit: (id: string, details: SongDetails) => Promise<void>;
  onRemove: (id: string) => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

/** Placeholder colors (cover-tone-N in HomePage.css) for songs without a cover. */
const TONES = 6;

function tone(id: string) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(hash) % TONES;
}

/**
 * A song's square cover, or a colored tile with its initial when it has none.
 * The tile also stands in while a cover loads; the image then fades in over
 * it, unless it was already loaded on the first render.
 */
function SongCover({ song }: { song: Song }) {
  const url = useCoverUrl(song);
  const [instant] = useState(url !== null);
  const [decoded, setDecoded] = useState(false);
  return (
    <span className={`song-cover cover-tone-${tone(song.id)}`} aria-hidden="true">
      {!song.loadCover && song.title.trim().charAt(0).toUpperCase()}
      {url && (
        <img
          className={instant || decoded ? "shown" : undefined}
          src={url}
          alt=""
          width={48}
          height={48}
          decoding="async"
          draggable={false}
          onLoad={() => setDecoded(true)}
        />
      )}
    </span>
  );
}

/** The edit dialog for one of the user's songs, previewing its current cover. */
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
      initialCoverUrl={coverUrl}
      onSubmit={(details) => onEdit(song.id, details)}
      onClose={onClose}
    />
  );
}

/** The start screen: the song list, importing and removing songs, and the account. */
export function HomePage({
  songs,
  lastSongId,
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
  const [adding, setAdding] = useState<{ song: ImportedSong; fileName: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = songs.find((s) => s.id === editingId);
  const [pickError, setPickError] = useState<string | null>(null);
  const [layout, setLayout] = useState(loadLayout);
  const chooseLayout = (next: Layout) => {
    setLayout(next);
    saveLayout(next);
  };

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

  const remove = (song: Song) => {
    if (confirm(`Remove "${song.title}" from your songs?`)) onRemove(song.id);
  };

  const shared = songs.filter((s) => !s.user);
  const own = songs.filter((s) => s.user);

  const list = (items: Song[]) => (
    <ul className={`song-list ${layout}`}>
      {items.map((s) => (
        <li key={s.id} className={s.id === lastSongId ? "last" : undefined}>
          <Button variant="ghost" className="song-open" onClick={() => onOpen(s.id)}>
            <SongCover song={s} />
            <span className="song-text">
              <span className="song-title">{s.title}</span>
              {s.id === lastSongId && (
                <span className="song-badge">Last played</span>
              )}
            </span>
          </Button>
          {s.user && layout === "grid" && (
            <SongMenu
              title={s.title}
              onEdit={() => setEditingId(s.id)}
              onRemove={() => remove(s)}
            />
          )}
          {s.user && layout === "list" && (
            <Button
              variant="ghost"
              icon
              className="song-action"
              onClick={() => setEditingId(s.id)}
              aria-label={`Edit ${s.title}`}
              title="Edit the title or cover"
            >
              <PencilIcon size={18} />
            </Button>
          )}
          {s.user && layout === "list" && (
            <Button
              variant="danger"
              icon
              className="song-action"
              onClick={() => remove(s)}
              aria-label={`Remove ${s.title}`}
              title="Remove this song from your songs"
            >
              <TrashIcon size={18} />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="home">
      <header className="home-header">
        <h1 className="home-logo">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" />
          <span className="visually-hidden">Piano Trainer</span>
        </h1>
        {!loading && (
          <div className="home-account">
            {user ? (
              <>
                <span className="account">
                  {user.displayName ?? user.email}
                </span>
                <Button
                  onClick={onSignOut}
                  title="Your songs stay in your account"
                >
                  Sign out
                </Button>
              </>
            ) : (
              <Button
                onClick={onSignIn}
                title="Keep the songs you load in your Google account, on every device"
              >
                Sign in to sync songs
              </Button>
            )}
          </div>
        )}
      </header>

      <main className="home-body">
        {(pickError ?? error) && <p className="home-error">{pickError ?? error}</p>}
        {loading ? (
          <p className="home-placeholder">Loading songs…</p>
        ) : (
          <>
            <section>
              <div className="home-section-head">
                <h2>Your songs</h2>
                <div className="home-section-tools">
                  <div className="layout-toggle" role="group" aria-label="Song layout">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon
                      active={layout === "list"}
                      aria-pressed={layout === "list"}
                      onClick={() => chooseLayout("list")}
                      aria-label="List"
                      title="Show songs as a list"
                    >
                      <ListIcon size={18} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon
                      active={layout === "grid"}
                      aria-pressed={layout === "grid"}
                      onClick={() => chooseLayout("grid")}
                      aria-label="Grid"
                      title="Show songs as a grid of covers"
                    >
                      <GridIcon size={18} />
                    </Button>
                  </div>
                  {user && (
                    <Button
                      variant="primary"
                      onClick={() => fileInputRef.current?.click()}
                      title="Load a .musicxml, .xml or .mxl file"
                    >
                      Upload song
                    </Button>
                  )}
                </div>
              </div>
              {own.length ? (
                list(own)
              ) : (
                <p className="home-placeholder">
                  {user
                    ? "Songs you load from a MusicXML file appear here."
                    : "Sign in to upload your own songs."}
                </p>
              )}
            </section>
            <section>
              <div className="home-section-head">
                <h2>Library</h2>
              </div>
              {shared.length ? (
                list(shared)
              ) : (
                <p className="home-placeholder">The library is empty.</p>
              )}
            </section>
          </>
        )}
        <p className="build-info">Build {__BUILD_TIME__}</p>
      </main>

      <input
        ref={fileInputRef}
        type="file"
        accept=".musicxml,.xml,.mxl,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml"
        hidden
        onChange={onPickFile}
      />
      {adding && (
        <SongDialog
          heading="Add song"
          submitLabel="Add song"
          initialTitle={adding.song.title}
          initialCoverUrl={null}
          fileName={adding.fileName}
          onSubmit={(details) => onAdd(adding.song, details)}
          onClose={() => setAdding(null)}
        />
      )}
      {editing && (
        <EditSongDialog song={editing} onEdit={onEdit} onClose={() => setEditingId(null)} />
      )}
    </div>
  );
}
