import type { Rng } from "../music/rng.ts";
import type { Palette, Paper } from "../record/palette.ts";
import type { Shape } from "./paper.ts";

/** What a scene is built from: the sheet size, the record's colours and its own random stream. */
export interface Stage {
  w: number;
  h: number;
  /** Shortest side. */
  u: number;
  pal: Palette;
  r: Rng;
  title: string;
  /** Seconds per beat, for things that step on the beat. */
  spb: number;
}

/** A scene at `t` seconds (and `beat` beats) after its cut. Both are already stepped to twos. */
export type Scene = (t: number, beat: number) => Shape[];
export type Comp = (s: Stage) => Scene;

const TAU = Math.PI * 2;
const ease = (k: number) => 1 - (1 - Math.max(0, Math.min(1, k))) ** 3;
/** 0 → 1 as a piece slides in after the cut (with an optional delay). */
const land = (t: number, delay = 0, dur = 0.5) => ease((t - delay) / dur);
const dark = (pal: Palette): Paper => (pal.ground === "ink" || pal.ground === "night" ? pal.second : "ink");

/** A sheet split on a slant, a tall bar and a dark disc: the title-card look. */
const split: Comp = ({ w, h, u, pal, r }) => {
  const x0 = r.range(0.34, 0.48) * w;
  const x1 = x0 - r.range(0.1, 0.2) * w;
  const bx = r.range(0.58, 0.7) * w;
  const bw = r.range(0.18, 0.24) * u;
  const cr = bw * r.range(0.62, 0.78);
  return (t) => {
    const k = land(t);
    const drift = t * u * 0.006;
    return [
      { id: "slab", kind: "poly", color: dark(pal) === pal.ground ? pal.second : dark(pal), pts: [[-w * (1 - k), -10], [x0 - w * (1 - k), -10], [x1 - w * (1 - k), h + 10], [-w * (1 - k), h + 10]] },
      { id: "bar", kind: "rect", color: pal.main, x: bx, y: h * 0.12 + (1 - k) * h - drift, w: bw, h: h },
      { id: "disc", kind: "circle", color: dark(pal), x: bx + bw / 2, y: h * 0.12 + cr * 1.15 + drift * 0.5, r: cr * land(t, 0.15) },
    ];
  };
};

/** A low sun or moon going down behind the horizon, its reflection broken on the water. */
const horizon: Comp = ({ w, h, u, pal, r }) => {
  const cx = r.range(0.35, 0.65) * w;
  const R = r.range(0.24, 0.32) * u;
  const line = h * r.range(0.56, 0.64);
  const bars = Array.from({ length: 5 }, (_, i) => ({ y: line + u * (0.04 + i * 0.045), w: R * (1.5 - i * 0.22) }));
  return (t, beat) => {
    const sink = line - R * 0.55 + t * u * 0.01;
    return [
      { id: "sun", kind: "circle", color: pal.main, x: cx, y: sink + (1 - land(t)) * R, r: R },
      { id: "sea", kind: "rect", color: pal.second, x: -10, y: line, w: w + 20, h: h - line + 10 },
      { id: "line", kind: "rect", color: pal.accent, x: -10, y: line - u * 0.006, w: (w + 20) * land(t, 0.1, 0.8), h: u * 0.012 },
      ...bars.map((b, i): Shape => ({
        id: `glint${i}`,
        kind: "rect",
        color: pal.main,
        x: cx - b.w / 2 + Math.sin(beat * 1.7 + i * 2) * u * 0.02,
        y: b.y,
        w: b.w * land(t, 0.2 + i * 0.08),
        h: u * 0.014,
      })),
    ];
  };
};

