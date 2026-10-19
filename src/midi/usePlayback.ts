import { useCallback, useEffect, useRef, useState } from "react";
import {
  planPlayback,
  stepAtTime,
  type PlaybackOptions,
} from "../engine/playback";
import type { Step } from "../engine/types";
import { audioNow, synthSchedule, synthStopScheduled } from "./synth";

/** Seconds of audio scheduled ahead of the clock. */
const LOOKAHEAD = 0.2;
const TICK_MS = 25;
/** Delay before the first note so it is not clipped. */
const LEAD_IN = 0.1;

interface UsePlaybackOptions {
  /** Called whenever playback reaches a new step. */
  onStep: (stepIndex: number) => void;
  /** Called when playback reaches the end of the piece (never while looping). */
  onEnd: () => void;
}

/**
 * Plays the score through the synth. A timer schedules notes a little ahead
 * on the audio clock and reports the step under the playhead.
 */
export function usePlayback({ onStep, onEnd }: UsePlaybackOptions) {
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<number | null>(null);
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    synthStopScheduled();
    setPlaying(false);
  }, []);

  const play = useCallback(
    (steps: Step[], from: number, opts: PlaybackOptions) => {
      stop();
      const plan = planPlayback(steps, from, opts);
      if (plan.events.length === 0 || plan.length <= 0) return;

      // Pass k through the range starts at origin + k * plan.length on the audio clock.
      const origin = audioNow() + LEAD_IN - plan.startOffset;
      let pass = 0;
      let next = plan.events.findIndex((e) => e.time >= plan.startOffset);
      if (next < 0) next = plan.events.length;
      let shownStep = -1;

      const tick = () => {
        const now = audioNow();

        while (true) {
          if (next >= plan.events.length) {
            if (!plan.repeat) break;
            pass++;
            next = 0;
          }
          const event = plan.events[next];
          const at = origin + pass * plan.length + event.time;
          if (at > now + LOOKAHEAD) break;
          for (const n of event.notes) synthSchedule(n.midi, at, n.duration);
          next++;
        }

        const elapsed = Math.max(now - origin, plan.startOffset);
        if (!plan.repeat && elapsed >= plan.length) {
          stop();
          onEndRef.current();
          return;
        }
        const inPass = plan.repeat ? elapsed % plan.length : elapsed;
        const step = stepAtTime(plan, inPass);
        if (step >= 0 && step !== shownStep) {
          shownStep = step;
          onStepRef.current(step);
        }
      };

      timerRef.current = window.setInterval(tick, TICK_MS);
      setPlaying(true);
      tick();
    },
    [stop],
  );

  useEffect(() => stop, [stop]);

  return { playing, play, stop };
}
