import { type Rng, rng } from "../../music/rng.ts";
import { drawSkyline, lamp, lampLight, skyline, smoke, wire } from "../city.ts";
import { beatAt, count, glow, lights as windowsOn, since } from "../cues.ts";
import { figure, type Pt } from "../rig.ts";
import { type Camera, H, type Layer, type Piece, seen, W } from "../stage.ts";
import { BASE, blend, breathe, clamp01, frac, frame, inOut, lerp, marks, out3, pool, type Scene, setupSpan, type Shot, shift, shuffle, sky, town, view, weather } from "./kit.ts";
import { set } from "./street.ts";

/**
 * The city at large. The skyline that opens and closes each act; the tram, pulling in and then
 * from the inside with the street running past; the roofs, stood at the edge or run across; and
 * the bridge over the river, the lamps and the moon broken up in the water.
 */

/** Steps walked since the shot began: on the beat, at the half time when the tune is fast. */
function steps(s: Shot, t: number, run = false): number {
  const scale = s.c.bpm > 110 ? (run ? 0.6 : 0.5) : 1;
  return (beatAt(s.c, t) - beatAt(s.c, s.t0)) * (run ? 2 : 1) * scale;
}

/* ------------------------------------------------------------------ the skyline */

type SkySetup = "tilt" | "tower" | "sign";

/**
 * The city from above the street. Going down, the camera starts in the sky with the moon and the
 * searchlights and comes down the towers to the street as the figure walks in; going up, it
 * leaves them on the street and rises to the moon. Between, a tower's windows on the chords and
 * the sign.
 */
export const skylineScene: Scene = (s) => {
  const up = s.variant === "up";
  const last = s.cuts.length;
  const tower = [...s.world.mid.buildings].filter((b) => b.x > 200 && b.x < 2400 && b.windows.length > 24).sort((a, b) => a.top - b.top)[0] ?? s.world.mid.buildings[0]!;
  const order = shuffle(s.r, ["tower", "sign"] as SkySetup[]);
  const pan = s.r.range(-260, 260);
  return (t) => {
    const sp = setupSpan(s, t);
    const setup: SkySetup = (up ? sp.i === last : sp.i === 0) ? "tilt" : order[sp.i % 2]!;
    const b = breathe(s, t);
    let cam: Camera;
    if (setup === "tilt") {
      const high = frame(900 + pan, BASE - 1750, 0.92 * b, W / 2, H / 2, 6);
      const low = frame(1250 + pan * 0.3, BASE - 280, b, W / 2, H * 0.6, 1);
      cam = blend(high, low, inOut(up ? 1 - sp.k * 1.15 : sp.k * 1.15 - 0.1));
    } else if (setup === "tower") cam = frame(tower.x + tower.w / 2, lerp(tower.top + 240, tower.top + 140, sp.k), 2.1 * b, W * 0.62, H * 0.42, 3, 0, 3);
    else cam = frame(s.world.sign[0], s.world.sign[1] + 130, lerp(2.6, 2.8, sp.k) * b, W * 0.4, H * 0.5, 3, 0, 3);

    const fx = (up ? 1150 : 700) + steps(s, t) * 52;
    const fig = figure({ id: "fig", x: fx, y: BASE + 4, scale: 1, facing: 1 }, { walk: steps(s, t) / 2, scarf: true, hat: s.cast.hat });
    const st = set(s, t, -1400, 4400);
    const rain = weather(s, t, cam);
    const layers: Layer[] = [
      { id: "sky", z: 14, pieces: sky(s.world, t) },
      ...town(s, t, { sign: s.world.sign, lit: 0.3 }),
      ...rain.slice(0, 1),
      { id: "street", z: 1.05, pieces: st.street, cast: true },
      { id: "air", z: 1.03, pieces: st.air },
      { id: "fig", z: 1, pieces: [pool("fig/shadow", fx + 4, BASE + 6, 40, 5), ...fig.pieces], cast: true },
      ...rain.slice(1),
    ];
    return view(layers, cam);
  };
};

