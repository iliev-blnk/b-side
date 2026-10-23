import { rng } from "../music/rng.ts";
import { PAPER, type Paper } from "../record/palette.ts";

/**
 * Cut paper on Canvas 2D. Every shape is turned into a polygon with a slightly uneven scissor edge
 * (fixed per shape), placed again on every animation frame with a tiny wobble (stop-motion on twos),
 * and laid on the sheet with a soft paper shadow. Grain and light go over the whole frame.
 */

export const FONT = '"Jost Variable", Jost, system-ui, sans-serif';
/** Stop-motion frame rate: paper moves on twos. */
export const FPS = 12;

interface Base {
  /** Stable name: seeds the scissor edge, so the same piece keeps its cut from frame to frame. */
  id: string;
  color: Paper;
  /** 0..1 */
  alpha?: number;
  /** Paper pieces cast a shadow; flat light or holes do not. */
  flat?: boolean;
}
export type Shape = Base &
  (
    | { kind: "rect"; x: number; y: number; w: number; h: number; rot?: number }
    | { kind: "circle"; x: number; y: number; r: number }
    | { kind: "ring"; x: number; y: number; r: number; inner: number }
    | { kind: "poly"; pts: [number, number][] }
    | { kind: "sector"; x: number; y: number; r0: number; r1: number; a0: number; a1: number }
    | { kind: "text"; text: string; x: number; y: number; size: number; weight?: number; align?: "left" | "center" | "right"; rot?: number; spacing?: number }
  );

export interface Sheet {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  /** Shortest side: the unit every layout is measured in. */
  u: number;
}

/** Per-frame state: which twos-frame we are on, and where the light comes from. */
export interface Frame {
  /** Increments 12 times a second; the paper is re-placed when it changes. */
  twos: number;
  /** -1: light from the left, 1: from the right. */
  light: -1 | 1;
}

type Pt = [number, number];

function rotate([x, y]: Pt, cx: number, cy: number, a: number): Pt {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
}

/** Splits each edge into short pieces and pushes every point in or out a little: a scissor cut. */
function cut(pts: Pt[], id: string, amp: number, closed = true): Pt[] {
  const r = rng(`cut/${id}`);
  const out: Pt[] = [];
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[(i + 1) % pts.length]!;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.round(len / 28));
    const nx = -(y1 - y0) / (len || 1);
    const ny = (x1 - x0) / (len || 1);
    // a scissor line drifts slowly off true, it does not zigzag
    let drift = 0;
    for (let k = 0; k < steps; k++) {
      const f = k / steps;
      drift = drift * 0.6 + (r.next() - 0.5) * amp;
      const d = k === 0 ? (r.next() - 0.5) * amp * 0.5 : drift;
      out.push([x0 + (x1 - x0) * f + nx * d, y0 + (y1 - y0) * f + ny * d]);
    }
  }
  return out;
}