/** Light through blinds, and somebody standing in it. */
const blinds: Comp = ({ w, h, u, pal, r }) => {
  const n = r.int(5, 7);
  const slope = r.range(0.25, 0.45) * (r.chance(0.5) ? 1 : -1);
  const gap = (w + h) / n;
  const head = { x: r.range(0.3, 0.7) * w, y: h * 0.48 };
  const hr = u * r.range(0.09, 0.12);
  return (t) => {
    const slide = t * u * 0.012;
    const stripes: Shape[] = Array.from({ length: n + 2 }, (_, i) => {
      const x = -h + i * gap + slide;
      const bw = gap * 0.46;
      return { id: `slat${i}`, kind: "poly", color: pal.main, flat: true, alpha: 0.92 * land(t, i * 0.04), pts: [[x, -10], [x + bw, -10], [x + bw + h * slope, h + 10], [x + h * slope, h + 10]] };
    });
    return [
      ...stripes,
      { id: "head", kind: "circle", color: pal.ground, x: head.x, y: head.y + (1 - land(t, 0.2)) * h * 0.5, r: hr },
      { id: "shoulders", kind: "sector", color: pal.ground, x: head.x, y: h + u * 0.02 + (1 - land(t, 0.2)) * h * 0.5, r0: 0, r1: hr * 3.2, a0: Math.PI, a1: TAU },
      { id: "brim", kind: "rect", color: pal.ground, x: head.x - hr * 1.7, y: head.y - hr * 0.55 + (1 - land(t, 0.3)) * h * 0.5, w: hr * 3.4, h: hr * 0.32, rot: slope * 0.08 },
      { id: "crown", kind: "rect", color: pal.ground, x: head.x - hr * 0.95, y: head.y - hr * 1.35 + (1 - land(t, 0.3)) * h * 0.5, w: hr * 1.9, h: hr * 0.9 },
    ];
  };
};

/** Tracks to the vanishing point, sleepers coming at you on the beat, a light far off. */
const rails: Comp = ({ w, h, u, pal, r }) => {
  const vx = w * r.range(0.4, 0.6);
  const vy = h * r.range(0.36, 0.44);
  const spread = w * 0.9;
  return (t, beat) => {
    const grow = land(t, 0, 0.8);
    const shapes: Shape[] = [
      { id: "plain", kind: "poly", color: pal.second, pts: [[-10, vy], [w + 10, vy], [w + 10, h + 10], [-10, h + 10]] },
    ];
    // sleepers: perspective spacing, advancing one step per beat
    const phase = beat % 1;
    for (let i = 0; i < 9; i++) {
      const d = (i + phase) / 9;
      const y = vy + (h - vy) * d * d * grow;
      const half = (spread / 2) * d * d * 1.2;
      shapes.push({ id: `sleeper${i}`, kind: "rect", color: pal.ground, x: vx - half, y, w: half * 2, h: Math.max(2, u * 0.03 * d * d) });
    }
    for (const side of [-1, 1]) {
      shapes.push({ id: `rail${side}`, kind: "poly", color: pal.main, pts: [[vx + side * u * 0.004, vy], [vx + side * u * 0.012, vy], [vx + side * (spread * 0.42 + u * 0.03), vy + (h - vy) * grow + 10], [vx + side * spread * 0.42, vy + (h - vy) * grow + 10]] });
    }
    shapes.push({ id: "lamp", kind: "circle", color: pal.accent, x: vx, y: vy - u * 0.02, r: u * (0.015 + t * 0.006) });
    return shapes;
  };
};

/** One disc sliding across another. */
const eclipse: Comp = ({ w, h, u, pal, r }) => {
  const R = r.range(0.22, 0.3) * u;
  const cy = h * r.range(0.42, 0.55);
  const cx = w * r.range(0.4, 0.6);
  const dir = r.chance(0.5) ? 1 : -1;
  return (t) => [
    { id: "ring", kind: "ring", color: pal.accent, x: cx, y: cy, r: R * 1.18 * land(t, 0.1), inner: R * 1.12 * land(t, 0.1) },
    { id: "disc", kind: "circle", color: pal.main, x: cx, y: cy, r: R * land(t) },
    { id: "moon", kind: "circle", color: dark(pal) === pal.main ? pal.second : dark(pal), x: cx + dir * (R * 2.2 - t * u * 0.04), y: cy - R * 0.08, r: R },
  ];
};