/* ------------------------------------------------------------------ the tram */

/** The tram's windows, along its side from the front: which are lit moves with the harmony. */
function tramCar(id: string, x: number, y: number, len: number, step: number, wireY: number, open: number): Piece[] {
  const h = 330;
  const top = y - h;
  const out: Piece[] = [
    { id: `${id}/body`, kind: "poly", ink: "near", pts: [[x + 30, y], [x + len, y], [x + len, top + 40], [x + len - 30, top], [x + 60, top], [x, top + 80], [x, y - 40]] },
    { id: `${id}/roof`, kind: "rect", ink: "near", x: x + 140, y: top - 24, w: len - 280, h: 26, edge: 0.4 },
    { id: `${id}/skirt`, kind: "rect", ink: "back", x: x + 14, y: y - 56, w: len - 28, h: 42, edge: 0.3 },
    { id: `${id}/stripe`, kind: "rect", ink: "trim", x: x + 4, y: top + 206, w: len - 8, h: 10, edge: 0.3 },
    // the front: its window, the board above it and the lamp
    { id: `${id}/front`, kind: "poly", ink: "lit", pts: [[x + 14, top + 92], [x + 62, top + 40], [x + 96, top + 40], [x + 96, top + 170], [x + 14, top + 170]] },
    { id: `${id}/board`, kind: "rect", ink: "paper", x: x + 70, y: top + 8, w: 150, h: 26, edge: 0.3 },
    { id: `${id}/lamp`, kind: "circle", ink: "light", x: x + 18, y: y - 84, r: 13 },
    { id: `${id}/beam`, kind: "poly", ink: "light", alpha: 0.18, pts: [[x + 10, y - 96], [x + 10, y - 72], [x - 900, y + 60], [x - 900, y - 150]] },
  ];
  const doorAt = x + 330;
  for (let wx = x + 120, i = 0; wx + 110 < x + len - 40; wx += 132, i++) {
    if (wx > doorAt - 120 && wx < doorAt + 120) continue;
    const lit = frac(i * 0.618 + step * 0.11) > 0.12;
    out.push({ id: `${id}/w${i}`, kind: "rect", ink: lit ? "lit" : "back", x: wx, y: top + 44, w: 110, h: 126, edge: 0.4 });
  }
  // the doors, open a little in the light when it stops
  out.push({ id: `${id}/door`, kind: "rect", ink: "back", x: doorAt - 70, y: top + 40, w: 140, h: h - 70, edge: 0.3 });
  if (open > 0) out.push({ id: `${id}/doorway`, kind: "rect", ink: "lit", x: doorAt - 60 * open, y: top + 44, w: 120 * open, h: h - 80, edge: 0.3 });
  // the pole, trailing back up to the wire
  const px = x + len * 0.62;
  out.push({ id: `${id}/pole`, kind: "poly", ink: "near", pts: [[px - 3, top - 22], [px + 3, top - 22], [px + 263, wireY + 2], [px + 257, wireY + 2]], edge: 0.2 });
  return out;
}

