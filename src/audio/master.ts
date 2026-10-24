import type { Mood } from "../band/types.ts";
import { rng } from "../music/rng.ts";

export interface Master {
  /** Everything the band plays. */
  input: AudioNode;
  /** Vinyl crackle joins after the tone shaping, so it stays crisp. */
  crackle: AudioNode;
  output: AudioNode;
  /** A lowpass at the very front, for filtered intros and breakdowns (wide open by default). */
  filter: BiquadFilterNode;
  /** After the compressor: fades and the tape stop pull this down. */
  fader: GainNode;
  /** The room's return, and the tone lowpass, with where they sit as written (the room knob moves them). */
  wet: GainNode;
  tone: BiquadFilterNode;
  base: { wet: number; cutoff: number };
}

export interface Room {
  seconds: number;
  wet: number;
}

const CUTOFF: Record<Mood, number> = { noir: 5000, chase: 7000, sad: 4200 };
const CRACKLE_DB: Record<Mood, number> = { noir: -30, chase: -32, sad: -27 };

function roomIR(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  const r = rng("room");
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      // darker as it decays, like a small wooden room
      lp += (0.6 - 0.45 * (t / seconds)) * (r.next() * 2 - 1 - lp);
      d[i] = lp * Math.exp(-t * (6.9 / seconds));
    }
  }
  return buf;
}

function tapeCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(n);
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / norm;
  }
  return curve;
}

/**
 * bus → section filter → lowpass → tape saturation → wow/flutter → room → compressor → fader → output.
 * Built from standard nodes, so it runs the same in an OfflineAudioContext. Each style plays in its
 * own room: a dry booth for boom-bap, a long hall for the ballad.
 */
export function createMaster(ctx: BaseAudioContext, mood: Mood, space: Room = { seconds: 1.6, wet: 0.18 }): Master {
  const input = ctx.createGain();
  input.gain.value = 0.7;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 20000;
  filter.Q.value = 0.9;

  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 32;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = CUTOFF[mood];
  lowpass.Q.value = 0.7;

  const sat = ctx.createWaveShaper();
  sat.curve = tapeCurve(1.6);
  sat.oversample = "2x";

  const wow = ctx.createDelay(0.05);
  wow.delayTime.value = 0.008;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.6;
  const depth = ctx.createGain();
  depth.gain.value = 0.0006;
  lfo.connect(depth).connect(wow.delayTime);
  lfo.start();

  const room = ctx.createConvolver();
  room.buffer = roomIR(ctx, space.seconds);
  const wet = ctx.createGain();
  wet.gain.value = space.wet;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;

  const crackle = ctx.createGain();
  crackle.gain.value = 10 ** (CRACKLE_DB[mood] / 20);

  const fader = ctx.createGain();
  const output = ctx.createGain();
  output.gain.value = 0.8;

  input.connect(filter).connect(highpass).connect(lowpass).connect(sat).connect(wow);
  wow.connect(comp);
  wow.connect(room).connect(wet).connect(comp);
  comp.connect(fader).connect(output);
  crackle.connect(output);
  return { input, crackle, output, filter, fader, wet, tone: lowpass, base: { wet: space.wet, cutoff: CUTOFF[mood] } };
}
