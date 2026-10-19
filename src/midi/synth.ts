/**
 * A tiny Web Audio synth so the on-screen keyboard (and later, "play the other
 * hand for me") makes sound. Deliberately simple; swap for a sampled piano later.
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