/** The inside of the tram around the screen centre `cx`: bays of window, seats, straps on a rail. */
function inside(cx: number, swing: number): Piece[] {
  const x0 = cx - 1500;
  const x1 = cx + 1500;
  const out: Piece[] = [
    { id: "in/top", kind: "rect", ink: "mid", x: x0, y: -900, w: x1 - x0, h: 1270 },
    { id: "in/below", kind: "rect", ink: "mid", x: x0, y: 744, w: x1 - x0, h: 176 },
    { id: "in/floor", kind: "rect", ink: "street", x: x0, y: 900, w: x1 - x0, h: 700 },
    { id: "in/sill", kind: "rect", ink: "near", x: x0, y: 740, w: x1 - x0, h: 16, edge: 0.4 },
    { id: "in/head", kind: "rect", ink: "near", x: x0, y: 318, w: x1 - x0, h: 14, edge: 0.4 },
    { id: "in/rail", kind: "rect", ink: "brass", alpha: 0.7, x: x0, y: 196, w: x1 - x0, h: 8, edge: 0.2 },
  ];
  for (let i = 0; i < 6; i++) {
    const x = x0 + 160 + i * 540;
    out.push({ id: `in/lamp${i}`, kind: "rect", ink: "light", alpha: 0.75, x: x + 120, y: 60, w: 300, h: 10, edge: 0.3 });
    out.push({ id: `in/pillar${i}`, kind: "rect", ink: "near", x: x - 36, y: 318, w: 72, h: 430, edge: 0.4 });
    out.push({ id: `in/seat${i}`, kind: "rect", ink: "near", x: x + 120, y: 756, w: 28, h: 84, edge: 0.4 });
    out.push({ id: `in/bench${i}`, kind: "rect", ink: "near", x: x + 120, y: 826, w: 250, h: 22, edge: 0.4 });
    out.push({ id: `in/leg${i}`, kind: "rect", ink: "near", x: x + 330, y: 846, w: 14, h: 54, edge: 0.3 });
  }
  for (let i = 0; i < 12; i++) {
    const x = x0 + 60 + i * 270;
    const a = swing * (1 + 0.15 * Math.sin(i * 2.1));
    const end: Pt = [x + Math.sin(a) * 90, 204 + Math.cos(a) * 90];
    out.push({ id: `in/strap${i}`, kind: "poly", ink: "back", pts: [[x - 4, 204], [x + 4, 204], [end[0] + 4, end[1]], [end[0] - 4, end[1]]], edge: 0.2 });
    out.push({ id: `in/handle${i}`, kind: "ring", ink: "back", x: end[0], y: end[1] + 16, r: 18, inner: 12 });
  }
  return out;
}

/** The street going past the windows: lamps whipping by, shopfronts slower, the towers slowest. */
function passing(s: Shot, cam: Camera, step: number): Layer[] {
  const lamps: Piece[] = [];
  const near = seen(1.7, cam);
  for (let k = Math.floor(near.x / 760) - 1; k * 760 < near.x + near.w + 760; k++) {
    const x = k * 760;
    lamps.push({ id: `pass/post${k}`, kind: "rect", ink: "near", x, y: 160, w: 16, h: 1100, edge: 0.4 });
    lamps.push({ id: `pass/light${k}`, kind: "circle", ink: "light", alpha: 0.8, x: x - 30, y: 180, r: 16 });
  }
  const shopsP: Piece[] = [];
  const mid = seen(2.4, cam);
  for (let k = Math.floor(mid.x / 330) - 1; k * 330 < mid.x + mid.w + 330; k++) {
    if (frac(k * 0.618 + step * 0.13) < 0.25) continue;
    shopsP.push({ id: `pass/shop${k}`, kind: "rect", ink: "lit", x: k * 330, y: 640, w: 220, h: 180, edge: 0.5 });
    shopsP.push({ id: `pass/awning${k}`, kind: "rect", ink: "near", x: k * 330 - 20, y: 612, w: 260, h: 30, edge: 0.4 });
  }
  return [
    { id: "pass/shops", z: 2.4, pieces: [{ id: "pass/wall", kind: "rect", ink: "near", x: mid.x - 200, y: 600, w: mid.w + 400, h: 800 }, ...shopsP] },
    { id: "pass/lamps", z: 1.7, pieces: lamps },
  ];
}

type TramSetup = "stop" | "ride" | "face";