/** Steps going up, and a ball taking one a beat. */
const stairs: Comp = ({ w, h, u, pal, r }) => {
  const n = r.int(5, 7);
  const sw = w / n;
  const rise = (h * 0.5) / n;
  const flip = r.chance(0.5);
  const X = (x: number) => (flip ? w - x : x);
  return (t, beat) => {
    const step = Math.floor(beat) % n;
    const f = beat % 1;
    const bx = X(step * sw + sw * (0.5 + f));
    const by = h - (step + 1) * rise - u * 0.045 - Math.sin(f * Math.PI) * rise * 1.2;
    return [
      { id: "moon", kind: "circle", color: pal.main, x: X(w * 0.78), y: h * 0.22, r: u * 0.13 * land(t, 0.2) },
      ...Array.from({ length: n }, (_, i): Shape => {
        const top = h - (i + 1) * rise;
        return { id: `step${i}`, kind: "rect", color: pal.second, x: flip ? w - (i + 1) * sw : i * sw, y: top + (1 - land(t, i * 0.05)) * h, w: sw + 1, h: h - top + 10 };
      }),
      { id: "ball", kind: "circle", color: pal.accent, x: bx, y: by, r: u * 0.045 * land(t, 0.3) },
    ];
  };
};

/** A lit doorway with a figure in it, light spilling on the floor. */
const doorway: Comp = ({ w, h, u, pal, r }) => {
  const dx = w * r.range(0.38, 0.62);
  const dw = u * r.range(0.24, 0.3);
  const top = h * 0.16;
  const floor = h * 0.7;
  const s = (floor - top) / 6;
  return (t) => {
    const open = land(t, 0, 0.9);
    const lean = Math.sin(t * 0.8) * u * 0.002;
    return [
      { id: "spill", kind: "poly", color: pal.main, alpha: 0.85, flat: true, pts: [[dx - (dw / 2) * open, floor], [dx + (dw / 2) * open, floor], [dx + dw * 1.6 * open, h + 10], [dx - dw * 1.6 * open, h + 10]] },
      { id: "door", kind: "rect", color: pal.main, x: dx - (dw / 2) * open, y: top, w: dw * open, h: floor - top },
      { id: "coat", kind: "poly", color: pal.ground, pts: [[dx + lean - s * 0.35, floor - s * 4.2], [dx + lean + s * 0.35, floor - s * 4.2], [dx + s * 0.75, floor], [dx - s * 0.75, floor]] },
      { id: "head", kind: "circle", color: pal.ground, x: dx + lean, y: floor - s * 4.55, r: s * 0.36 },
      { id: "brim", kind: "rect", color: pal.ground, x: dx + lean - s * 0.62, y: floor - s * 4.85, w: s * 1.24, h: s * 0.12 },
      { id: "crown", kind: "rect", color: pal.ground, x: dx + lean - s * 0.34, y: floor - s * 5.2, w: s * 0.68, h: s * 0.38 },
      { id: "shadow", kind: "poly", color: pal.ground, alpha: 0.7, flat: true, pts: [[dx - s * 0.6, floor], [dx + s * 0.6, floor], [dx + s * 1.4, floor + (h - floor) * 0.8 * open], [dx - s * 0.2, floor + (h - floor) * 0.8 * open]] },
    ];
  };
};

/** Rain on twos and an umbrella. */
const rain: Comp = ({ w, h, u, pal, r }) => {
  const drops = Array.from({ length: 46 }, () => ({ x: r.range(-0.1, 1.1) * w, y: r.next() * h, len: r.range(0.04, 0.09) * u, speed: r.range(0.5, 0.8) * h }));
  const cx = w * r.range(0.35, 0.65);
  const cy = h * r.range(0.5, 0.58);
  const R = u * r.range(0.26, 0.32);
  const slant = 0.2;
  return (t) => [
    ...drops.map((d, i): Shape => {
      const y = ((d.y + t * d.speed) % (h + d.len * 2)) - d.len;
      return { id: `drop${i}`, kind: "rect", color: pal.main, flat: true, alpha: 0.75, x: d.x - y * slant, y, w: u * 0.005, h: d.len, rot: -slant };
    }),
    { id: "canopy", kind: "sector", color: pal.second, x: cx, y: cy + (1 - land(t)) * h, r0: 0, r1: R, a0: Math.PI, a1: TAU },
    { id: "pole", kind: "rect", color: pal.second, x: cx - u * 0.007, y: cy + (1 - land(t)) * h, w: u * 0.014, h: R * 0.95 },
    { id: "hook", kind: "sector", color: pal.second, x: cx - R * 0.08, y: cy + R * 0.95 + (1 - land(t)) * h, r0: R * 0.06, r1: R * 0.1, a0: 0, a1: Math.PI },
  ];
};

