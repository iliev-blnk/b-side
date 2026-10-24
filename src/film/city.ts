import type { Rng } from "../music/rng.ts";
import type { Ink, Piece } from "./stage.ts";

/**
 * The city, cut from paper: skylines with lit windows, a neon sign set as flat type, an elevated
 * line with a tram on it, a street lamp and its light, rain, the moon and searchlights.
 */

type Pt = [number, number];

const frac = (x: number) => x - Math.floor(x);

interface Building {
  x: number;
  w: number;
  top: number;
  roof: "flat" | "step" | "tank" | "spire";
  windows: { x: number; y: number; w: number; h: number; seed: number }[];
}

export interface Skyline {
  buildings: Building[];
  base: number;
}

/** A row of buildings from x0 to x1, standing on `base`, with windows on a grid. */
export function skyline(r: Rng, o: { x0: number; x1: number; base: number; tall: [number, number]; wide: [number, number]; gap: number; win: number }): Skyline {
  const buildings: Building[] = [];
  let x = o.x0;
  while (x < o.x1) {
    const w = r.range(o.wide[0], o.wide[1]);
    const top = o.base - r.range(o.tall[0], o.tall[1]);
    const roof = r.pick(["flat", "flat", "step", "tank", "spire"] as const);
    const windows: Building["windows"] = [];
    if (o.win > 0) {
      const ww = o.win;
      const cols = Math.max(1, Math.floor((w - ww) / (ww * 2.1)));
      const pad = (w - cols * ww * 2.1 + ww * 1.1) / 2;
      for (let y = top + ww * 2; y < o.base - ww * 2; y += ww * 2.4) {
        for (let c = 0; c < cols; c++) windows.push({ x: x + pad + c * ww * 2.1, y, w: ww, h: ww * 1.35, seed: r.next() });
      }
    }
    buildings.push({ x, w, top, roof, windows });
    x += w + r.range(0, o.gap);
  }
  return { buildings, base: o.base };
}

/**
 * The buildings as paper, windows lit by the harmony: each chord change turns a few lights on or
 * off. `lit` is the share of windows on, `step` the chord count.
 */
export function drawSkyline(id: string, s: Skyline, ink: Ink, litInk: Ink | null, step: number, lit: number, drift = 0.08): Piece[] {
  const out: Piece[] = [];
  s.buildings.forEach((b, i) => {
    const bid = `${id}/b${i}`;
    out.push({ id: bid, kind: "rect", ink, x: b.x, y: b.top, w: b.w, h: s.base - b.top + 400 });
    const cx = b.x + b.w / 2;
    if (b.roof === "step") out.push({ id: `${bid}/step`, kind: "rect", ink, x: b.x + b.w * 0.2, y: b.top - b.w * 0.18, w: b.w * 0.6, h: b.w * 0.2 });
    if (b.roof === "tank") {
      out.push({ id: `${bid}/tank`, kind: "poly", ink, pts: [[cx - b.w * 0.16, b.top - b.w * 0.22], [cx + b.w * 0.16, b.top - b.w * 0.22], [cx + b.w * 0.14, b.top - b.w * 0.42], [cx, b.top - b.w * 0.5], [cx - b.w * 0.14, b.top - b.w * 0.42]] });
      out.push({ id: `${bid}/legs`, kind: "rect", ink, x: cx - b.w * 0.13, y: b.top - b.w * 0.24, w: b.w * 0.26, h: b.w * 0.25, edge: 0.5 });
    }
    if (b.roof === "spire") out.push({ id: `${bid}/spire`, kind: "poly", ink, pts: [[cx - b.w * 0.2, b.top + 1], [cx, b.top - b.w * 0.9], [cx + b.w * 0.2, b.top + 1]] });
    if (!litInk) return;
    b.windows.forEach((w, j) => {
      if (frac(w.seed * 7.31 + step * drift) < lit) out.push({ id: `${bid}/w${j}`, kind: "rect", ink: litInk, x: w.x, y: w.y, w: w.w, h: w.h, edge: 0.45 });
    });
  });
  return out;
}