/** The tram pulls in at the stop and hides them; then from the inside, sat by the window, riding. */
export const tramScene: Scene = (s) => {
  const FX = 1000;
  const spb = 60 / s.c.bpm;
  const bar = spb * s.track.meter;
  const ms = marks(s, 0.4);
  const rideFrom = ms[0]!;
  const order = shuffle(s.r, ["ride", "face"] as TramSetup[]);
  const LEN = 1700;
  const WIRE = BASE - 560;
  return (t) => {
    const i = count(ms, t);
    const setup: TramSetup = i === 0 ? "stop" : i === 1 ? "ride" : order[i % 2]!;
    const b = breathe(s, t);
    const chord = windowsOn(s.c, t);
    if (setup === "stop") {
      const k = out3((t - s.t0 - bar * 0.4) / (bar * 2.4));
      const tx = lerp(FX + 2600, FX - 330, k);
      const open = clamp01((t - s.t0 - bar * 2.9) / 0.4);
      const cam = frame(FX + 220, BASE - 260, lerp(1.15, 1.25, (t - s.t0) / (rideFrom - s.t0)) * b, W * 0.45, H * 0.58);
      const fig = figure({ id: "fig", x: FX, y: BASE + 4, scale: 1, facing: 1 }, { walk: null, look: 0.05, wind: 0.2, scarf: true, hat: s.cast.hat, coat: "long" });
      const st = set(s, t, -1400, 4400);
      const rain = weather(s, t, cam);
      const stop: Piece[] = [
        { id: "stop/post", kind: "rect", ink: "near", x: FX + 150, y: BASE - 330, w: 10, h: 336, edge: 0.4 },
        { id: "stop/plate", kind: "circle", ink: "label", x: FX + 155, y: BASE - 350, r: 34 },
        { id: "stop/t", kind: "text", ink: "near", text: "T", x: FX + 155, y: BASE - 334, size: 40, weight: 800, align: "center" },
      ];
      const layers: Layer[] = [
        { id: "sky", z: 14, pieces: sky(s.world, t) },
        ...town(s, t, { sign: s.world.sign }),
        ...rain.slice(0, 1),
        { id: "street", z: 1.05, pieces: st.street, cast: true },
        { id: "air", z: 1.03, pieces: st.air },
        { id: "fig", z: 1, pieces: [pool("fig/shadow", FX + 4, BASE + 6, 40, 5), ...fig.pieces, ...stop], cast: true },
        { id: "tram", z: 0.92, pieces: [wire("wire", -2000, 6000, WIRE, "near"), ...tramCar("tram", tx, BASE + 96, LEN, chord, WIRE, open)], cast: true },
        ...rain.slice(1),
      ];
      return view(layers, cam);
    }
    // riding: the inside is carried along with the camera, so only the street moves
    const u = Math.max(0, t - rideFrom);
    const travel = 340 * ((u * u) / (u + 2.5));
    const lurch = since(s.c.kicks, t) < 0.1 ? 3 : 0;
    const swing = 0.16 * Math.sin((beatAt(s.c, t) / 2) * Math.PI) - 0.08 * clamp01(1 - u / 2.5);
    const fx = 960 + travel - 1500 + 160 + 2 * 540 + 120 + 70;
    const fig = figure({ id: "fig", x: fx, y: 900 + lurch, scale: 1, facing: 1 }, { walk: null, sit: true, look: 0.08, scarf: true, hat: s.cast.hat, coat: "long" });
    const cam =
      setup === "ride"
        ? frame(960 + travel, 540 + lurch, 1.0 * b, W / 2, H / 2, 1)
        : frame(fx + 60, fig.top[1] + 110 + lurch, 2.3 * b, W * 0.36, H * 0.5, 1, 0.04);
    const layers: Layer[] = [
      { id: "sky", z: 14, pieces: sky(s.world, t, { beams: false }) },
      ...town(s, t, { lit: 0.32 }),
      ...passing(s, cam, chord),
      { id: "in", z: 1, pieces: [...inside(960 + travel, swing), pool("fig/shadow", fx, 904, 50, 6), ...fig.pieces], cast: true },
    ];
    return view(layers, cam, -1);
  };
};

/* ------------------------------------------------------------------ the roofs */

interface Roof {
  x: number;
  w: number;
  top: number;
  tank: number | null;
  chimneys: number[];
  aerial: number | null;
  skylight: number | null;
}

