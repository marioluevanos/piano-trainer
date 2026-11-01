import type { ReactNode } from "react";
import { SongList, SongListSkeleton, type SongListProps } from "./SongList";
import "./SongSection.css";

interface Props extends SongListProps {
  title: string;
  /** Shows stand-ins instead of the list. */
  loading?: boolean;
  /** How many stand-ins to show while loading. */
  skeletonCount?: number;
  /** Shown instead of the list when there are no songs. */
  placeholder?: ReactNode;
  /** Controls at the end of the heading row. */
  tools?: ReactNode;
  /** Shown between the heading and the list. */
  children?: ReactNode;
}

/** A titled song list: a heading row with optional tools, then the songs. */
export function SongSection({
  title,
  loading = false,
  skeletonCount = 3,
  placeholder,
  tools,
  children,
  ...list
}: Props) {
  return (
    <section>
      <div className="home-section-head">
        <h2>{title}</h2>
        {tools && <div className="home-section-tools">{tools}</div>}
      </div>
      {children}
      {loading ? (
        <SongListSkeleton layout={list.layout} count={skeletonCount} />
      ) : list.songs.length ? (
        <SongList {...list} />
      ) : (
        placeholder && <p className="home-placeholder">{placeholder}</p>
      )}
    </section>
  );
}