/** A vertical sign, one letter above the next on a plate; it misses a beat now and then. */
export function neon(id: string, word: string, x: number, y: number, size: number, on: boolean, plate: Ink): Piece[] {
  const n = word.length;
  const out: Piece[] = [{ id: `${id}/plate`, kind: "rect", ink: plate, x: x - size * 0.62, y: y - size * 0.35, w: size * 1.24, h: n * size * 1.08 + size * 0.3 }];
  out.push({ id: `${id}/arm`, kind: "rect", ink: plate, x: x - size * 1.2, y: y + size * 0.2, w: size * 0.7, h: size * 0.12, edge: 0.4 });
  if (on)
    [...word].forEach((c, i) =>
      out.push({ id: `${id}/l${i}`, kind: "text", ink: "neon", text: c, x, y: y + (i + 0.82) * size * 1.08, size, weight: 700, align: "center" }),
    );
  return out;
}

/** A street lamp: post, arm and head. Returns where the light comes out. */
export function lamp(id: string, x: number, base: number, h: number, ink: Ink): { pieces: Piece[]; head: Pt } {
  const top = base - h;
  const arm = h * 0.16;
  return {
    pieces: [
      { id: `${id}/foot`, kind: "rect", ink, x: x - 9, y: base - 34, w: 18, h: 36, edge: 0.5 },
      { id: `${id}/post`, kind: "rect", ink, x: x - 4.5, y: top, w: 9, h: h, edge: 0.4 },
      { id: `${id}/arm`, kind: "rect", ink, x: x - arm, y: top, w: arm, h: 6, edge: 0.4 },
      { id: `${id}/head`, kind: "poly", ink, pts: [[x - arm - 22, top + 18], [x - arm + 22, top + 18], [x - arm + 10, top - 2], [x - arm - 10, top - 2]] },
    ],
    head: [x - arm, top + 18],
  };
}

/** Shopfronts at street level: lit glass under awnings, for a figure to pass across in silhouette. */
export function shops(id: string, x0: number, x1: number, base: number, step: number, ink: Ink, litInk: Ink): Piece[] {
  const out: Piece[] = [{ id: `${id}/wall`, kind: "rect", ink, x: x0, y: base - 250, w: x1 - x0, h: 250 }];
  for (let x = x0 + 30, i = 0; x + 150 < x1; x += 210, i++) {
    // one shop in five is shut, and which one moves with the harmony
    if (frac(i * 0.618 + step * 0.13) < 0.2) continue;
    out.push({ id: `${id}/glass${i}`, kind: "rect", ink: litInk, x, y: base - 180, w: 150, h: 150, edge: 0.5 });
    out.push({ id: `${id}/bar${i}`, kind: "rect", ink, x: x + 72, y: base - 180, w: 6, h: 150, edge: 0.3 });
    out.push({ id: `${id}/awning${i}`, kind: "poly", ink, pts: [[x - 14, base - 206], [x + 164, base - 206], [x + 176, base - 178], [x - 26, base - 178]] });
  }
  return out;
}

/** The light from a lamp: a cone to the street and a pool on it. */
export function lampLight(id: string, [x, y]: Pt, base: number, spread: number): Piece[] {
  // a flattened octagon rather than an ellipse: the scissors cut straight
  const pool: Pt[] = Array.from({ length: 8 }, (_, i) => {
    const a = ((i + 0.5) / 8) * Math.PI * 2;
    return [x + Math.cos(a) * spread * 1.2, base + 10 + Math.sin(a) * spread * 0.2];
  });
  // two sheets of tissue: a faint wide beam and a brighter core, so it reads as light falling
  return [
    { id: `${id}/cone`, kind: "poly", ink: "light", alpha: 0.32, pts: [[x - 18, y], [x + 18, y], [x + spread, base + 8], [x - spread, base + 8]] },
    { id: `${id}/core`, kind: "poly", ink: "light", alpha: 0.38, pts: [[x - 10, y], [x + 10, y], [x + spread * 0.5, base + 8], [x - spread * 0.5, base + 8]] },
    { id: `${id}/pool`, kind: "poly", ink: "light", alpha: 0.8, pts: pool },
  ];
}