/** A record turning, at 33 a minute. */
const record: Comp = ({ w, h, u, pal, r }) => {
  const R = u * r.range(0.36, 0.44);
  const cx = w * r.range(0.45, 0.62);
  const cy = h * 0.5;
  const vinyl = dark(pal) === pal.ground ? pal.second : dark(pal);
  return (t) => {
    const a = t * (33.3 / 60) * TAU;
    const k = land(t, 0, 0.7);
    const x = cx + (1 - k) * w * 0.6;
    return [
      { id: "vinyl", kind: "circle", color: vinyl, x, y: cy, r: R },
      ...[0.88, 0.76, 0.64, 0.52].map((g, i): Shape => ({ id: `groove${i}`, kind: "ring", color: pal.ground, alpha: 0.35, flat: true, x, y: cy, r: R * g, inner: R * (g - 0.012) })),
      { id: "label", kind: "circle", color: pal.main, x, y: cy, r: R * 0.34 },
      { id: "mark", kind: "sector", color: pal.accent, flat: true, x, y: cy, r0: R * 0.1, r1: R * 0.3, a0: a, a1: a + 0.9 },
      { id: "hole", kind: "circle", color: pal.ground, flat: true, x, y: cy, r: R * 0.035 },
    ];
  };
};

/** One letter of the title, far too big for the frame. */
const letter: Comp = ({ w, h, u, pal, r, title }) => {
  const letters = [...title.toUpperCase()].filter((c) => /[A-Z]/.test(c));
  const ch = r.pick(letters.length ? letters : ["B"]);
  const size = u * r.range(1.1, 1.4);
  const x = w * r.range(0.35, 0.65);
  const barY = h * r.range(0.25, 0.75);
  return (t) => [
    { id: "bar", kind: "rect", color: pal.second, x: -10 - (1 - land(t, 0.15)) * w, y: barY, w: w + 20, h: u * 0.1 },
    { id: "letter", kind: "text", color: pal.main, text: ch, x: x - t * u * 0.01, y: h * 0.5 + size * 0.36 + (1 - land(t)) * h, size, align: "center" },
    { id: "dot", kind: "circle", color: pal.accent, x: w * 0.82, y: barY - u * 0.08, r: u * 0.035 * land(t, 0.3) },
  ];
};

/** A block of flats at night, lights going on and off on the beat. */
const windows: Comp = ({ w, h, u, pal, r }) => {
  const cols = w > h ? 7 : 4;
  const rows = 6;
  const bx = w * 0.12;
  const bw = w * 0.76;
  const top = h * 0.28;
  const cw = bw / cols;
  const rh = (h - top) / rows;
  const seed = r.next();
  return (t, beat) => {
    const shapes: Shape[] = [
      { id: "moon", kind: "circle", color: pal.accent, x: w * 0.8, y: h * 0.14, r: u * 0.06 * land(t, 0.3) },
      { id: "block", kind: "rect", color: pal.second, x: bx, y: top + (1 - land(t)) * h, w: bw, h: h },
    ];
    const step = Math.floor(beat);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const v = Math.sin((i * 12.9898 + j * 78.233 + seed * 43.1) * 43758.5453);
        const flip = Math.sin((i * 3.1 + j * 7.7 + step * 0.37 + seed) * 9187.13);
        const on = v - Math.floor(v) > 0.55 !== (flip - Math.floor(flip) > 0.9);
        shapes.push({ id: `w${i}.${j}`, kind: "rect", color: on ? pal.main : pal.ground, flat: !on, x: bx + i * cw + cw * 0.24, y: top + j * rh + rh * 0.22 + (1 - land(t)) * h, w: cw * 0.52, h: rh * 0.5 });
      }
    }
    return shapes;
  };
};

