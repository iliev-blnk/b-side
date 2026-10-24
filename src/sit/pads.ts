import { chordAt, scalePcs } from "../band/chords.ts";
import { secondsAt } from "../band/time.ts";
import { RANGES, TESSITURA, type Track } from "../band/types.ts";
import type { Midi } from "../music/theory.ts";

/**
 * Sitting in: nine pads that play the band's horn in the tune's key. The pads are tuned to the
 * pentatonic, low to high, and each note is bent onto the chord it lands on, so nothing played
 * can clash. Time is forgiving: a note goes to the nearest step of the band's swung sixteenths.
 */

export const PADS = 9;
/** The home row, left to right, low to high. */
export const KEYS = ["a", "s", "d", "f", "g", "h", "j", "k", "l"];

const PENTA = { minor: [0, 3, 5, 7, 10], major: [0, 2, 4, 7, 9] };

/**
 * The pads' pitches before any chord is taken into account: nine notes of the pentatonic in a
 * row, starting on whichever note puts them where the horn can play them and is most at home.
 */
export function tuning(track: Track): Midi[] {
  const steps = track.minor ? PENTA.minor : PENTA.major;
  const [lo, hi] = TESSITURA[track.band.lead];
  const [floor, ceil] = RANGES[track.band.lead];
  const tonic = lo - 24 + ((track.key - lo + 1200) % 12);
  const scale = Array.from({ length: 5 * 6 }, (_, i) => tonic + steps[i % 5]! + 12 * Math.floor(i / 5));
  const spill = (ps: Midi[], a: Midi, b: Midi) => Math.max(0, a - ps[0]!) + Math.max(0, ps.at(-1)! - b);
  // out of reach costs most, then out of comfort, then not starting on the tonic
  const cost = (ps: Midi[], i: number) => 100 * spill(ps, floor, ceil) + 4 * spill(ps, lo, hi) + (i % 5 ? 1 : 0);
  let best: Midi[] = [];
  let bestCost = Infinity;
  for (let i = 0; i + PADS <= scale.length; i++) {
    const ps = scale.slice(i, i + PADS);
    const c = cost(ps, i);
    if (c < bestCost) [best, bestCost] = [ps, c];
  }
  return best;
}

/**
 * What pad `pad` sounds at `beat`: its pitch, moved by a semitone if the chord there would rub,
 * never out of the horn's reach.
 */
export function padPitch(track: Track, pad: number, beat: number): Midi {
  const p = tuning(track)[pad]!;
  const [floor, ceil] = RANGES[track.band.lead];
  const scale = scalePcs(chordAt(track.chords, beat), track.mood === "sad");
  const ok = (m: Midi) => m >= floor && m <= ceil && scale.includes(((m % 12) + 12) % 12);
  if (ok(p)) return p;
  if (ok(p - 1)) return p - 1;
  if (ok(p + 1)) return p + 1;
  return ok(p - 2) ? p - 2 : p + 2;
}

/** Sixteenths in the track, ring-out excluded. */
export const stepsOf = (track: Track) => track.bars * track.meter * 4;

/** Seconds from the top of the track to sixteenth `step`, swung. */
export const stepTime = (track: Track, step: number) => secondsAt(track, step / 4);

/** The step nearest `t` seconds into the track. */
export function nearestStep(track: Track, t: number): number {
  let lo = 0;
  let hi = stepsOf(track);
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (stepTime(track, mid) < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && t - stepTime(track, lo - 1) < stepTime(track, lo) - t) return lo - 1;
  return lo;
}
