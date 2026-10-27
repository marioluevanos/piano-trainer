import { Button } from "../Button/Button";
import { NoteRollIcon } from "../Icons/NoteRollIcon";
import { ScoreIcon } from "../Icons/ScoreIcon";
import { togglePair } from "./togglePair";

const VIEWS = ["score", "roll", "both"] as const;

/** The sheet music, the falling notes, or both. */
export type TrainingView = (typeof VIEWS)[number];

export function parseTrainingView(raw: string): TrainingView | undefined {
  return VIEWS.find((v) => v === raw);
}

interface ViewToggleProps {
  view: TrainingView;
  onChange: (view: TrainingView) => void;
  /** Name each button beside its icon, for a place with room (the settings panel). */
  labeled?: boolean;
}

/**
 * Two toggles, sheet music and falling notes, of which at least one always
 * stays on.
 */
export function ViewToggle({
  view,
  onChange,
  labeled = false,
}: ViewToggleProps) {
  const views = togglePair(view, {
    first: "score",
    second: "roll",
    both: "both",
  });
  return (
    <>
      <Button
        icon={!labeled}
        active={views.firstOn}
        onClick={() => onChange(views.toggled("first"))}
        aria-pressed={views.firstOn}
        aria-label={labeled ? undefined : "Sheet music"}
        title="Show the sheet music"
      >
        <ScoreIcon />
        {labeled && "Sheet music"}
      </Button>
      <Button
        icon={!labeled}
        active={views.secondOn}
        onClick={() => onChange(views.toggled("second"))}
        aria-pressed={views.secondOn}
        aria-label={labeled ? undefined : "Falling notes"}
        title="Show the notes falling onto the keyboard"
      >
        <NoteRollIcon />
        {labeled && "Falling notes"}
      </Button>
    </>
  );
}