/** A run of roofs, some joined by a step, some across a gap to be jumped. */
function roofs(r: Rng): Roof[] {
  const out: Roof[] = [];
  for (let x = -1800; x < 11000; ) {
    const w = r.range(700, 1300);
    const at = (lo: number, hi: number) => x + w * r.range(lo, hi);
    out.push({
      x,
      w,
      top: BASE + r.range(-60, 50),
      tank: r.chance(0.4) ? at(0.2, 0.7) : null,
      chimneys: Array.from({ length: r.int(0, 2) }, () => at(0.1, 0.9)),
      aerial: r.chance(0.5) ? at(0.1, 0.9) : null,
      skylight: r.chance(0.5) ? at(0.2, 0.8) : null,
    });
    x += w + (r.chance(0.65) ? r.range(130, 210) : 0);
  }
  return out;
}

function drawRoofs(rs: Roof[], t: number): Piece[] {
  const out: Piece[] = [];
  rs.forEach((f, i) => {
    const id = `roof${i}`;
    out.push({ id, kind: "rect", ink: "near", x: f.x, y: f.top, w: f.w, h: 1400 });
    out.push({ id: `${id}/parapet`, kind: "rect", ink: "back", x: f.x - 8, y: f.top - 16, w: f.w + 16, h: 18, edge: 0.4 });
    for (const [j, cx] of f.chimneys.entries()) {
      out.push({ id: `${id}/ch${j}`, kind: "rect", ink: "near", x: cx - 26, y: f.top - 130, w: 52, h: 130 });
      out.push({ id: `${id}/ch${j}/cap`, kind: "rect", ink: "back", x: cx - 34, y: f.top - 142, w: 68, h: 14, edge: 0.4 });
      out.push(...smoke(`${id}/ch${j}/smoke`, [cx, f.top - 150], t + j * 3 + i, 1.6, 1.4).map((p) => ({ ...p, alpha: (p.alpha ?? 0) * 0.5 })));
    }
    if (f.tank !== null) {
      const cx = f.tank;
      out.push({ id: `${id}/tank/legs`, kind: "rect", ink: "back", x: cx - 70, y: f.top - 110, w: 140, h: 110, edge: 0.5 });
      out.push({ id: `${id}/tank`, kind: "poly", ink: "near", pts: [[cx - 90, f.top - 100], [cx + 90, f.top - 100], [cx + 84, f.top - 260], [cx, f.top - 310], [cx - 84, f.top - 260]] });
    }
    if (f.aerial !== null) {
      const ax = f.aerial;
      out.push({ id: `${id}/aerial`, kind: "rect", ink: "near", x: ax - 3, y: f.top - 230, w: 6, h: 230, edge: 0.2 });
      for (let k = 0; k < 3; k++) out.push({ id: `${id}/aerial${k}`, kind: "rect", ink: "near", x: ax - 50 + k * 10, y: f.top - 220 + k * 34, w: 100 - k * 20, h: 4, edge: 0.15 });
    }
    if (f.skylight !== null) out.push({ id: `${id}/skylight`, kind: "poly", ink: "lit", alpha: 0.85, pts: [[f.skylight - 60, f.top - 2], [f.skylight + 60, f.top - 2], [f.skylight + 40, f.top - 34], [f.skylight - 40, f.top - 34]] });
  });
  return out;
}

/** Where someone running along the roofs is: on a roof, or in the air over the gap after it. */
function over(rs: Roof[], x: number): { y: number; air: number } {
  for (let i = 0; i < rs.length; i++) {
    const a = rs[i]!;
    const n = rs[i + 1];
    const from = a.x + a.w - 70;
    if (n && x > from && x < n.x + 70) {
      if (n.x - (a.x + a.w) < 1) return { y: x < n.x ? a.top : n.top, air: 0 };
      const u = (x - from) / (n.x + 70 - from);
      return { y: lerp(a.top, n.top, u) - Math.sin(Math.PI * u) * 150, air: Math.sin(Math.PI * u) };
    }
    if (x >= a.x && x <= a.x + a.w) return { y: a.top, air: 0 };
  }
  return { y: BASE, air: 0 };
}

