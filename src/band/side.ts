import type { Ep, Track } from "./types.ts";

/**
 * Where each track sits on the side. The film is drawn against the same clock the pressing is cut
 * to, so a cut lands on the beat it was written for.
 */

/** Seconds of crackle between tracks. */
export const GAP = 2.5;
/** The run-out groove after the last track. */
export const RUNOUT = 7.2;
/** Before the first note of each track. */
export const LEAD = 0.05;
/** After the crackle, before the next track. */
const PAD = 0.5;

/** How long a track's cut is on the side, crackle and groove included. */
export function cutSeconds(track: Track): number {
  return track.lengthSec + (track.n < 2 ? GAP : RUNOUT) + PAD;
}

/** When each track's first beat falls, in seconds from the needle drop. */
export function trackStarts(ep: Ep): number[] {
  let at = 0;
  return ep.tracks.map((t) => {
    const start = at + LEAD;
    at += cutSeconds(t);
    return start;
  });
}

export function sideSeconds(ep: Ep): number {
  return ep.tracks.reduce((a, t) => a + cutSeconds(t), 0);
}
