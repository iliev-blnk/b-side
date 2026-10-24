import { spin } from "../rig.ts";
import { H, type Layer, type Piece, W } from "../stage.ts";
import { clamp01, frame, lerp, type Scene, sky, town, view } from "./kit.ts";

/**
 * The last shot of the night. The camera goes up to the moon and closes in on it through the last
 * chord, and when the chord has gone the moon is the record, turning, with the arm in the run-out.
 */

/** Where the record sits, and how big: the moon is pushed in to exactly this. */
const RC: [number, number] = [1250, 500];
const R = 380;
const MOON = 64;
/** 33⅓ turns a minute. */
const SPIN = (Math.PI * 2 * 100) / 3 / 60;

function record(name: string, title: string, a: number, arm: number): Piece[] {
  const [cx, cy] = RC;
  const out: Piece[] = [{ id: "disc", kind: "circle", ink: "near", x: cx, y: cy, r: R }];
  // the grooves, with the gaps between the three tracks
  for (let r = R - 14, i = 0; r > 158; r -= 8, i++) {
    if (Math.abs(r - 300) < 7 || Math.abs(r - 228) < 7) continue;
    out.push({ id: `groove${i}`, kind: "ring", ink: "back", alpha: 0.55, x: cx, y: cy, r, inner: r - 2 });
  }
  // the light on the vinyl stays where it is while the record turns under it
  for (const [i, a0] of [-2.5, 0.64].entries()) out.push({ id: `sheen${i}`, kind: "sector", ink: "moon", alpha: 0.08, x: cx, y: cy, r0: 160, r1: R - 6, a0, a1: a0 + 0.32 });
  out.push({ id: "label", kind: "circle", ink: "label", x: cx, y: cy, r: 142 });
  const line = (id: string, text: string, dy: number, size: number, weight: number) => {
    const [x, y] = spin([cx, cy + dy], [cx, cy], a);
    out.push({ id, kind: "text", ink: "near", text, x, y, size, weight, rot: a, align: "center", spacing: 0.06 });
  };
  line("label/band", name.toUpperCase(), -52, Math.min(26, 300 / name.length), 800);
  line("label/side", "SIDE A", -12, 15, 600);
  line("label/title", title, 62, Math.min(20, 330 / title.length), 600);
  out.push({ id: "spindle", kind: "circle", ink: "paper", x: cx, y: cy, r: 9 });
  // the arm, from its pivot off the top right, its head in the groove at radius `arm`
  const pivot: [number, number] = [cx + R + 150, cy - R + 30];
  const d = Math.hypot(pivot[0] - cx, pivot[1] - cy);
  const L = 560;
  const ang = Math.atan2(cy - pivot[1], cx - pivot[0]) + Math.acos(Math.max(-1, Math.min(1, (L * L + d * d - arm * arm) / (2 * L * d))));
  const head: [number, number] = [pivot[0] + Math.cos(ang) * L, pivot[1] + Math.sin(ang) * L];
  const nx = -Math.sin(ang) * 7;
  const ny = Math.cos(ang) * 7;
  out.push({ id: "arm", kind: "poly", ink: "brass", pts: [[pivot[0] + nx, pivot[1] + ny], [pivot[0] - nx, pivot[1] - ny], [head[0] - nx, head[1] - ny], [head[0] + nx, head[1] + ny]], edge: 0.2 });
  out.push({ id: "arm/head", kind: "rect", ink: "back", x: head[0] - 26, y: head[1] - 18, w: 52, h: 36, rot: ang, edge: 0.3 });
  out.push({ id: "arm/base", kind: "circle", ink: "back", x: pivot[0], y: pivot[1], r: 54 });
  out.push({ id: "arm/pin", kind: "circle", ink: "brass", x: pivot[0], y: pivot[1], r: 18 });
  return out;
}

export const recordScene: Scene = (s) => {
  const cut = s.track.lengthSec;
  const [mx, my] = s.world.moon;
  const grow = R / MOON;
  return (t) => {
    if (t < cut) {
      // up to the moon, slowly, then faster as the chord dies, until it is the size of the record
      const k = clamp01((t - s.t0) / (cut - s.t0));
      const zoom = 1.1 * (grow / 1.1) ** (k ** 1.7);
      const cam = frame(mx, my, zoom, lerp(W / 2 + 120, RC[0], k), lerp(H * 0.42, RC[1], k), 14, 0, 14);
      const layers: Layer[] = [{ id: "sky", z: 14, pieces: sky(s.world, t, { beams: false, moon: MOON }) }, ...town(s, t, { lit: 0.2 })];
      return view(layers, cam);
    }
    const u = t - cut;
    const arm = Math.max(152, 168 - u * 3);
    const cam = frame(W / 2, H / 2, lerp(1, 1.035, clamp01(u / 8)), W / 2, H / 2, 1);
    const layers: Layer[] = [
      { id: "ground", z: 1.4, pieces: [{ id: "ground", kind: "rect", ink: "sky", x: -400, y: -400, w: W + 800, h: H + 800 }] },
      { id: "record", z: 1, pieces: record(s.cast.band.name, s.track.title, u * SPIN, arm), cast: true },
    ];
    return view(layers, cam, -1);
  };
};
