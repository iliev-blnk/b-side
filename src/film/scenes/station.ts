import { beatAt, count, lights } from "../cues.ts";
import { figure, type Pt, spin } from "../rig.ts";
import { type Camera, H, type Layer, type Piece, W } from "../stage.ts";
import { BASE, breathe, clamp01, frac, frame, lerp, marks, out3, pool, type Scene, type Shot, shuffle, view, weather } from "./kit.ts";

/**
 * The platform: under the canopy, the clock hanging from it, the band's bill on the wall. The
 * train comes in and stands, the figure gets on, and it pulls out with them in a window.
 */

const PLAT = BASE;
/** The line the train runs on, just below the platform's edge. */
const TRACK = BASE + 12;
const FX = 1050;
const CLOCK: Pt = [1560, 250];
const LOCO = 900;
const CAR = 1150;

/** A streamlined engine and three cars behind it, nose at `x`, running to the left. */
function train(nose: number, step: number): Piece[] {
  const out: Piece[] = [];
  const top = TRACK - 400;
  const R = 230;
  const front: [number, number][] = [[nose + 40, TRACK], [nose + LOCO, TRACK], [nose + LOCO, top], [nose + R, top]];
  for (let k = 1; k <= 8; k++) {
    const a = (k / 8) * (Math.PI / 2);
    front.push([nose + R - Math.sin(a) * R, top + R - Math.cos(a) * R]);
  }
  front.push([nose, TRACK - 60]);
  out.push({ id: "loco", kind: "poly", ink: "near", pts: front });
  out.push({ id: "loco/stripe", kind: "rect", ink: "trim", x: nose + 30, y: TRACK - 150, w: LOCO - 30, h: 12, edge: 0.3 });
  out.push({ id: "loco/cab", kind: "rect", ink: "lit", x: nose + 300, y: top + 50, w: 110, h: 90, edge: 0.4 });
  out.push({ id: "loco/cab2", kind: "rect", ink: "lit", x: nose + 440, y: top + 50, w: 110, h: 90, edge: 0.4 });
  out.push({ id: "loco/lamp", kind: "circle", ink: "light", x: nose + 26, y: TRACK - 190, r: 20 });
  out.push({ id: "loco/beam", kind: "poly", ink: "light", alpha: 0.16, pts: [[nose + 14, TRACK - 210], [nose + 14, TRACK - 170], [nose - 1400, TRACK + 80], [nose - 1400, TRACK - 420]] });
  for (let c = 0; c < 3; c++) {
    const x = nose + LOCO + 24 + c * (CAR + 24);
    out.push({ id: `car${c}`, kind: "rect", ink: "near", x, y: TRACK - 370, w: CAR, h: 370 });
    out.push({ id: `car${c}/roof`, kind: "rect", ink: "back", x: x + 20, y: TRACK - 392, w: CAR - 40, h: 24, edge: 0.4 });
    out.push({ id: `car${c}/stripe`, kind: "rect", ink: "trim", x, y: TRACK - 150, w: CAR, h: 10, edge: 0.3 });
    out.push({ id: `car${c}/doorA`, kind: "rect", ink: "back", x: x + 30, y: TRACK - 330, w: 90, h: 300, edge: 0.3 });
    out.push({ id: `car${c}/doorB`, kind: "rect", ink: "back", x: x + CAR - 120, y: TRACK - 330, w: 90, h: 300, edge: 0.3 });
    for (let i = 0; i < 7; i++) {
      const lit = frac((c * 7 + i) * 0.618 + step * 0.09) > 0.1;
      out.push({ id: `car${c}/w${i}`, kind: "rect", ink: lit ? "lit" : "back", x: x + 150 + i * 122, y: TRACK - 310, w: 100, h: 130, edge: 0.4 });
    }
  }
  return out;
}

/** Where the window they sit at ends up, from the nose. */
const SEAT = LOCO + 24 + 150 + 2 * 122 + 50;

