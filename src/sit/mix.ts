import type { Part, Track } from "../band/types.ts";

/**
 * The two knobs. Intensity thins the band out or leans on it: the melody, bass, kick and snare
 * always play; the time (hats, ride, shaker) goes last, the comping before it, the colour (hand
 * drums, bells) first. Past the middle the drums and comping are pushed. The room knob opens the
 * room from dry to smoky and darkens the tone with it. Both sit at 0.5 as the record was written.
 */

type Role = "core" | "time" | "comp" | "colour";

const TIME = new Set<Part>(["hat", "ride", "shaker"]);
const COLOUR = new Set<Part>(["conga", "bongo", "clave", "marimba", "glock", "tom"]);
const DRUMS = new Set<Part>(["kick", "snare", "brush", "crash"]);

export function role(track: Track, part: Part): Role {
  if (track.sections.some((s) => s.voice === part) || part === track.band.lead || part === track.band.second) return "core";
  if (part === "bass" || DRUMS.has(part)) return "core";
  if (TIME.has(part)) return "time";
  if (COLOUR.has(part)) return "colour";
  return "comp";
}

const ramp = (x: number, a: number, b: number) => Math.max(0, Math.min(1, (x - a) / (b - a)));

/** The trim on a part at intensity `x` (0..1). */
export function trimFor(track: Track, part: Part, x: number): number {
  const r = role(track, part);
  const push = Math.max(0, x - 0.5) * 2;
  if (r === "core") return DRUMS.has(part) ? 1 + 0.35 * push : 1;
  if (r === "time") return ramp(x, 0.05, 0.4) * (1 + 0.45 * push);
  if (r === "comp") return ramp(x, 0.2, 0.45) * (1 + 0.3 * push);
  return ramp(x, 0.35, 0.5) * (1 + 0.6 * push);
}

/** The room's return and the tone's cutoff at room `x` (0..1), from where they were written. */
export function roomFor(base: { wet: number; cutoff: number }, x: number): { wet: number; cutoff: number } {
  const wet = x <= 0.5 ? base.wet * (x / 0.5) ** 1.5 : base.wet + (x - 0.5) * 2 * (0.55 - base.wet);
  const cutoff = Math.min(16000, base.cutoff * 2 ** ((0.5 - x) * 1.6));
  return { wet, cutoff };
}
