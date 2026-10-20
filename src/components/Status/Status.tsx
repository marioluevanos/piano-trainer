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
  currentMeasure,
  measureCount,
  completedSteps,
  wrongNotes,
}: Props) {
  const loopLabel = loop
    ? ` · loop ${loop.startMeasure + 1}–${loop.endMeasure + 1}`
    : "";

  return (
    <section className="status">
      <span>
        {midiMessage(midi)}
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
          ? `Playing…${loopLabel}`
          : finished
            ? "Finished! 🎉"
            : loaded
              ? `Measure ${currentMeasure + 1} / ${measureCount}${loopLabel}`
              : "Loading score…"}
        {" · "}
        {completedSteps} played, {wrongNotes} wrong
      </span>
    </section>
  );
}

function midiMessage(midi: Props["midi"]): string {
  switch (midi.status) {
    case "ready":
      return midi.inputs.length
        ? `MIDI: ${midi.inputs.map((i) => i.name).join(", ")}`
        : "MIDI ready — no keyboard connected";
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
