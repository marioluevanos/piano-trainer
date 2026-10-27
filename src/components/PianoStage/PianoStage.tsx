import { useMemo, type ReactNode } from "react";
import { keyboardViewBox, layoutKeys } from "../Keyboard/keys";
import "./PianoStage.css";

interface PianoStageProps {
  /** The keyboard's range. */
  range: [number, number];
  /** Whether the keyboard reserves room for note names above the keys. */
  labeled: boolean;
  children: ReactNode;
}

/**
 * The keyboard and whatever stacks above it (the note roll), at one shared
 * width: as wide as the keyboard can be without passing its height limit, so
 * the keys never letterbox and columns drawn above them line up with the keys.
 */
export function PianoStage({ range, labeled, children }: PianoStageProps) {
  const aspect = useMemo(() => {
    const box = keyboardViewBox(layoutKeys(range), labeled);
    return box.width / box.height;
  }, [range, labeled]);
  return (
    <div
      className="piano-stage"
      style={{ maxWidth: `calc(var(--keyboard-max-height) * ${aspect})` }}
    >
      {children}
    </div>
  );
}
