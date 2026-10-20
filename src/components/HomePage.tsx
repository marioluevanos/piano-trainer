import { useRef } from "react";
import type { User } from "firebase/auth";
import type { Song } from "../songs";

interface Props {
  songs: Song[];
  /** The song opened last time, marked in the list. */
  lastSongId: string | null;
  loading: boolean;
  error: string | null;
  user: User | null;
  onOpen: (id: string) => void;
  onAdd: (file: File) => void;
  onRemove: (id: string) => void;
  onSignIn: () => void;
  onSignOut: () => void;
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
  onRemove,
  onSignIn,
  onSignOut,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onAdd(file);
  };

  const remove = (song: Song) => {
    if (confirm(`Remove "${song.title}" from your songs?`)) onRemove(song.id);
  };

  const shared = songs.filter((s) => !s.user);
  const own = songs.filter((s) => s.user);

  const list = (items: Song[]) => (
    <ul className="song-list">
      {items.map((s) => (
        <li key={s.id} className={s.id === lastSongId ? "last" : undefined}>
          <button className="song-open" onClick={() => onOpen(s.id)}>
            <span className="song-title">{s.title}</span>
            {s.id === lastSongId && (
              <span className="song-badge">Last played</span>
            )}
          </button>
          {s.user && (
            <button
              className="song-remove"
              onClick={() => remove(s)}
              aria-label={`Remove ${s.title}`}
              title="Remove this song from your songs"
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M9 3v1H4v2h16V4h-5V3H9ZM6 8l1 13h10l1-13H6Zm4 2h1v9h-1v-9Zm3 0h1v9h-1v-9Z"
                />
              </svg>
            </button>
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
                <button
                  onClick={onSignOut}
                  title="Your songs stay in your account"
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                onClick={onSignIn}
                title="Keep the songs you load in your Google account, on every device"
              >
                Sign in to sync songs
              </button>
            )}
          </div>
        )}
      </header>

      <main className="home-body">
        {error && <p className="home-error">{error}</p>}
        {loading ? (
          <p className="home-placeholder">Loading songs…</p>
        ) : (
          <>
            <section>
              <div className="home-section-head">
                <h2>Your songs</h2>
                {user && (
                  <button
                    className="primary"
                    onClick={() => fileInputRef.current?.click()}
                    title="Load a .musicxml, .xml or .mxl file"
                  >
                    Upload song
                  </button>
                )}
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
    </div>
  );
}
