import { useCallback, useEffect, useRef, useState } from "react";

export type MidiStatus =
  | "unsupported"
  | "requesting"
  | "ready"
  | "denied"
  /** The browser has Web MIDI but could not start it on this device. */
  | "unavailable"
  | "error";

export interface MidiInputInfo {
  id: string;
  name: string;
}

export interface MidiHandlers {
  onNoteOn: (midi: number, velocity: number) => void;
  onNoteOff: (midi: number) => void;
}

/**
 * Subscribes to every connected Web MIDI input and forwards note on/off.
 * Handlers are read through a ref so callers can pass fresh closures each render.
 */
export function useMidiInput(handlers: MidiHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const [status, setStatus] = useState<MidiStatus>(
    typeof navigator !== "undefined" && "requestMIDIAccess" in navigator
      ? "requesting"
      : "unsupported",
  );
  const [inputs, setInputs] = useState<MidiInputInfo[]>([]);
  /** Name and message of the error requestMIDIAccess rejected with, if any. */
  const [error, setError] = useState<string | null>(null);
  /** Bumped by `retry` to request access again. */
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setStatus("requesting");
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!("requestMIDIAccess" in navigator)) return;
    let access: MIDIAccess | null = null;
    let cancelled = false;

    const onMessage = (ev: MIDIMessageEvent) => {
      const data = ev.data;
      if (!data || data.length < 3) return;
      const cmd = data[0] & 0xf0;
      const note = data[1];
      const vel = data[2];
      if (cmd === 0x90 && vel > 0) handlersRef.current.onNoteOn(note, vel);
      else if (cmd === 0x80 || (cmd === 0x90 && vel === 0))
        handlersRef.current.onNoteOff(note);
    };

    const attach = () => {
      if (!access) return;
      const list: MidiInputInfo[] = [];
      access.inputs.forEach((input) => {
        input.onmidimessage = onMessage;
        list.push({ id: input.id, name: input.name ?? input.id });
      });
      setInputs(list);
    };

    navigator
      .requestMIDIAccess({ sysex: false })
      .then((a) => {
        if (cancelled) return;
        access = a;
        access.onstatechange = attach;
        attach();
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const name =
          err instanceof Error || err instanceof DOMException ? err.name : "";
        const message =
          err instanceof Error || err instanceof DOMException
            ? err.message
            : String(err);
        setError([name, message].filter(Boolean).join(": ") || "unknown");
        // Chrome on Android rejects with InvalidStateError ("Platform dependent
        // initialization failed") when the system MIDI service cannot start.
        setStatus(
          name === "SecurityError" || name === "NotAllowedError"
            ? "denied"
            : name === "InvalidStateError" || name === "NotSupportedError"
              ? "unavailable"
              : "error",
        );
      });

    return () => {
      cancelled = true;
      if (access) {
        access.onstatechange = null;
        access.inputs.forEach((input) => (input.onmidimessage = null));
      }
    };
  }, [attempt]);

  return { status, inputs, error, retry };
}
