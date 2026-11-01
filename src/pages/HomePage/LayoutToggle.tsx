import { Button } from "../../components/Button/Button";
import { GridIcon } from "../../components/Icons/GridIcon";
import { ListIcon } from "../../components/Icons/ListIcon";
import "./LayoutToggle.css";

/** How the song lists are drawn: rows, or a grid of covers. */
export type Layout = "list" | "grid";

const LAYOUT_KEY = "piano-trainer.song-layout.v1";

export function loadLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

export function saveLayout(layout: Layout) {
  try {
    localStorage.setItem(LAYOUT_KEY, layout);
  } catch {
    // Not remembering the layout is harmless.
  }
}

/** The list / grid switch for the song lists. */
export function LayoutToggle({
  layout,
  onChange,
}: {
  layout: Layout;
  onChange: (layout: Layout) => void;
}) {
  return (
    <div className="layout-toggle" role="group" aria-label="Song layout">
      <Button
        variant="ghost"
        size="sm"
        icon
        active={layout === "list"}
        aria-pressed={layout === "list"}
        onClick={() => onChange("list")}
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
        onClick={() => onChange("grid")}
        aria-label="Grid"
        title="Show songs as a grid of covers"
      >
        <GridIcon size={18} />
      </Button>
    </div>
  );
}