type RoofSetup = "wide" | "back" | "close";

/** On the roofs: stood at the edge over the city in the wind, or running across them and the gaps. */
export const roofScene: Scene = (s) => {
  const run = s.variant === "run";
  const rs = roofs(rng(`${s.cast.seed}/roofs`));
  const low = skyline(rng(`${s.cast.seed}/roofs/below`), { x0: -3000, x1: 12000, base: 1700, tall: [330, 790], wide: [140, 260], gap: 60, win: 18 });
  const edge = rs.find((f) => f.x + f.w > 1300)!;
  // stood at the edge, the roofs end there and the city drops away
  const shown = run ? rs : rs.filter((f) => f.x <= edge.x);
  const fx0 = edge.x + edge.w - 70;
  const order = shuffle(s.r, ["back", "close", "wide"] as RoofSetup[]);
  const chased = run && s.r.chance(0.6);
  const spb = 60 / s.c.bpm;
  const bar = spb * s.track.meter;
  const lightAt = s.t0 + bar;
  const start = rs[1]!.x + 200;
  return (t) => {
    const sp = setupSpan(s, t);
    const setup: RoofSetup = sp.i === 0 ? "wide" : order[(sp.i - 1) % 3]!;
    const b = breathe(s, t);
    const people: Piece[] = [];
    let cam: Camera;
    if (run) {
      const st = steps(s, t, true);
      const fx = start + st * 96;
      const at = over(rs, fx);
      people.push(...figure({ id: "fig", x: fx, y: at.y + 4, scale: 1, facing: 1 }, { walk: at.air ? null : st / 2, run: true, lean: 0.1 + 0.2 * at.air, scarf: true, hat: s.cast.hat, wind: 0.6 }).pieces);
      if (!at.air) people.unshift(pool("fig/shadow", fx + 4, at.y + 4, 40, 5));
      if (chased) {
        const px = fx - 820 + count(s.cuts, t) * 70;
        const pa = over(rs, px);
        people.unshift(...figure({ id: "them", x: px, y: pa.y + 4, scale: 1, facing: 1 }, { walk: pa.air ? null : st / 2 + 0.3, run: true, hat: "fedora", coat: "long" }).pieces);
      }
      if (setup === "wide") cam = frame(fx + 380, BASE - 300, 0.85 * b, W * 0.4, H * 0.55);
      else if (setup === "close") cam = frame(fx + 40, at.y - 220, 2.2 * b, W * 0.42, H * 0.5, 1, 0.03);
      else cam = frame(fx + 200, lerp(at.y, BASE, 0.6) - 200, 1.3 * b, W * 0.38, H * 0.58);
    } else {
      const lift = out3((t - lightAt) / 0.5) - 0.85 * out3((t - lightAt - bar * 1.4) / 0.6);
      const look = 0.25 + 0.15 * Math.sin(t * 0.3);
      const fig = figure({ id: "fig", x: fx0, y: edge.top + 4, scale: 1, facing: 1 }, { walk: null, smoke: Math.max(0, lift), look, wind: 0.7, scarf: true, hat: s.cast.hat, coat: "long" });
      people.push(pool("fig/shadow", fx0 + 4, edge.top + 4, 40, 5), ...fig.pieces);
      if (t > lightAt) people.push(...smoke("smoke", fig.ember ?? fig.mouth, t - lightAt, spb * 2, 1.2));
      if (setup === "wide") cam = frame(fx0 + 260, edge.top - 330, lerp(0.9, 0.95, sp.k) * b, W * 0.32, H * 0.55);
      else if (setup === "back") cam = frame(fx0, edge.top - 200, 1.7 * b, W * 0.26, H * 0.62, 1, 0.08);
      else cam = frame(fx0 + 20, edge.top - 250, 3.1 * b, W * 0.42, H * 0.5, 1, 0.04);
    }
    const chord = windowsOn(s.c, t);
    const rain = weather(s, t, cam);
    const far = town(s, t, { farLit: 0.3 })[0]!;
    const layers: Layer[] = [
      { id: "sky", z: 14, pieces: sky(s.world, t) },
      // seen from up here the far city is small, so only a few of its windows are lit or it turns to static
      { ...far, pieces: [...far.pieces, { id: "far/ground", kind: "rect", ink: "far", x: -6000, y: BASE - 4, w: 20000, h: 3000 }] },
      { id: "below", z: 1.8, pieces: drawSkyline("below", low, "mid", "lit", chord, 0.16 + 0.14 * glow(s.c, t)), cast: true },
      ...rain.slice(0, 1),
      { id: "roofs", z: 1.02, pieces: drawRoofs(shown, t), cast: true },
      { id: "fig", z: 1, pieces: people, cast: true },
      ...rain.slice(1),
    ];
    return view(layers, cam);
  };
};

