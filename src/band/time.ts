import type { Ending, Section } from "./types.ts";

/** What a clock needs from a track. */
export interface Clock {
  bpm: number;
  swing: number;
  meter: 3 | 4;
  ending: Ending;
  sections: Section[];
}

/** Moves off-8ths to the swing point, MPC-style. Beats on thirds are triplets and stay as written. */
export function swingBeat(beat: number, swing: number): number {
  const whole = Math.floor(beat);
  const f = beat - whole;
  const third = f * 3;
  if (Math.abs(third - Math.round(third)) < 1e-6 && Math.abs(f - 0.5) > 1e-6 && f > 1e-6) return beat;
  return whole + (f < 0.5 ? f * (swing / 0.5) : swing + (f - 0.5) * ((1 - swing) / 0.5));
}

/** The band slows into a fermata, and a little into a tag's last turnaround. */
function ritardando(c: Clock): { from: number; to: number; amount: number } | null {
  const end = c.sections.at(-1)!;
  const top = end.startBar * c.meter;
  if (c.ending === "fermata") return { from: top - 2 * c.meter, to: top, amount: 0.35 };
  if (c.ending === "tag") return { from: top + (end.bars - 4) * c.meter, to: top + (end.bars - 2) * c.meter, amount: 0.2 };
  return null;
}

/** Seconds from the top of the track to a (straight-time) beat, with swing and the ending's slowdown. */
export function secondsAt(c: Clock, beat: number, swung = true): number {
  const spb = 60 / c.bpm;
  const b = swung ? swingBeat(beat, c.swing) : beat;
  const rit = ritardando(c);
  if (!rit || b <= rit.from) return b * spb;
  // the beat stretches linearly from 1x to (1 + amount)x across the rit, then stays there
  const len = rit.to - rit.from;
  const x = Math.min(b, rit.to) - rit.from;
  const inRit = x + (rit.amount * x * x) / (2 * len);
  const after = Math.max(0, b - rit.to) * (1 + rit.amount);
  return (rit.from + inRit + after) * spb;
}

/** Seconds per beat at a beat (for note lengths). */
export function spbAt(c: Clock, beat: number): number {
  const spb = 60 / c.bpm;
  const rit = ritardando(c);
  if (!rit || beat <= rit.from) return spb;
  return spb * (1 + rit.amount * Math.min(1, (beat - rit.from) / (rit.to - rit.from)));
}