/** Something crossing the frame at speed: a car on a road under the lamps. */
const crossing: Comp = ({ w, h, u, pal, r, spb }) => {
  const road = h * r.range(0.56, 0.66);
  const dir = r.chance(0.5) ? 1 : -1;
  const len = u * 0.42;
  const lamps = 5;
  const bars = 4 * spb;
  return (t) => {
    const p = (t / Math.max(bars, 2)) % 1;
    const x = dir > 0 ? -len + p * (w + len * 2) : w + len - p * (w + len * 2);
    const shapes: Shape[] = [];
    for (let i = 0; i < lamps; i++) {
      const lx = ((i + 0.5) / lamps) * w;
      shapes.push({ id: `post${i}`, kind: "rect", color: pal.second, x: lx, y: road - u * 0.42, w: u * 0.012, h: u * 0.42 });
      shapes.push({ id: `lamp${i}`, kind: "circle", color: pal.accent, x: lx + u * 0.006, y: road - u * 0.43, r: u * 0.022 });
    }
    shapes.push({ id: "road", kind: "rect", color: pal.second, x: -10, y: road, w: w + 20, h: h - road + 10 });
    for (let i = 0; i < 8; i++) shapes.push({ id: `dash${i}`, kind: "rect", color: pal.ground, flat: true, x: ((i / 8) * w - t * dir * u * 0.2 + w * 4) % (w + u * 0.2) - u * 0.1, y: road + (h - road) * 0.5, w: u * 0.1, h: u * 0.012 });
    shapes.push(
      { id: "car", kind: "rect", color: pal.main, x: x - len / 2, y: road - u * 0.13, w: len, h: u * 0.1 },
      { id: "cab", kind: "rect", color: pal.main, x: x - len * 0.25, y: road - u * 0.2, w: len * 0.45, h: u * 0.08 },
      { id: "wheel1", kind: "circle", color: pal.ground, x: x - len * 0.3, y: road - u * 0.025, r: u * 0.04 },
      { id: "wheel2", kind: "circle", color: pal.ground, x: x + len * 0.3, y: road - u * 0.025, r: u * 0.04 },
      { id: "beam", kind: "poly", color: pal.accent, alpha: 0.8, flat: true, pts: [[x + (dir * len) / 2, road - u * 0.1], [x + dir * (len / 2 + u * 0.35), road - u * 0.16], [x + dir * (len / 2 + u * 0.35), road - u * 0.02]] },
    );
    return shapes;
  };
};

/** Quarter circles in a grid, each turning a quarter on the beat. */
const quarters: Comp = ({ w, h, u, pal, r }) => {
  const n = w > h ? 3 : 2;
  const m = w > h ? 2 : 3;
  const size = Math.min(w / n, h / m) * 0.9;
  const ox = (w - size * n) / 2;
  const oy = (h - size * m) / 2;
  const colours = [pal.main, pal.second, pal.accent, pal.main, pal.second, pal.main];
  const turns = Array.from({ length: n * m }, () => r.int(0, 3));
  const every = Array.from({ length: n * m }, () => r.pick([1, 2, 2, 4]));
  return (t, beat) =>
    turns.flatMap((q, i): Shape[] => {
      const cx = ox + (i % n) * size;
      const cy = oy + Math.floor(i / n) * size;
      const quarter = q + Math.floor(beat / every[i]!);
      const corner: [number, number] = [[0, 0], [1, 0], [1, 1], [0, 1]][quarter % 4] as [number, number];
      const a0 = (quarter % 4) * (Math.PI / 2);
      return [
        { id: `tile${i}`, kind: "rect", color: i % 2 ? pal.ground : dark(pal) === pal.ground ? pal.second : dark(pal), x: cx + 2, y: cy + 2, w: (size - 4) * land(t, i * 0.06), h: size - 4, flat: true },
        { id: `q${i}`, kind: "sector", color: colours[i]!, x: cx + corner[0] * size, y: cy + corner[1] * size, r0: 0, r1: (size - 6) * land(t, i * 0.06), a0, a1: a0 + Math.PI / 2 },
      ];
    });
};

