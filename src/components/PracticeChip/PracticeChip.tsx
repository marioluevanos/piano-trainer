import { useEffect, useState } from "react";
import { formatClock } from "../../practice/activity";
import type { PracticeClock, PracticeTracker } from "../../practice/usePracticeTracker";
import "./PracticeChip.css";

interface Props {
  /** The clock to show; polled once a second while mounted. */
  peek: PracticeTracker["peek"];
}

/**
 * The practice clock on the training page: the session's running time, with
 * a dot that pulses while notes keep the clock running. Nothing is shown
 * before the first note, so the score stays clean when the player is only looking.
 */
export function PracticeChip({ peek }: Props) {
  const [clock, setClock] = useState<PracticeClock>(peek);
  useEffect(() => {
    const timer = setInterval(() => {
      const next = peek();
      setClock((c) =>
        c.active === next.active && c.seconds === next.seconds ? c : next,
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [peek]);

  if (clock.seconds === 0 && !clock.active) return null;
  return (
    <span
      className={clock.active ? "practice-chip active" : "practice-chip"}
      title={clock.active ? "Practicing" : "Paused until the next note"}
    >
      <span className="practice-dot" aria-hidden="true" />
      <span className="visually-hidden">Practiced this session: </span>
      {formatClock(clock.seconds)}
    </span>
  );
}