/** Steam off the engine: puffs left where they were let go, rising and spreading. */
function steam(noseAt: (t: number) => number, t: number, t0: number): Piece[] {
  const out: Piece[] = [];
  for (let e = Math.floor(t / 0.22) * 0.22; e > t - 3 && e >= t0; e -= 0.22) {
    const age = t - e;
    const n = Math.round(e / 0.22);
    out.push({ id: `steam/${n}`, kind: "circle", ink: "smoke", alpha: 0.14 * (1 - age / 3), x: noseAt(e) + 300 + age * 70 + Math.sin(n) * 20, y: TRACK - 420 - age * 70, r: 26 + age * 46 });
  }
  return out;
}

/** The canopy over the platform, its columns, and the clock on its rod. */
function canopy(s: Shot, t: number): Piece[] {
  const out: Piece[] = [
    { id: "canopy", kind: "rect", ink: "near", x: -2000, y: -800, w: 8000, h: 880 },
    { id: "canopy/edge", kind: "rect", ink: "back", x: -2000, y: 70, w: 8000, h: 18, edge: 0.4 },
  ];
  for (let x = -1200, i = 0; x < 5000; x += 900, i++) {
    out.push({ id: `col${i}`, kind: "rect", ink: "near", x: x - 20, y: 80, w: 40, h: PLAT - 80, edge: 0.4 });
    out.push({ id: `col${i}/brace`, kind: "poly", ink: "near", pts: [[x - 150, 88], [x + 150, 88], [x + 18, 200], [x - 18, 200]] });
  }
  const [cx, cy] = CLOCK;
  out.push({ id: "clock/rod", kind: "rect", ink: "near", x: cx - 4, y: 80, w: 8, h: cy - 80 - 90, edge: 0.2 });
  out.push({ id: "clock/rim", kind: "circle", ink: "near", x: cx, y: cy, r: 94 });
  out.push({ id: "clock/face", kind: "circle", ink: "paper", x: cx, y: cy, r: 82 });
  for (let i = 0; i < 12; i++) {
    const [x, y] = spin([cx, cy - 70], [cx, cy], (i / 12) * Math.PI * 2);
    out.push({ id: `clock/tick${i}`, kind: "rect", ink: "near", x: x - 2.5, y: y - 6, w: 5, h: i % 3 ? 10 : 18, rot: (i / 12) * Math.PI * 2, edge: 0.1 });
  }
  // a minute to the bar, from twenty to midnight; the second hand on the beats
  const min = 40 + count(s.c.bars, t) * 0.5;
  const hand = (name: string, a: number, len: number, w: number, ink: "near" | "trim") => {
    const p = (x: number, y: number) => spin([cx + x, cy + y], [cx, cy], a);
    out.push({ id: `clock/${name}`, kind: "poly", ink, pts: [p(-w, 12), p(w, 12), p(w * 0.4, -len), p(-w * 0.4, -len)], edge: 0.1 });
  };
  hand("hour", ((11 + min / 60) / 12) * Math.PI * 2, 44, 6, "near");
  hand("minute", (min / 60) * Math.PI * 2, 68, 4.5, "near");
  hand("second", (Math.floor(beatAt(s.c, t)) / 60) * Math.PI * 2, 72, 1.5, "trim");
  out.push({ id: "clock/pin", kind: "circle", ink: "near", x: cx, y: cy, r: 6 });
  return out;
}

/** The far wall: tall lit windows, and the band's bill pasted up between them. */
function wall(s: Shot): Piece[] {
  const out: Piece[] = [{ id: "wall", kind: "rect", ink: "mid", x: -2500, y: -200, w: 9000, h: 1400 }];
  for (let i = 0; i < 8; i++) {
    const x = -1400 + i * 760;
    out.push({ id: `wall/win${i}`, kind: "poly", ink: "farLit", alpha: 0.7, pts: [[x, 560], [x, 260], [x + 60, 200], [x + 120, 260], [x + 120, 560]] });
  }
  const bx = 920;
  const name = s.cast.band.name.toUpperCase();
  out.push({ id: "bill", kind: "rect", ink: "paper", x: bx, y: 250, w: 260, h: 340, edge: 0.4 });
  out.push({ id: "bill/band", kind: "rect", ink: "label", x: bx + 18, y: 270, w: 224, h: 120, edge: 0.3 });
  out.push({ id: "bill/tonight", kind: "text", ink: "near", text: "TONIGHT", x: bx + 130, y: 440, size: 34, weight: 800, align: "center", spacing: 0.1 });
  out.push({ id: "bill/name", kind: "text", ink: "near", text: name, x: bx + 130, y: 500, size: Math.min(26, 420 / name.length), weight: 700, align: "center" });
  return out;
}

