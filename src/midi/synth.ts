/**
 * Piano sound for on-screen key taps and song playback. Plays the Salamander
 * Grand Piano samples in public/piano/ (one every three semitones, pitch-shifted
 * to fill the gaps) and falls back to a plain triangle tone until they load.
 */
let ctx: AudioContext | null = null;
let output: AudioNode | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

/** Shared output with a compressor, so chords and ringing notes do not clip. */
function getOutput(ac: AudioContext): AudioNode {
  if (!output) {
    const gain = ac.createGain();
    gain.gain.value = 0.8;
    const compressor = ac.createDynamicsCompressor();
    gain.connect(compressor).connect(ac.destination);
    output = gain;
  }
  return output;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/* ---------- Samples ---------- */

/** File names for A0, then C, D#, F#, A in octaves 1-7, then C8. */
function sampleFiles(): { midi: number; file: string }[] {
  const files = [{ midi: 21, file: "A0" }];
  for (let octave = 1; octave <= 7; octave++) {
    const c = 12 * (octave + 1);
    files.push(
      { midi: c, file: `C${octave}` },
      { midi: c + 3, file: `Ds${octave}` },
      { midi: c + 6, file: `Fs${octave}` },
      { midi: c + 9, file: `A${octave}` },
    );
  }
  files.push({ midi: 108, file: "C8" });
  return files;
}

const samples = new Map<number, AudioBuffer>();
let loading: Promise<void> | null = null;

/**
 * Fetch and decode the piano samples. Safe to call repeatedly. Decoding uses an
 * offline context so no live AudioContext is created before a user gesture.
 */
export function loadPiano(): Promise<void> {
  if (!loading) {
    const decoder = new OfflineAudioContext(1, 1, 44100);
    loading = Promise.all(
      sampleFiles().map(async ({ midi, file }) => {
        const res = await fetch(`piano/${file}.mp3`);
        if (!res.ok) throw new Error(`${file}.mp3: HTTP ${res.status}`);
        samples.set(midi, await decoder.decodeAudioData(await res.arrayBuffer()));
      }),
    )
      .then(() => undefined)
      .catch((err: unknown) => {
        console.warn("Some piano samples failed to load.", err);
      });
  }
  return loading;
}

function nearestSample(midi: number): { midi: number; buffer: AudioBuffer } | null {
  let best: { midi: number; buffer: AudioBuffer } | null = null;
  for (const [sampleMidi, buffer] of samples) {
    if (!best || Math.abs(sampleMidi - midi) < Math.abs(best.midi - midi)) {
      best = { midi: sampleMidi, buffer };
    }
  }
  return best;
}

/* ---------- Voices ---------- */

interface Voice {
  source: AudioScheduledSourceNode;
  gain: GainNode;
  /** Audio-clock time the note starts. */
  start: number;
}

/** Time constant of the damper release, in seconds. */
const RELEASE = 0.08;

function startVoice(midi: number, when: number, velocity: number): Voice {
  const ac = getCtx();
  const gain = ac.createGain();
  const level = velocity / 127;
  const sample = nearestSample(midi);
  let source: AudioScheduledSourceNode;

  if (sample) {
    const buffer = ac.createBufferSource();
    buffer.buffer = sample.buffer;
    buffer.playbackRate.value = Math.pow(2, (midi - sample.midi) / 12);
    gain.gain.setValueAtTime(level, when);
    source = buffer;
  } else {
    const osc = ac.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = midiToFreq(midi);
    const peak = 0.25 * level;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(peak, when + 0.01);
    gain.gain.setTargetAtTime(peak * 0.4, when + 0.01, 0.15);
    source = osc;
  }

  source.connect(gain).connect(getOutput(ac));
  source.start(when);
  return { source, gain, start: when };
}

function releaseVoice({ source, gain }: Voice, when: number) {
  gain.gain.setTargetAtTime(0, when, RELEASE);
  source.stop(when + RELEASE * 8);
}

/** Release a voice right now, overriding whatever it had scheduled. */
function silenceVoice(voice: Voice) {
  const t = getCtx().currentTime;
  if (voice.start > t) {
    voice.source.stop(); // not started yet: it never sounds
    return;
  }
  const g = voice.gain.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  releaseVoice(voice, t);
}

/* ---------- On-screen key taps ---------- */

const held = new Map<number, Voice>();

export function synthNoteOn(midi: number, velocity = 100) {
  void loadPiano();
  synthNoteOff(midi);
  held.set(midi, startVoice(midi, getCtx().currentTime, velocity));
}

export function synthNoteOff(midi: number) {
  const voice = held.get(midi);
  if (!voice) return;
  silenceVoice(voice);
  held.delete(midi);
}

/*
 * Song playback: notes scheduled ahead on the audio clock so the rhythm stays
 * steady regardless of what the page is doing. Kept apart from the tap voices.
 */
const scheduled = new Set<Voice>();

/** The audio clock, in seconds. Times passed to `synthSchedule` use it. */
export function audioNow(): number {
  return getCtx().currentTime;
}

export function synthSchedule(midi: number, when: number, duration: number) {
  const voice = startVoice(midi, when, 90);
  releaseVoice(voice, when + Math.max(duration, 0.05));
  scheduled.add(voice);
  voice.source.onended = () => scheduled.delete(voice);
}

/** Silence every scheduled note, including ones that have not started yet. */
export function synthStopScheduled() {
  for (const voice of scheduled) silenceVoice(voice);
  scheduled.clear();
}
