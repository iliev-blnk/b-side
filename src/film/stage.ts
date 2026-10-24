import { rng } from "../music/rng.ts";
import { FONT, grain, type Shape, shapePath } from "../visual/paper.ts";

/**
 * A multiplane stage. Cut-paper layers hang at depths in front of the camera; the figure's plane
 * is at depth 1 and the sky is far behind. Pieces are cut in world units (pixels of a 1920x1080
 * frame seen from the camera at rest), so the scissor edge stays the same as the camera moves.
 * Panning slides near layers further than far ones, a dolly grows them faster, and focus blurs
 * the planes either side of it. Paper is re-laid on twos, and the camera steps on twos as well.
 */

export const W = 1920;
export const H = 1080;
/** Paper and camera move 12 times a second. */
export const FPS = 12;
export const twos = (t: number) => Math.floor(t * FPS + 1e-6);
export const onTwos = (t: number) => twos(t) / FPS;

/** What a piece is, not what colour it is: each look inks the same parts its own way. */
export type Ink =
  | "sky" | "cloud" | "moon" | "beam" | "far" | "farLit" | "mid" | "near" | "street" | "lit" | "neon"
  | "figure" | "back" | "trim" | "light" | "shade" | "smoke" | "rain" | "type"
  | "brass" | "wood" | "water" | "snow" | "paper" | "spot" | "label" | "flame";

type Geo<S> = S extends Shape ? Omit<S, "color" | "alpha" | "flat"> : never;
export type Piece = Geo<Shape> & {
  ink: Ink;
  alpha?: number;
  /** Scissor roughness, 1 by default; thin pieces want less. */
  edge?: number;
};

export interface Layer {
  id: string;
  /** Distance from the camera at rest. */
  z: number;
  pieces: Piece[];
  /** Casts a shadow on the layers behind it. */
  cast?: boolean;
  /** Pinned to the screen (titles): no parallax, focus or haze. */
  fixed?: boolean;
}

export interface Camera {
  /** Pan, in pixels of the figure's plane. */
  x: number;
  y: number;
  /** Dolly: how far the camera has moved in, in units of depth. */
  d: number;
  zoom: number;
  /** The depth in focus. */
  focus: number;
}

export interface View {
  layers: Layer[];
  cam: Camera;
  /** -1: key light from the left, 1: from the right. */
  light: -1 | 1;
}

