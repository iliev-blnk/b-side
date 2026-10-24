import type { Track } from "../../band/types.ts";
import { type Rng, rng } from "../../music/rng.ts";
import type { Cast } from "../cast.ts";
import { beams, drawSkyline, neon, type Skyline, skyline } from "../city.ts";
import { beatAt, count, type Cues } from "../cues.ts";
import { type Camera, H, type Layer, type Piece, seen, type View, W } from "../stage.ts";

/**
 * What every scene is handed, and what they share: the night's city, its sky and weather, and
 * the camera moves the film is built from. A scene is a function of a shot: it sets up its paper
 * once, then answers with a view for any moment of the shot, in seconds from the top of the track.
 */

export interface Shot {
  track: Track;
  c: Cues;
  cast: Cast;
  world: World;
  /** Track-local seconds the shot covers. */
  t0: number;
  t1: number;
  /** Where the shot cuts to a new setup: the band's hits inside it. */
  cuts: number[];
  section: Cues["sections"][number];
  /** 0, 1 or 2: which film of the night. */
  act: number;
  /** A scene's own variation, chosen by the story. */
  variant: string;
  r: Rng;
}

export type Scene = (s: Shot) => (t: number) => View;

/** The ground line every street scene stands on. */
export const BASE = 900;

export interface World {
  far: Skyline;
  mid: Skyline;
  moon: [number, number];
  /** Where the neon hangs, on a building low enough to carry it. */
  sign: [number, number];
}

/** The night's city: the same buildings in every shot that shows them. */
export function world(cast: Cast): World {
  const r = rng(`${cast.seed}/film/city`);
  const far = skyline(r.fork("far"), { x0: -2400, x1: 7600, base: BASE, tall: [170, 440], wide: [60, 140], gap: 8, win: 6 });
  const mid = skyline(r.fork("mid"), { x0: -2200, x1: 7400, base: BASE, tall: [280, 600], wide: [150, 280], gap: 60, win: 12 });
  const sign: [number, number] = [1330, 330];
  const host = mid.buildings.find((b) => b.x <= sign[0] && b.x + b.w >= sign[0]);
  if (host && host.top > 300) host.top = 300;
  return { far, mid, moon: [r.range(1180, 1560), r.range(200, 290)], sign };
}

export const clamp01 = (k: number) => Math.max(0, Math.min(1, k));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const inOut = (k: number) => {
  const x = clamp01(k);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
export const out3 = (k: number) => 1 - (1 - clamp01(k)) ** 3;
export const frac = (x: number) => x - Math.floor(x);

/** The same items in an order of the stream's choosing. */
export function shuffle<T>(r: Rng, xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r.next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** How far into the shot `t` is, 0..1. */
export const along = (s: Shot, t: number) => clamp01((t - s.t0) / (s.t1 - s.t0));

/** Which setup the shot is on: it moves on at every cut. */
export const setupAt = (s: Shot, t: number) => count(s.cuts, t);
/** When the current setup began, and how long it runs. */
export function setupSpan(s: Shot, t: number): { i: number; from: number; to: number; k: number } {
  const i = setupAt(s, t);
  const from = i ? s.cuts[i - 1]! : s.t0;
  const to = s.cuts[i] ?? s.t1;
  return { i, from, to, k: clamp01((t - from) / (to - from)) };
}

/** How hard the band is playing at `t`. */
export const energyAt = (s: Shot, t: number) => s.c.sections.find((x) => t >= x.t && t < x.end)?.energy ?? 0.4;

/** The camera breathes with the band: a slow push on each bar, bigger when it plays harder. */
export function breathe(s: Shot, t: number): number {
  return 1 + 0.008 * energyAt(s, t) * Math.sin((beatAt(s.c, t) / s.track.meter) * Math.PI);
}

/**
 * A camera that puts the point (px, py) of the layer at depth `z` (the figure's plane unless said)
 * at the screen point (sx, sy) at this zoom. `focus` defaults to the figure's plane.
 */
export function frame(px: number, py: number, zoom: number, sx = W / 2, sy = H / 2, focus = 1, d = 0, z = 1): Camera {
  const ze = z - d;
  const k = (zoom * z) / ze;
  return { x: ((px - W / 2) * k - (sx - W / 2)) * (ze / zoom), y: ((py - H / 2) * k - (sy - H / 2)) * (ze / zoom), d, zoom, focus };
}

/** Eases one camera into another. */
export function blend(a: Camera, b: Camera, k: number): Camera {
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), d: lerp(a.d, b.d, k), zoom: lerp(a.zoom, b.zoom, k), focus: lerp(a.focus, b.focus, k) };
}

/** The moon, a strip of cloud across it, and searchlights from behind the skyline. */
export function sky(w: World, t: number, o: { beams?: boolean; moon?: number } = {}): Piece[] {
  const [mx, my] = w.moon;
  const r = o.moon ?? 64;
  const out: Piece[] = [
    { id: "moon", kind: "circle", ink: "moon", x: mx, y: my, r },
    { id: "cloud1", kind: "rect", ink: "cloud", x: mx - 190 + Math.sin(t * 0.05) * 30, y: my - 4, w: 440, h: 15, edge: 0.6 },
    { id: "cloud2", kind: "rect", ink: "cloud", x: mx - 100 + Math.sin(t * 0.04 + 1) * 24, y: my + 36, w: 300, h: 9, edge: 0.5 },
    { id: "cloud3", kind: "rect", ink: "cloud", x: mx - 1170, y: my - 90, w: 520, h: 12, edge: 0.6 },
    { id: "cloud4", kind: "rect", ink: "cloud", x: mx + 600, y: my - 140, w: 380, h: 10, edge: 0.6 },
  ];
  if (o.beams !== false) out.push(...beams("beam", [[mx - 1010, 1000], [mx + 270, 1000]], [-0.28 + 0.3 * Math.sin(t * 0.33), 0.24 + 0.28 * Math.sin(t * 0.27 + 2)], 1300, 70));
  return out;
}