/** An elevated line: deck, girders and the pillars under it. */
export function bridge(id: string, x0: number, x1: number, y: number, base: number, ink: Ink): Piece[] {
  const out: Piece[] = [
    { id: `${id}/deck`, kind: "rect", ink, x: x0, y, w: x1 - x0, h: 26 },
    { id: `${id}/rail`, kind: "rect", ink, x: x0, y: y - 12, w: x1 - x0, h: 4, edge: 0.3 },
  ];
  for (let x = x0 + 60, i = 0; x < x1; x += 260, i++) {
    out.push({ id: `${id}/p${i}`, kind: "rect", ink, x: x - 14, y: y + 20, w: 28, h: base - y });
    out.push({ id: `${id}/k${i}`, kind: "poly", ink, pts: [[x - 70, y + 24], [x + 70, y + 24], [x + 14, y + 80], [x - 14, y + 80]] });
  }
  return out;
}

/** A tram on the line, lights on, with its pole up to the wire. */
export function tram(id: string, x: number, y: number, len: number, ink: Ink, litInk: Ink): Piece[] {
  const h = 74;
  const top = y - h - 12;
  const out: Piece[] = [
    { id: `${id}/body`, kind: "poly", ink, pts: [[x, y - 12], [x + len, y - 12], [x + len, top + 14], [x + len - 14, top], [x + 14, top], [x, top + 14]] },
    { id: `${id}/pole`, kind: "poly", ink, pts: [[x + len * 0.5 - 2, top], [x + len * 0.5 + 2, top], [x + len * 0.5 - 62, top - 60], [x + len * 0.5 - 66, top - 60]], edge: 0.3 },
  ];
  const n = Math.floor(len / 46);
  for (let i = 0; i < n; i++) out.push({ id: `${id}/w${i}`, kind: "rect", ink: litInk, x: x + 16 + i * ((len - 32) / n), y: top + 16, w: (len - 32) / n - 9, h: 26, edge: 0.4 });
  return out;
}

/** The wire the tram runs under. */
export function wire(id: string, x0: number, x1: number, y: number, ink: Ink): Piece {
  return { id, kind: "rect", ink, x: x0, y, w: x1 - x0, h: 2.5, edge: 0.15 };
}

/** Rain: thin slanted cuts that fall a step on every hat. */
export function rain(id: string, r: Rng, n: number, box: { x: number; y: number; w: number; h: number }, len: number, fall: number, slant = 0.18): Piece[] {
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

/** Searchlights sweeping from below the skyline. */
export function beams(id: string, from: Pt[], angles: number[], len: number, width: number): Piece[] {
  return from.map(([x, y], i) => {
    const a = angles[i]!;
    const tx = x + Math.sin(a) * len;
    const ty = y - Math.cos(a) * len;
    const nx = Math.cos(a) * width;
    const ny = Math.sin(a) * width;
    return { id: `${id}/${i}`, kind: "poly", ink: "beam", alpha: 0.5, pts: [[x - 6, y], [x + 6, y], [tx + nx, ty + ny], [tx - nx, ty - ny]] };
  });
}

/** Smoke from a cigarette: thin wisps that rise, curl, spread and thin out. */
export function smoke(id: string, from: Pt, t: number, every: number, wind: number): Piece[] {
  const out: Piece[] = [];
  const last = Math.floor(t / every);
  for (let k = Math.max(0, last - 3); k <= last; k++) {
    const age = t - k * every;
    if (age < 0) continue;
    for (let j = 0; j < 7; j++) {
      const a = age - j * 0.12;
      if (a < 0) continue;
      const x = from[0] + Math.sin(a * 2.3 + k * 1.7) * (3 + a * 7) + a * wind * 26;
      const y = from[1] - a * 30 - j * 4;
      out.push({ id: `${id}/${k}/${j}`, kind: "rect", ink: "smoke", alpha: Math.max(0, 0.42 - a * 0.14), x: x - 1.5 - a * 3, y: y - 5, w: 3 + a * 6, h: 10 + a * 4, rot: Math.sin(a * 3 + j) * 0.6, edge: 0.6 });
    }
  }
  return out.filter((p) => (p.alpha ?? 0) > 0.02);
}
