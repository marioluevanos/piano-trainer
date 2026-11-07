import { MoreIcon } from "../Icons/MoreIcon";
import { Menu } from "../Menu/Menu";

interface Props {
  title: string;
  /** "overlay" sits over a cover image; "ghost" sits on a plain row. */
  variant: "overlay" | "ghost";
  onEdit: () => void;
  onDownload: () => void;
  onRemove: () => void;
}

/** A "more" button on a song card or row that opens a small menu to edit, download or remove the song. */
export function SongMenu({ title, variant, onEdit, onDownload, onRemove }: Props) {
  return (
    <Menu
      className="song-menu"
      label={title}
      button={{
        variant,
        size: "sm",
        icon: true,
        round: true,
        "aria-label": `More actions for ${title}`,
        title: "More actions",
        children: <MoreIcon />,
      }}
      items={[
        { label: "Edit", onSelect: onEdit },
        { label: "Download", onSelect: onDownload },
        { label: "Delete", onSelect: onRemove, danger: true },
      ]}
    />
  );
}