function circlePts(x: number, y: number, r: number, id: string, amp: number, a0 = 0, a1 = Math.PI * 2): Pt[] {
  const g = rng(`circle/${id}`);
  const n = Math.max(24, Math.min(160, Math.round((r * Math.abs(a1 - a0)) / 14)));
  const p1 = g.range(0, 6.28);
  const p2 = g.range(0, 6.28);
  const k1 = g.int(2, 4);
  const k2 = g.int(5, 9);
  const full = Math.abs(a1 - a0) >= Math.PI * 2 - 1e-6;
  const pts: Pt[] = [];
  for (let i = 0; i < (full ? n : n + 1); i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const rr = r + amp * (0.6 * Math.sin(a * k1 + p1) + 0.3 * Math.sin(a * k2 + p2) + (g.next() - 0.5) * 0.4);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  return pts;
}

function trace(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
  ctx.closePath();
}

function path(s: Shape, amp: number): Path2D | null {
  const p = new Path2D();
  const ctx = { moveTo: p.moveTo.bind(p), lineTo: p.lineTo.bind(p), closePath: p.closePath.bind(p) } as CanvasRenderingContext2D;
  switch (s.kind) {
    case "rect": {
      const cx = s.x + s.w / 2;
      const cy = s.y + s.h / 2;
      const corners: Pt[] = [
        [s.x, s.y],
        [s.x + s.w, s.y],
        [s.x + s.w, s.y + s.h],
        [s.x, s.y + s.h],
      ].map((q) => rotate(q as Pt, cx, cy, s.rot ?? 0));
      trace(ctx, cut(corners, s.id, amp));
      return p;
    }
    case "circle":
      trace(ctx, circlePts(s.x, s.y, s.r, s.id, amp));
      return p;
    case "ring":
      trace(ctx, circlePts(s.x, s.y, s.r, s.id, amp));
      trace(ctx, circlePts(s.x, s.y, s.inner, `${s.id}/in`, amp).reverse());
      return p;
    case "poly":
      trace(ctx, cut(s.pts, s.id, amp));
      return p;
    case "sector": {
      const outer = circlePts(s.x, s.y, s.r1, s.id, amp, s.a0, s.a1);
      const inner = s.r0 > 0 ? circlePts(s.x, s.y, s.r0, `${s.id}/in`, amp, s.a0, s.a1).reverse() : [[s.x, s.y] as Pt];
      trace(ctx, [...outer, ...inner]);
      return p;
    }
    case "text":
      return null;
  }
}

/** Re-placement wobble: a piece of paper never lands exactly where it was on the last frame. */
function nudge(id: string, frame: Frame, u: number): { dx: number; dy: number; rot: number } {
  const r = rng(`nudge/${id}/${frame.twos}`);
  const m = u * 0.0012;
  return { dx: r.range(-m, m), dy: r.range(-m, m), rot: r.range(-0.0016, 0.0016) };
}

function shadowOn(sheet: Sheet, frame: Frame, depth = 1) {
  const { ctx, u } = sheet;
  ctx.shadowColor = "rgba(0,0,0,0.42)";
  ctx.shadowBlur = u * 0.012 * depth;
  ctx.shadowOffsetX = -frame.light * u * 0.004 * depth;
  ctx.shadowOffsetY = u * 0.005 * depth;
}

function shadowOff(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/** Cut letters: each one set on its own with a small tilt and lift, like letters cut and glued. */
function drawText(sheet: Sheet, s: Extract<Shape, { kind: "text" }>, frame: Frame) {
  const { ctx } = sheet;
  ctx.font = `${s.weight ?? 800} ${s.size}px ${FONT}`;
  ctx.textBaseline = "alphabetic";
  const spacing = (s.spacing ?? 0) * s.size;
  const chars = [...s.text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  const start = s.align === "center" ? -total / 2 : s.align === "right" ? -total : 0;
  const big = s.size > sheet.u * 0.06;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.rot ?? 0);
  let x = start;
  chars.forEach((c, i) => {
    if (c !== " ") {
      const g = rng(`letter/${s.id}/${i}`);
      const n = rng(`letter/${s.id}/${i}/${frame.twos}`);
      const tilt = big ? g.range(-0.03, 0.03) + n.range(-0.004, 0.004) : 0;
      const lift = big ? g.range(-0.025, 0.025) * s.size + n.range(-0.004, 0.004) * s.size : 0;
      ctx.save();
      ctx.translate(x + widths[i]! / 2, lift);
      ctx.rotate(tilt);
      ctx.fillText(c, -widths[i]! / 2, 0);
      ctx.restore();
    }
    x += widths[i]! + spacing;
  });
  ctx.restore();
}

/** Text width at a size, for layouts that crop or fit type. */
export function measure(ctx: CanvasRenderingContext2D, text: string, size: number, weight = 800, spacing = 0): number {
  ctx.font = `${weight} ${size}px ${FONT}`;
  return ctx.measureText(text).width + spacing * size * Math.max(0, [...text].length - 1);
}

/** Lays the pieces down in order, bottom first. */
export function draw(sheet: Sheet, shapes: Shape[], frame: Frame) {
  const { ctx, u } = sheet;
  const amp = u * 0.0035;
  for (const s of shapes) {
    const { dx, dy, rot } = nudge(s.id, frame, u);
    ctx.save();
    ctx.globalAlpha = s.alpha ?? 1;
    ctx.translate(sheet.w / 2 + dx, sheet.h / 2 + dy);
    ctx.rotate(rot);
    ctx.translate(-sheet.w / 2, -sheet.h / 2);
    if (!s.flat) shadowOn(sheet, frame, s.kind === "text" ? 0.6 : 1);
    ctx.fillStyle = PAPER[s.color];
    if (s.kind === "text") drawText(sheet, s, frame);
    else {
      const p = path(s, amp);
      if (p) ctx.fill(p, "evenodd");
    }
    shadowOff(ctx);
    ctx.restore();
  }
}

let grainTile: HTMLCanvasElement | OffscreenCanvas | null = null;

function grain(): HTMLCanvasElement | OffscreenCanvas {
  if (grainTile) return grainTile;
  const size = 256;
  const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(size, size) : Object.assign(document.createElement("canvas"), { width: size, height: size });
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const img = g.createImageData(size, size);
  const r = rng("grain");
  for (let i = 0; i < size * size; i++) {
    // fibres: mostly fine noise, now and then a longer light streak
    const v = 128 + (r.next() - 0.5) * 70 + (r.next() < 0.004 ? 50 : 0);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

/** The sheet itself: a flat colour. */
export function ground(sheet: Sheet, color: Paper) {
  sheet.ctx.fillStyle = PAPER[color];
  sheet.ctx.fillRect(0, 0, sheet.w, sheet.h);
}

/** Paper grain and one-sided light over the finished frame. */
export function finish(sheet: Sheet, frame: Frame, strength = 1) {
  const { ctx, w, h } = sheet;
  ctx.save();
  ctx.globalAlpha = strength;
  // light from one side, falling off across the sheet
  const lit = frame.light < 0 ? 0 : w;
  const g = ctx.createLinearGradient(lit, 0, w - lit, h * 0.3);
  g.addColorStop(0, "rgba(255,244,225,0.05)");
  g.addColorStop(0.55, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.34)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.hypot(w, h) * 0.62);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  // grain last: it also breaks up the banding of the gradients
  ctx.globalCompositeOperation = "overlay";
  ctx.globalAlpha = 0.3 * strength;
  const pattern = ctx.createPattern(grain() as CanvasImageSource, "repeat");
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}