/* ------------------------------------------------------------------ the bridge */

const DECK = BASE;
const RAIL = DECK - 92;
const WATER = DECK + 70;
const BRIDGE_LAMPS = Array.from({ length: 9 }, (_, i) => -1000 + i * 700);

/** The bridge, side on: the parapet and its balusters, the deck, the arches down into the water. */
function span(): Piece[] {
  const x0 = -1800;
  const x1 = 5600;
  const out: Piece[] = [
    { id: "br/deck", kind: "rect", ink: "near", x: x0, y: DECK, w: x1 - x0, h: 46 },
    { id: "br/coping", kind: "rect", ink: "back", x: x0, y: RAIL - 12, w: x1 - x0, h: 14, edge: 0.4 },
    { id: "br/plinth", kind: "rect", ink: "near", x: x0, y: DECK - 18, w: x1 - x0, h: 20, edge: 0.4 },
  ];
  for (let x = x0, i = 0; x < x1; x += 46, i++) out.push({ id: `br/bal${i}`, kind: "poly", ink: "near", pts: [[x - 6, RAIL], [x + 6, RAIL], [x + 10, RAIL + 36], [x + 6, DECK - 16], [x - 6, DECK - 16], [x - 10, RAIL + 36]], edge: 0.3 });
  // arches: the deck stands on piers, an arch cut out between each pair, springing from the water
  // and rising to just under the deck
  const spring = WATER + 300;
  for (let x = x0, i = 0; x < x1; x += 1100, i++) {
    const pts: Pt[] = [[x, DECK + 40], [x + 1100, DECK + 40], [x + 1100, WATER + 400]];
    for (let k = 0; k <= 12; k++) {
      const a = Math.PI * (k / 12);
      pts.push([x + 1100 - 90 - (1 - Math.cos(a)) * 460, spring - Math.sin(a) * (spring - DECK - 80)]);
    }
    pts.push([x, WATER + 400]);
    out.push({ id: `br/arch${i}`, kind: "poly", ink: "near", pts });
  }
  return out;
}