export interface Look {
  name: string;
  inks: Record<Ink, string>;
  /** Inks that give light, and how they lay over what is behind them. */
  glow: Partial<Record<Ink, { blend: GlobalCompositeOperation; bloom: number }>>;
  /** 0..1: how far the distance fades into the sky. */
  haze: number;
  /** Defocus blur, in pixels per unit of 1/depth away from focus. */
  blur: number;
  /** The shadow a layer drops on the layers behind it. */
  shadow: { alpha: number; blur: number; offset: number };
  /** Scissor roughness. */
  edge: number;
  /** How far paper shifts when it is re-laid, in world pixels. */
  wobble: number;
  grain: number;
  /** Paper fibre over every layer. */
  texture: number;
  vignette: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** The part of a layer at depth `z` the camera sees, in that layer's units. */
export function seen(z: number, cam: Camera) {
  const ze = z - cam.d;
  const k = (cam.zoom * z) / ze;
  const toLayer = (sx: number, sy: number): [number, number] => [W / 2 + (sx - W / 2 + (cam.zoom * cam.x) / ze) / k, H / 2 + (sy - H / 2 + (cam.zoom * cam.y) / ze) / k];
  const [x0, y0] = toLayer(0, 0);
  const [x1, y1] = toLayer(W, H);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

let pool: HTMLCanvasElement[] = [];
/** A pooled offscreen canvas, cleared: 0 and 1 are the stage's own. */
export function scratch(i: number, w: number, h: number): CanvasRenderingContext2D {
  if (!pool[i] || pool[i]!.width !== w || pool[i]!.height !== h) {
    pool[i] = Object.assign(document.createElement("canvas"), { width: w, height: h });
  }
  const g = pool[i]!.getContext("2d")!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;
  g.filter = "none";
  g.clearRect(0, 0, w, h);
  return g;
}

function letters(g: CanvasRenderingContext2D, p: Extract<Piece, { kind: "text" }>, frame: number) {
  g.font = `${p.weight ?? 800} ${p.size}px ${FONT}`;
  g.textBaseline = "alphabetic";
  const spacing = (p.spacing ?? 0) * p.size;
  const chars = [...p.text];
  const widths = chars.map((c) => g.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let x = p.align === "center" ? -total / 2 : p.align === "right" ? -total : 0;
  g.save();
  g.translate(p.x, p.y);
  g.rotate(p.rot ?? 0);
  chars.forEach((c, i) => {
    if (c !== " ") {
      const fixed = rng(`letter/${p.id}/${i}`);
      const laid = rng(`letter/${p.id}/${i}/${frame}`);
      g.save();
      g.translate(x + widths[i]! / 2, fixed.range(-0.02, 0.02) * p.size + laid.range(-0.004, 0.004) * p.size);
      g.rotate(fixed.range(-0.025, 0.025) + laid.range(-0.003, 0.003));
      g.fillText(c, -widths[i]! / 2, 0);
      g.restore();
    }
    x += widths[i]! + spacing;
  });
  g.restore();
}

function lay(g: CanvasRenderingContext2D, pieces: Piece[], look: Look, frame: number) {
  for (const p of pieces) {
    const n = rng(`laid/${p.id}/${frame}`);
    const m = look.wobble;
    g.save();
    g.translate(n.range(-m, m), n.range(-m, m));
    g.globalAlpha = p.alpha ?? 1;
    g.fillStyle = look.inks[p.ink];
    if (p.kind === "text") letters(g, p, frame);
    else {
      const path = shapePath({ ...p, color: "ink" } as Shape, 3.6 * look.edge * (p.edge ?? 1));
      if (path) g.fill(path, "evenodd");
    }
    g.restore();
  }
}

/** Draws the view into a 16:9 canvas of any size, and the frame over it. */
export function render(ctx: CanvasRenderingContext2D, view: View, look: Look, frame: number) {
  paint(ctx, view, look, frame);
  finish(ctx, look, frame);
}

/**
 * Lays the view's sky and every layer. `frame` is the twos count: it re-lays the paper. Without
 * `ground` the layers go over what is already there.
 */
export function paint(ctx: CanvasRenderingContext2D, view: View, look: Look, frame: number, ground = true) {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const S = cw / W;
  const { cam } = view;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (ground) {
    ctx.fillStyle = look.inks.sky;
    ctx.fillRect(0, 0, cw, ch);
  }
  const texture = look.texture ? ctx.createPattern(grain() as CanvasImageSource, "repeat") : null;

  const layers = [...view.layers].sort((a, b) => (a.fixed ? 1 : 0) - (b.fixed ? 1 : 0) || b.z - a.z);
  layers.forEach((L, i) => {
    const ze = L.fixed ? 1 : L.z - cam.d;
    if (ze <= 0.05) return;
    const k = L.fixed ? 1 : (cam.zoom * L.z) / ze;
    const jit = rng(`layer/${L.id}/${frame}`);
    const m = L.fixed ? 0 : look.wobble * 0.5;
    const tx = L.fixed ? 0 : W / 2 - (k * W) / 2 - (cam.zoom * cam.x) / ze + jit.range(-m, m);
    const ty = L.fixed ? 0 : H / 2 - (k * H) / 2 - (cam.zoom * cam.y) / ze + jit.range(-m, m);
    const fe = Math.max(0.1, cam.focus - cam.d);
    const defocus = L.fixed ? 0 : clamp(look.blur * Math.abs(1 / ze - 1 / fe) * S, 0, 36 * S);
    const haze = L.fixed ? 0 : look.haze * clamp(1 - 1 / ze, 0, 0.92);

    const solid = L.pieces.filter((p) => !look.glow[p.ink]);
    const glowing = L.pieces.filter((p) => look.glow[p.ink]);

    if (solid.length) {
      const g = scratch(0, cw, ch);
      g.setTransform(S * k, 0, 0, S * k, S * tx, S * ty);
      lay(g, solid, look, frame);
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (texture && look.texture) {
        g.globalCompositeOperation = "source-atop";
        g.globalAlpha = look.texture;
        g.fillStyle = texture;
        g.fillRect(0, 0, cw, ch);
      }
      if (haze > 0.01) {
        g.globalCompositeOperation = "source-atop";
        g.globalAlpha = haze;
        g.fillStyle = look.inks.sky;
        g.fillRect(0, 0, cw, ch);
      }
      ctx.filter = defocus > 0.4 ? `blur(${defocus.toFixed(1)}px)` : "none";
      if (L.cast && look.shadow.alpha) {
        // the further the sheet behind, the bigger and softer the shadow
        const behind = layers.slice(0, i).filter((b) => !b.fixed).at(-1);
        const gap = clamp(behind ? behind.z - L.z : 1, 0.3, 2);
        ctx.shadowColor = `rgba(0,0,0,${look.shadow.alpha})`;
        ctx.shadowBlur = look.shadow.blur * gap * S * k;
        ctx.shadowOffsetX = -view.light * look.shadow.offset * gap * S * k;
        ctx.shadowOffsetY = look.shadow.offset * gap * S * k;
      }
      ctx.drawImage(g.canvas, 0, 0);
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
      ctx.filter = "none";
    }

    // light is laid last, ink by ink, each with its own blend and bloom
    const inks = [...new Set(glowing.map((p) => p.ink))];
    for (const ink of inks) {
      const { blend, bloom } = look.glow[ink]!;
      const g = scratch(1, cw, ch);
      g.setTransform(S * k, 0, 0, S * k, S * tx, S * ty);
      lay(g, glowing.filter((p) => p.ink === ink), look, frame);
      ctx.globalCompositeOperation = blend;
      ctx.filter = defocus > 0.4 ? `blur(${defocus.toFixed(1)}px)` : "none";
      ctx.drawImage(g.canvas, 0, 0);
      if (bloom) {
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = 0.7;
        ctx.filter = `blur(${(bloom * S * k + defocus).toFixed(1)}px)`;
        ctx.drawImage(g.canvas, 0, 0);
        ctx.globalAlpha = 1;
      }
      ctx.filter = "none";
      ctx.globalCompositeOperation = "source-over";
    }
  });

  ctx.restore();
}

/** The frame: light falls off to the corners, and the grain of the stock over everything. */
export function finish(ctx: CanvasRenderingContext2D, look: Look, frame: number) {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (look.vignette) {
    const v = ctx.createRadialGradient(cw / 2, ch / 2, ch * 0.35, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.6);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, `rgba(0,0,0,${look.vignette})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, cw, ch);
  }
  if (look.grain) {
    // the grain is in the stock, so it moves with every frame rather than sitting on the lens
    const texture = ctx.createPattern(grain() as CanvasImageSource, "repeat")!;
    const r = rng(`stock/${frame}`);
    texture.setTransform(new DOMMatrix().translate(r.range(0, 256), r.range(0, 256)));
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = look.grain;
    ctx.fillStyle = texture;
    ctx.fillRect(0, 0, cw, ch);
  }
  ctx.restore();
}
