import { useEffect, useState } from "react";
import type { useMidiInput } from "../../midi/useMidiInput";
import { Button } from "../Button/Button";
import { CloseIcon } from "../Icons/CloseIcon";
import "./Status.css";

interface Props {
  midi: ReturnType<typeof useMidiInput>;
}

/** How long a status notification stays up before it dismisses itself. */
const DISMISS_AFTER_MS = 7_000;

/**
 * A notification above the toolbar that pops up whenever the MIDI connection
 * status changes and dismisses itself after a while, or when closed.
 */
export function Status({ midi }: Props) {
  const message = midiMessage(midi);
  // Any change to the message or its error counts as a new status.
  const key = `${message}\n${midi.error ?? ""}`;
  const [visible, setVisible] = useState(true);
  const [shownKey, setShownKey] = useState(key);
  if (key !== shownKey) {
    setShownKey(key);
    setVisible(true);
  }

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [key]);

  if (!visible) return null;

  return (
    <section className="status" role="status">
      <span className="status-message">
        {message}{" "}
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
      <Button
        className="status-close"
        variant="ghost"
        size="xs"
        icon
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
        title="Dismiss"
      >
        <CloseIcon size={14} />
      </Button>
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