/** The lamps on the bridge, their light, and the lamps and moon broken up on the water. */
function lights(s: Shot, t: number): { posts: Piece[]; air: Piece[]; water: Piece[] } {
  const posts: Piece[] = [];
  const air: Piece[] = [];
  const water: Piece[] = [];
  const ripple = since(s.c.beats, t);
  const r = rng(`${s.cast.seed}/water`);
  for (const [i, x] of BRIDGE_LAMPS.entries()) {
    const l = lamp(`br/lamp${i}`, x, DECK - 16, 330, "near");
    posts.push(...l.pieces);
    air.push(...lampLight(`br/lamp${i}`, l.head, DECK - 16, 110));
    for (let k = 0; k < 9; k++) {
      const y = WATER + 50 + k * 28;
      const w = (60 + k * 18) * (0.7 + 0.3 * Math.sin(t * 2.2 + k * 1.3 + i)) * (1 + 0.3 * Math.max(0, 1 - ripple / 0.25));
      water.push({ id: `br/refl${i}/${k}`, kind: "rect", ink: "light", alpha: 0.32 - k * 0.03, x: l.head[0] - w / 2 + Math.sin(t * 1.7 + k) * 10, y, w, h: 5, edge: 0.4 });
    }
  }
  // the moon's, wider and fainter
  const [mx] = s.world.moon;
  for (let k = 0; k < 14; k++) {
    const w = r.range(40, 140) * (0.6 + 0.4 * Math.sin(t * 1.3 + k * 2.1));
    water.push({ id: `br/moon/${k}`, kind: "rect", ink: "moon", alpha: 0.22, x: mx * 0.6 + 300 - w / 2 + Math.sin(t + k) * 14, y: WATER + 30 + k * 22, w, h: 4, edge: 0.4 });
  }
  return { posts, air, water };
}

type BridgeSetup = "wide" | "rail" | "close" | "water";

/** On the bridge: at the parapet looking down at the water, or walking across. */
export const bridgeScene: Scene = (s) => {
  const walking = s.variant === "alt";
  const FX = 1300;
  const spb = 60 / s.c.bpm;
  const bar = spb * s.track.meter;
  const lightAt = s.t0 + bar * 1.2;
  const order = shuffle(s.r, ["rail", "close", "water", "wide"] as BridgeSetup[]);
  return (t) => {
    const sp = setupSpan(s, t);
    const setup: BridgeSetup = sp.i === 0 ? "wide" : order[(sp.i - 1) % 4]!;
    const b = breathe(s, t);
    const st = steps(s, t);
    const fx = walking ? 300 + st * 52 : FX;
    const lift = walking ? 0 : out3((t - lightAt) / 0.5) - 0.85 * out3((t - lightAt - bar * 1.4) / 0.6);
    const fig = figure(
      { id: "fig", x: fx, y: DECK + 2, scale: 1, facing: 1 },
      walking ? { walk: st / 2, scarf: true, hat: s.cast.hat, wind: 0.3 } : { walk: null, lean: 0.22, smoke: Math.max(0, lift), look: 0.02, wind: 0.3, scarf: true, hat: s.cast.hat, coat: "long" },
    );
    let cam: Camera;
    if (setup === "wide") cam = frame(fx + 300, DECK - 200, lerp(0.78, 0.84, sp.k) * b, W / 2, H * 0.5);
    else if (setup === "rail") cam = frame(fx + 60, DECK - 160, 1.7 * b, W * 0.42, H * 0.55);
    else if (setup === "close") cam = frame(fx + 30, DECK - 250, 3.0 * b, W * 0.4, H * 0.48, 1, 0.04);
    else cam = frame(fx + 200, WATER + 40, 1.3 * b, W * 0.5, H * 0.38, 1.2);
    const l = lights(s, t);
    const rain = weather(s, t, cam);
    const people: Piece[] = [pool("fig/shadow", fx + 4, DECK + 2, 40, 5), ...fig.pieces];
    if (t > lightAt && !walking) people.push(...smoke("smoke", fig.ember ?? fig.mouth, t - lightAt, spb * 2, 0.6));
    const layers: Layer[] = [
      { id: "sky", z: 14, pieces: sky(s.world, t) },
      ...town(s, t, { sign: s.world.sign, lit: 0.3 }),
      { id: "water", z: 1.3, pieces: [{ id: "river", kind: "rect", ink: "water", x: -4000, y: WATER, w: 12000, h: 1400 }, ...l.water] },
      ...rain.slice(0, 1),
      { id: "bridge", z: 1.02, pieces: [...span(), ...l.posts], cast: true },
      { id: "air", z: 1.01, pieces: l.air },
      { id: "fig", z: 1, pieces: people, cast: true },
      ...rain.slice(1),
    ];
    return view(layers, cam);
  };
};
