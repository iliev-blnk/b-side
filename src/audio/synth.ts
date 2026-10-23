import { rng } from "../music/rng.ts";

function normalize(data: Float32Array, peak: number) {
  let max = 0;
  for (const v of data) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < data.length; i++) data[i] = (data[i]! / max) * peak;
}

/** A soft, round boom-bap kick: a sine dropping 110 → 45 Hz with a little click, gently clipped. */
export function kickBuffer(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, Math.floor(sr * 0.6), sr);
  const d = buf.getChannelData(0);
  const noise = rng("kick");
  let phase = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const f = 45 + 65 * Math.exp(-t * 28);
    phase += (2 * Math.PI * f) / sr;
    const body = Math.sin(phase) * Math.exp(-t * 6.5);
    const click = t < 0.004 ? (noise.next() * 2 - 1) * 0.25 * (1 - t / 0.004) : 0;
    d[i] = Math.tanh(1.8 * (body + click));
  }
  normalize(d, 0.95);
  return buf;
}

/**
 * An upright-ish bass note: Karplus–Strong string plucked with a soft (low-passed) noise burst,
 * a sine fundamental under it for weight, then a dark one-pole filter.
 */
export function bassBuffer(ctx: BaseAudioContext, midi: number, seconds: number, seed: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const f0 = 440 * 2 ** ((midi - 69) / 12);
  const len = Math.floor(sr * (seconds + 0.12));
  const buf = ctx.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);
  const r = rng(`bass/${seed}/${midi}`);
  const period = sr / f0;
  const n = Math.floor(period);
  const frac = period - n;
  const line = new Float32Array(n + 2);
  // soft pluck: smoothed noise
  let s = 0;
  for (let i = 0; i < line.length; i++) {
    s += 0.35 * (r.next() * 2 - 1 - s);
    line[i] = s;
  }
  const decay = 0.9965 - Math.max(0, midi - 40) * 0.0004;
  let idx = 0;
  let lp = 0;
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const a = line[idx]!;
    const b = line[(idx + 1) % line.length]!;
    const v = a * (1 - frac) + b * frac;
    line[idx] = decay * 0.5 * (a + b);
    idx = (idx + 1) % line.length;
    const t = i / sr;
    phase += (2 * Math.PI * f0) / sr;
    const sub = Math.sin(phase) * Math.exp(-t * 2.2) * 0.6;
    lp += 0.12 * (v + sub - lp);
    // gate: short attack, release over the last 120 ms
    const att = Math.min(1, t / 0.004);
    const rel = t > seconds ? Math.max(0, 1 - (t - seconds) / 0.12) : 1;
    out[i] = lp * att * rel;
  }
  normalize(out, 0.8);
  return buf;
}

/** Vinyl surface: occasional pops, a bed of small ticks and a little hiss. */
export function crackleBuffer(ctx: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  const r = rng(`crackle/${seed}`);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let hiss = 0;
    for (let i = 0; i < len; i++) {
      hiss += 0.2 * (r.next() * 2 - 1 - hiss);
      d[i] = hiss * 0.02;
    }
    const ticks = Math.floor(seconds * 45);
    for (let k = 0; k < ticks; k++) {
      const at = Math.floor(r.next() * len);
      const big = r.chance(0.08);
      const amp = big ? r.range(0.5, 1) : r.range(0.05, 0.25);
      const width = Math.floor(sr * (big ? 0.002 : 0.0006));
      for (let j = 0; j < width * 4 && at + j < len; j++) {
        d[at + j] = d[at + j]! + amp * Math.exp(-j / width) * (r.next() * 2 - 1);
      }
    }
    for (let i = 0; i < len; i++) d[i] = Math.max(-1, Math.min(1, d[i]!));
  }
  return buf;
}

/**
 * Brushes: a sweep is noise swished across the head (it swells and fades over most of a second,
 * bright in the middle); a tap is a short, dry slap.
 */
export function brushBuffer(ctx: BaseAudioContext, kind: "sweep" | "tap"): AudioBuffer {
  const sr = ctx.sampleRate;
  const seconds = kind === "sweep" ? 0.7 : 0.18;
  const buf = ctx.createBuffer(1, Math.floor(sr * seconds), sr);
  const d = buf.getChannelData(0);
  const r = rng(`brush/${kind}`);
  let lp = 0;
  let hp = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const n = r.next() * 2 - 1;
    if (kind === "sweep") {
      const env = Math.sin(Math.PI * Math.min(1, t / seconds)) ** 1.5;
      const bright = 0.25 + 0.5 * env;
      lp += bright * (n - lp);
      hp += 0.02 * (lp - hp);
      d[i] = (lp - hp) * env;
    } else {
      lp += 0.5 * (n - lp);
      hp += 0.05 * (lp - hp);
      d[i] = (lp - hp) * Math.exp(-t * 38) + Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 60) * 0.3;
    }
  }
  normalize(d, 0.7);
  return buf;
}