/** The far and middle distance: windows on the chords, the sign blinking now and then. */
export function town(s: Shot, t: number, o: { sign?: [number, number]; lit?: number } = {}): Layer[] {
  const chord = count(s.c.chords, t);
  const mid: Piece[] = drawSkyline("mid", s.world.mid, "mid", "lit", chord, o.lit ?? 0.26);
  if (o.sign) {
    const on = rng(`flicker/${count(s.c.beats, t)}`).next() > 0.07;
    mid.push(...neon("sign", s.cast.sign, o.sign[0], o.sign[1], 44, on, "near"));
  }
  return [
    { id: "far", z: 6, pieces: drawSkyline("far", s.world.far, "far", "farLit", chord, (o.lit ?? 0.26) * 0.8), cast: true },
    { id: "mid", z: 3, pieces: mid, cast: true },
  ];
}

/**
 * Rain or snow, in a sheet behind the figure and a sheet in front of it. Rain falls a step on
 * every hat; snow drifts down on the beat.
 */
export function weather(s: Shot, t: number, cam: Camera, o: { back?: number; front?: number; amount?: number } = {}): Layer[] {
  const kind = s.cast.weather;
  if (kind === "clear") return [];
  const zb = o.back ?? 1.8;
  const zf = o.front ?? 0.55;
  const amount = o.amount ?? 1;
  const seed = `${s.track.seed}/${s.act}`;
  if (kind === "rain") {
    const fall = count(s.c.hats, t) * 46 + t * 150;
    return [
      { id: "rain2", z: zb, pieces: drops("rain2", rng(`${seed}/rain2`), Math.round(130 * amount), seen(zb, cam), 26, fall * 0.8) },
      { id: "rain", z: zf, pieces: drops("rain", rng(`${seed}/rain`), Math.round(34 * amount), seen(zf, cam), 44, fall) },
    ];
  }
  const fall = beatAt(s.c, t) * 14 + t * 22;
  return [
    { id: "snow2", z: zb, pieces: flakes("snow2", rng(`${seed}/snow2`), Math.round(160 * amount), seen(zb, cam), 5, fall * 0.7, t) },
    { id: "snow", z: zf, pieces: flakes("snow", rng(`${seed}/snow`), Math.round(40 * amount), seen(zf, cam), 11, fall, t) },
  ];
}

function drops(id: string, r: Rng, n: number, box: { x: number; y: number; w: number; h: number }, len: number, fall: number, slant = 0.18): Piece[] {
  const out: Piece[] = [];
  for (let i = 0; i < n; i++) {
    const x0 = r.next() * box.w;
    const y0 = r.next() * box.h;
    const l = len * r.range(0.6, 1.2);
    const y = box.y + ((((y0 + fall * r.range(0.85, 1.15)) % box.h) + box.h) % box.h);
    const x = box.x + x0 + (y - box.y) * slant;
    out.push({ id: `${id}/${i}`, kind: "rect", ink: "rain", x, y, w: Math.max(1.6, len * 0.035), h: l, rot: -slant, edge: 0.1 });
  }
  return out;
}

function flakes(id: string, r: Rng, n: number, box: { x: number; y: number; w: number; h: number }, size: number, fall: number, t: number): Piece[] {
  const out: Piece[] = [];
  for (let i = 0; i < n; i++) {
    const x0 = r.next() * box.w;
    const y0 = r.next() * box.h;
    const sz = size * r.range(0.6, 1.3);
    const sway = r.range(10, 40);
    const y = box.y + ((((y0 + fall * r.range(0.7, 1.3)) % box.h) + box.h) % box.h);
    const x = box.x + ((((x0 + Math.sin(t * r.range(0.4, 0.9) + i) * sway) % box.w) + box.w) % box.w);
    out.push({ id: `${id}/${i}`, kind: "rect", ink: "snow", x, y, w: sz, h: sz, rot: r.range(0, 1.5), edge: 0.5 });
  }
  return out;
}

/** An octagonal shadow pool under someone standing, for the stage's cut-paper look. */
export function pool(id: string, x: number, y: number, rx: number, ry: number): Piece {
  return {
    id,
    kind: "poly",
    ink: "shade",
    pts: Array.from({ length: 12 }, (_, i): [number, number] => {
      const a = (i / 12) * Math.PI * 2;
      return [x + Math.cos(a) * rx, y + Math.sin(a) * ry];
    }),
  };
}

/** A view with the light from the left, as most of the film is. */
export const view = (layers: Layer[], cam: Camera, light: -1 | 1 = 1): View => ({ layers, cam, light });

/** Pieces moved by (dx, dy): a set carried along with the camera, like the inside of a tram. */
export function shift(ps: Piece[], dx: number, dy = 0): Piece[] {
  return ps.map((p): Piece => (p.kind === "poly" ? { ...p, pts: p.pts.map(([x, y]): [number, number] => [x + dx, y + dy]) } : { ...p, x: p.x + dx, y: p.y + dy }));
}

/** Where the shot changes setup: at its cuts, or partway through when the band gives it none. */
export const marks = (s: Shot, at = 0.5): number[] => (s.cuts.length ? s.cuts : [lerp(s.t0, s.t1, at)]);
