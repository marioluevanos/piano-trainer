import type { LoopRange } from "../../engine/types";
import type { useMidiInput } from "../../midi/useMidiInput";
import { Button } from "../Button/Button";
import "./Status.css";

interface Props {
  midi: ReturnType<typeof useMidiInput>;
  playing: boolean;
  finished: boolean;
  /** False until the score is ready. */
  loaded: boolean;
  loop: LoopRange | null;
  /** 1-based note numbers the loop starts and ends on, when mid-measure. */
  loopNotes: { start: number | null; end: number | null };
  /** The measure under the cursor, zero-based. */
  currentMeasure: number;
  measureCount: number;
  completedSteps: number;
  wrongNotes: number;
}

/** The bottom status line: MIDI connection on the left, practice progress on the right. */
export function Status({
  midi,
  playing,
  finished,
  loaded,
  loop,
  loopNotes,
  currentMeasure,
  measureCount,
  completedSteps,
  wrongNotes,
}: Props) {
  // A mid-measure end reads "3.2": measure 3, note 2.
  const loopEnd = (measure: number, note: number | null) =>
    note === null ? `${measure + 1}` : `${measure + 1}.${note}`;
  const loopLabel = loop
    ? ` • Loop ${loopEnd(loop.startMeasure, loopNotes.start)}–${loopEnd(loop.endMeasure, loopNotes.end)}`
    : "";

  return (
    <section className="status">
      <span>
        {midiMessage(midi)}{" "}
        {midi.status === "unavailable" && midi.error && (
          <span className="status-error">{midi.error}</span>
        )}
        {(midi.status === "unavailable" || midi.status === "error") && (
          <Button
            className="status-retry"
            size="xs"
            onClick={midi.retry}
            title={midi.error ?? undefined}
          >
            Retry
          </Button>
        )}
      </span>
      <span>
        {playing
          ? `• Playing${loopLabel}`
          : finished
            ? "Finished! 🎉"
            : loaded
              ? `Measure ${currentMeasure + 1} / ${measureCount}${loopLabel}`
              : "Loading score…"}
        {" • "}
        {completedSteps} Played / {wrongNotes} Wrong
      </span>
    </section>
  );
}

function midiMessage(midi: Props["midi"]): string {
  switch (midi.status) {
    case "ready":
      return midi.inputs.length
        ? `MIDI: ${midi.inputs.map((i) => i.name).join(", ")}`
        : "MIDI ready ";
    case "unsupported":
      return "Web MIDI not supported in this browser";
    case "denied":
      return "MIDI access denied";
    case "requesting":
      return "Requesting MIDI access…";
    case "unavailable":
      return "MIDI unavailable on this device — on-screen keys still work";
    case "error":
      return `MIDI error (${midi.error})`;
  }
}