type PlatformSetup = "wide" | "clock" | "face" | "windows";

export const platformScene: Scene = (s) => {
  const spb = 60 / s.c.bpm;
  const bar = spb * s.track.meter;
  const tArr = s.t0 + bar * 0.5;
  const dArr = Math.max(bar * 2, Math.min(bar * 3.5, (s.t1 - s.t0) * 0.4));
  const ms = marks(s, 0.7);
  const board = Math.max(ms.length > 1 ? ms.at(-1)! : ms[0]!, tArr + dArr + bar * 0.5);
  const depart = board + bar * 0.75;
  const stopAt = FX - SEAT + 40;
  const noseAt = (t: number) => {
    if (t < depart) return lerp(stopAt + 4200, stopAt, out3((t - tArr) / dArr));
    return stopAt - 220 * (t - depart) ** 2;
  };
  const order = shuffle(s.r, ["clock", "face", "windows"] as PlatformSetup[]);
  return (t) => {
    const i = count(s.cuts, t);
    const gone = t >= board;
    let setup: PlatformSetup = i === 0 ? "wide" : order[(i - 1) % 3]!;
    if (gone && setup === "face") setup = "windows";
    const b = breathe(s, t);
    const nose = noseAt(t);
    let cam: Camera;
    if (setup === "wide") cam = frame(FX + 300, PLAT - 330, lerp(0.92, 0.98, clamp01((t - s.t0) / (s.t1 - s.t0))) * b, W * 0.45, H * 0.55);
    else if (setup === "clock") cam = frame(CLOCK[0], CLOCK[1] + 10, 3.3 * b, W / 2, H * 0.45, 1, 0.03);
    else if (setup === "face") cam = frame(FX + 30, PLAT - 250, 2.8 * b, W * 0.38, H * 0.5, 1, 0.04);
    else cam = frame(FX + 360, PLAT - 240, 1.6 * b, W * 0.5, H * 0.5, 1.12, 0, 1.12);

    const people: Piece[] = [];
    const aboard: Piece[] = [];
    if (!gone) {
      const fig = figure({ id: "fig", x: FX, y: PLAT + 4, scale: 1, facing: 1 }, { walk: null, look: 0.06, wind: 0.15, scarf: true, hat: s.cast.hat, coat: "long" });
      people.push(pool("fig/shadow", FX + 4, PLAT + 6, 40, 5), ...fig.pieces);
    } else {
      const sat = figure({ id: "aboard", x: nose + SEAT, y: TRACK - 90, scale: 0.78, facing: -1 }, { walk: null, sit: true, look: 0.05, hat: s.cast.hat, scarf: true });
      aboard.push(...sat.pieces);
    }
    const rain = weather(s, t, cam, { amount: 0.4 });
    const layers: Layer[] = [
      { id: "wall", z: 1.6, pieces: wall(s), cast: true },
      { id: "steam", z: 1.14, pieces: steam(noseAt, t, s.t0) },
      { id: "train", z: 1.12, pieces: [...train(nose, lights(s.c, t)), ...aboard], cast: true },
      ...rain.slice(0, 1),
      { id: "platform", z: 1.02, pieces: [{ id: "plat", kind: "rect", ink: "street", x: -2500, y: PLAT, w: 9000, h: 800 }, { id: "plat/line", kind: "rect", ink: "paper", alpha: 0.5, x: -2500, y: PLAT + 6, w: 9000, h: 8, edge: 0.3 }, ...canopy(s, t)], cast: true },
      { id: "fig", z: 1, pieces: people, cast: true },
      { id: "posts", z: 0.66, pieces: Array.from({ length: 6 }, (_, k): Piece => ({ id: `npost${k}`, kind: "rect", ink: "near", x: -900 + k * 1300, y: -400, w: 60, h: 2000, edge: 0.4 })) },
    ];
    return view(layers, cam);
  };
};
