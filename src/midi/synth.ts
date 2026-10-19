/**
 * A tiny Web Audio synth for on-screen key taps and song playback
 * (and later, "play the other hand for me"). Deliberately simple; swap for a
 * sampled piano later.
 */
let ctx: AudioContext | null = null;
const voices = new Map<number, { osc: OscillatorNode; gain: GainNode }>();

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function synthNoteOn(midi: number, velocity = 100) {
  const ac = getCtx();
  synthNoteOff(midi);
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "triangle";
  osc.frequency.value = midiToFreq(midi);
  const peak = 0.25 * (velocity / 127);
  gain.gain.setValueAtTime(0, ac.currentTime);
  gain.gain.linearRampToValueAtTime(peak, ac.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(peak * 0.4, ac.currentTime + 0.4);
  osc.connect(gain).connect(ac.destination);
  osc.start();
  voices.set(midi, { osc, gain });
}

export function synthNoteOff(midi: number) {
  const v = voices.get(midi);
  if (!v || !ctx) return;
  const t = ctx.currentTime;
  v.gain.gain.cancelScheduledValues(t);
  v.gain.gain.setValueAtTime(v.gain.gain.value, t);
  v.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
  v.osc.stop(t + 0.2);
  voices.delete(midi);
}

/*
 * Song playback: notes scheduled ahead on the audio clock so the rhythm stays
 * steady regardless of what the page is doing. Kept apart from the tap voices.
 */
const scheduled = new Set<{ osc: OscillatorNode; gain: GainNode }>();
let playbackBus: GainNode | null = null;

/** The audio clock, in seconds. Times passed to `synthSchedule` use it. */
export function audioNow(): number {
  return getCtx().currentTime;
}

export function synthSchedule(midi: number, when: number, duration: number) {
  const ac = getCtx();
  if (!playbackBus) {
    // Headroom for chords in both hands.
    playbackBus = ac.createGain();
    playbackBus.gain.value = 0.5;
    playbackBus.connect(ac.destination);
  }
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "triangle";
  osc.frequency.value = midiToFreq(midi);
  const peak = 0.25;
  const end = when + Math.max(duration, 0.05);
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(peak, when + 0.01);
  gain.gain.exponentialRampToValueAtTime(
    peak * 0.4,
    Math.min(when + 0.4, end),
  );
  gain.gain.setTargetAtTime(0, end, 0.04);
  osc.connect(gain).connect(playbackBus);
  osc.start(when);
  osc.stop(end + 0.3);
  const voice = { osc, gain };
  scheduled.add(voice);
  osc.onended = () => scheduled.delete(voice);
}

/** Silence every scheduled note, including ones that have not started yet. */
export function synthStopScheduled() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const { osc, gain } of scheduled) {
    gain.gain.cancelScheduledValues(t);
    gain.gain.setTargetAtTime(0, t, 0.02);
    osc.stop(t + 0.1);
  }
  scheduled.clear();
}