/** Smoke rings going up from a cigarette on the edge of a table. */
const smoke: Comp = ({ w, h, u, pal, r }) => {
  const x = w * r.range(0.35, 0.6);
  const table = h * 0.72;
  return (t) => {
    const rings: Shape[] = [];
    for (let i = 0; i < 6; i++) {
      const age = (t * 0.35 + i / 6) % 1;
      const rr = u * (0.03 + age * 0.12);
      rings.push({ id: `puff${i}`, kind: "ring", color: pal.main, flat: true, alpha: 0.85 * (1 - age), x: x + u * 0.04 + Math.sin(age * 5 + i) * u * 0.06 * age, y: table - u * 0.04 - age * h * 0.6, r: rr, inner: rr * 0.78 });
    }
    return [
      ...rings,
      { id: "table", kind: "rect", color: pal.second, x: -10, y: table + (1 - land(t)) * h * 0.4, w: w + 20, h: h },
      { id: "cig", kind: "rect", color: pal.main, x: x - u * 0.16, y: table - u * 0.028, w: u * 0.2, h: u * 0.028 },
      { id: "ember", kind: "rect", color: pal.accent, x: x + u * 0.04, y: table - u * 0.028, w: u * 0.02, h: u * 0.028 },
    ];
  };
};

/** A clock face whose hands move on the beat. */
const clock: Comp = ({ w, h, u, pal, r }) => {
  const R = u * r.range(0.3, 0.36);
  const cx = w * r.range(0.4, 0.6);
  const cy = h * 0.5;
  const start = r.range(0, TAU);
  return (t, beat) => {
    const k = land(t, 0, 0.6);
    const min = start + Math.floor(beat) * (TAU / 60) * 4;
    const hour = start * 0.3 + Math.floor(beat) * (TAU / 720) * 4;
    const hand = (id: string, a: number, len: number, wid: number, color: Paper): Shape => ({ id, kind: "rect", color, x: cx - wid / 2, y: cy - len, w: wid, h: len, rot: a });
    const handAt = (id: string, a: number, len: number, wid: number, color: Paper): Shape => {
      const s = hand(id, 0, len, wid, color) as Extract<Shape, { kind: "rect" }>;
      // rotate about the centre of the face, not the middle of the hand
      return { ...s, x: cx + Math.sin(a) * (len / 2) - wid / 2, y: cy - Math.cos(a) * (len / 2) - len / 2, rot: a };
    };
    return [
      { id: "face", kind: "circle", color: pal.main, x: cx, y: cy, r: R * k },
      ...Array.from({ length: 4 }, (_, i): Shape => handAt(`tick${i}`, (i * TAU) / 4, R * 0.16, u * 0.02, pal.ground)).map((s) => {
        const a = (s as Extract<Shape, { kind: "rect" }>).rot!;
        return { ...s, x: cx + Math.sin(a) * R * 0.8 - u * 0.01, y: cy - Math.cos(a) * R * 0.8 - R * 0.08 } as Shape;
      }),
      handAt("hour", hour, R * 0.5, u * 0.03, dark(pal) === pal.main ? pal.ground : dark(pal)),
      handAt("minute", min, R * 0.78, u * 0.018, pal.accent),
      { id: "pin", kind: "circle", color: pal.ground, x: cx, y: cy, r: u * 0.018 },
    ];
  };
};

export const COMPS = { split, horizon, blinds, rails, eclipse, stairs, doorway, rain, record, letter, windows, crossing, quarters, smoke, clock } satisfies Record<string, Comp>;
export type CompName = keyof typeof COMPS;
