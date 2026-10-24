import { secondsAt } from "../band/time.ts";
import type { Section, Track } from "../band/types.ts";

/** One track as the picture hears it: everything in seconds from the top of the track. */
export interface Cues {
  length: number;
  bpm: number;
  sections: (Section & { t: number; end: number })[];
  /** When each chord comes in. */
  chords: number[];
  /** Beats, bar lines. */
  beats: number[];
  bars: number[];
  /** Hats, ride, brushes and shaker: the time the band keeps. */
  hats: number[];
  kicks: number[];
  snares: number[];
  /** The melody, whoever carries it. */
  lead: { t: number; dur: number; midi: number; vel: number }[];
  /** What someone sitting in has played, as it is played: when, and the notes. */
  played: number[];
  sitIn: { t: number; dur: number; midi: number; vel: number }[];
}

export function cues(track: Track): Cues {
  const at = (beat: number) => secondsAt(track, beat);
  const total = track.bars * track.meter;
  const times = (parts: string[]) =>
    [...new Set(track.events.filter((e) => parts.includes(e.part)).map((e) => at(e.beat)))].sort((a, b) => a - b);
  const voiceAt = (beat: number) => track.sections.find((s) => beat >= s.startBar * track.meter && beat < (s.startBar + s.bars) * track.meter)?.voice;
  return {
    length: track.lengthSec,
    bpm: track.bpm,
    sections: track.sections.map((s) => ({ ...s, t: at(s.startBar * track.meter), end: at((s.startBar + s.bars) * track.meter) })),
    chords: track.chords.map((c) => at(c.beat)),
    beats: Array.from({ length: total }, (_, i) => at(i)),
    bars: Array.from({ length: track.bars }, (_, i) => at(i * track.meter)),
    hats: times(["hat", "ride", "brush", "shaker"]),
    kicks: times(["kick"]),
    snares: times(["snare"]),
    lead: track.events
      .filter((e) => e.midi !== undefined && e.part === voiceAt(e.beat))
      .map((e) => ({ t: at(e.beat), dur: secondsAt(track, e.beat + e.dur) - at(e.beat), midi: e.midi!, vel: e.vel }))
      .sort((a, b) => a.t - b.t),
    played: [],
    sitIn: [],
  };
}

/** Adds a note someone sat in with, keeping both lists in time order. */
export function addPlayed(c: Cues, note: Cues["sitIn"][number]) {
  const i = count(c.played, note.t);
  c.played.splice(i, 0, note.t);
  c.sitIn.splice(i, 0, note);
}

export function clearPlayed(c: Cues) {
  c.played.length = 0;
  c.sitIn.length = 0;
}

/** The step the windows are on: a new pattern with every chord, and with every note sat in. */
export const lights = (c: Cues, t: number) => count(c.chords, t) + count(c.played, t);

/** How much the town brightens just after a note sat in (0..1). */
export function glow(c: Cues, t: number): number {
  const i = count(c.played, t);
  let g = 0;
  for (let j = i - 1; j >= 0 && t - c.played[j]! < 2; j--) g = Math.max(g, c.sitIn[j]!.vel * Math.exp(-(t - c.played[j]!) / 0.7));
  return g;
}

/** How many of `times` have happened by `t`. */
export function count(times: number[], t: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Seconds since the last of `times` before `t` (Infinity before the first). */
export function since(times: number[], t: number): number {
  const i = count(times, t);
  return i ? t - times[i - 1]! : Infinity;
}

/** Beats elapsed at `t`, fractional, from the beat grid. */
export function beatAt(c: Cues, t: number): number {
  const i = count(c.beats, t);
  if (i === 0) return 0;
  const a = c.beats[i - 1]!;
  const b = c.beats[i] ?? a + 60 / c.bpm;
  return i - 1 + (t - a) / (b - a);
}
