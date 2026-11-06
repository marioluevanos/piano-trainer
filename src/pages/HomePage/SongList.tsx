import { useState } from "react";
import type { User } from "firebase/auth";
import type { Song } from "../../songs";
import { useCoverUrl } from "../../songs/cover";
import { canEditSong } from "../../songs/library";
import { Button } from "../../components/Button/Button";
import { SongMenu } from "../../components/SongMenu/SongMenu";
import type { Layout } from "./LayoutToggle";
import "./SongList.css";
import { cn } from "../../components/utils";

/** Placeholder colors (cover-tone-N in SongList.css) for songs without a cover. */
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
    <span
      className={`song-cover cover-tone-${tone(song.id)}`}
      aria-hidden="true"
    >
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

/** Stand-ins for a song list while it loads, in the chosen layout. */
export function SongListSkeleton({
  layout,
  count,
}: {
  layout: Layout;
  count: number;
}) {
  return (
    <ul className={`song-list ${layout} skeleton`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <span className="song-open">
            <span className="song-cover bone" />
            <span className="song-text">
              <span className="song-title bone">&nbsp;</span>
              <span className="song-artist bone">&nbsp;</span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export interface SongListProps {
  songs: Song[];
  layout: Layout;
  /** The song marked "Last played"; null marks none. */
  lastSongId: string | null;
  /** Decides, with each song, whether its menu is offered. */
  user: User | null;
  onOpen: (id: string) => void;
  onEdit: (song: Song) => void;
  onDownload: (song: Song) => void;
  onRemove: (song: Song) => void;
}

/** Songs to open, each with its cover and, when allowed, its Edit/Download/Remove menu. */
export function SongList({
  songs,
  layout,
  lastSongId,
  user,
  onOpen,
  onEdit,
  onDownload,
  onRemove,
}: SongListProps) {
  return (
    <ul className={`song-list ${layout}`}>
      {songs.map((s) => (
        <li
          key={s.id}
          className={cn(s.id === lastSongId ? "is-recent" : undefined)}
        >
          <Button
            variant="ghost"
            className="song-open"
            onClick={() => onOpen(s.id)}
          >
            <SongCover song={s} />
            <span className="song-text">
              <span className="song-title">{s.title}</span>
              {s.artist && <span className="song-artist">{s.artist}</span>}
              {/* {s.id === lastSongId && (
                <span className="song-badge">Last played</span>
              )} */}
            </span>
          </Button>
          {canEditSong(user, s) && (
            <SongMenu
              title={s.title}
              variant={layout === "grid" ? "overlay" : "ghost"}
              onEdit={() => onEdit(s)}
              onDownload={() => onDownload(s)}
              onRemove={() => onRemove(s)}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
