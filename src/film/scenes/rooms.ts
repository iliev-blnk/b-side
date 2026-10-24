import { rng } from "../../music/rng.ts";
import { neon, smoke } from "../city.ts";
import { count, since } from "../cues.ts";
import { figure, type Pt, spin } from "../rig.ts";
import { type Camera, H, type Ink, type Layer, type Piece, W } from "../stage.ts";
import { breathe, clamp01, frame, inOut, lerp, out3, pool, type Scene, setupSpan, type Shot, shuffle, sky, town, view } from "./kit.ts";

/**
 * Indoors. A rented room at night: the city through the window, the blinds half down, the sign
 * outside throwing its colour across the floor, and the figure stood at the glass. And the insert:
 * their hand, close, with the thing they carry.
 */

const FLOOR = 900;
/** The window, in the wall's units. */
const WIN = { x0: 560, x1: 1360, y0: 150, y1: 760 };

/** Rain running down the glass: slow streaks that start and stop. */
function glassRain(s: Shot, t: number): Piece[] {
  if (s.cast.weather !== "rain") return [];
  const r = rng(`${s.track.seed}/glass`);
  const out: Piece[] = [];
  for (let i = 0; i < 40; i++) {
    const x = r.range(WIN.x0 + 6, WIN.x1 - 6);
    const speed = r.range(20, 70);
    const y = WIN.y0 + ((r.next() * 600 + t * speed) % (WIN.y1 - WIN.y0));
    out.push({ id: `glass/${i}`, kind: "rect", ink: "rain", alpha: 0.45, x, y, w: 2.2, h: r.range(10, 26), edge: 0.1 });
  }
  return out;
}

/** The room's walls with the window cut out, and what is in the room. */
function walls(): Piece[] {
  const { x0, x1, y0, y1 } = WIN;
  return [
    { id: "wall/top", kind: "rect", ink: "mid", x: -1500, y: -1200, w: 4900, h: 1200 + y0 },
    { id: "wall/bottom", kind: "rect", ink: "mid", x: -1500, y: y1, w: 4900, h: 600 },
    { id: "wall/left", kind: "rect", ink: "mid", x: -1500, y: y0 - 2, w: 1500 + x0, h: y1 - y0 + 4 },
    { id: "wall/right", kind: "rect", ink: "mid", x: x1, y: y0 - 2, w: 2040, h: y1 - y0 + 4 },
    { id: "frame/sill", kind: "rect", ink: "near", x: x0 - 30, y: y1, w: x1 - x0 + 60, h: 18, edge: 0.4 },
    { id: "frame/head", kind: "rect", ink: "near", x: x0 - 16, y: y0 - 16, w: x1 - x0 + 32, h: 18, edge: 0.4 },
    { id: "frame/mullion", kind: "rect", ink: "near", x: (x0 + x1) / 2 - 7, y: y0, w: 14, h: y1 - y0, edge: 0.3 },
    { id: "frame/transom", kind: "rect", ink: "near", x: x0, y: y0 + (y1 - y0) * 0.5 - 6, w: x1 - x0, h: 12, edge: 0.3 },
    // a radiator under the sill
    ...Array.from({ length: 12 }, (_, i): Piece => ({ id: `radiator/${i}`, kind: "rect", ink: "back", x: x0 + 140 + i * 42, y: y1 + 60, w: 26, h: 120, edge: 0.4 })),
    { id: "floor", kind: "rect", ink: "street", x: -1500, y: FLOOR, w: 4900, h: 600 },
  ];
}

/** The blinds, pulled half down, their slats opening a little when the band plays harder. */
function blinds(open: number): Piece[] {
  const { x0, x1, y0, y1 } = WIN;
  const low = y0 + (y1 - y0) * 0.52;
  const out: Piece[] = [];
  for (let y = y0, i = 0; y < low; y += 30, i++) out.push({ id: `blind/${i}`, kind: "rect", ink: "back", x: x0 + 4, y, w: x1 - x0 - 8, h: 30 - 18 * open, edge: 0.25 });
  out.push({ id: "blind/bar", kind: "rect", ink: "near", x: x0, y: low, w: x1 - x0, h: 10, edge: 0.3 });
  out.push({ id: "blind/cord", kind: "rect", ink: "near", x: x1 - 40, y: low, w: 3, h: 120, edge: 0.1 });
  return out;
}

/**
 * The sign's colour thrown through the window and down onto the floor. The clear lower half of the
 * glass lands near the wall; the slats of the upper half land further into the room, in stripes.
 */
function spill(on: boolean, open: number): Piece[] {
  if (!on) return [];
  const { x0, x1 } = WIN;
  const skew = 260;
  const out: Piece[] = [{ id: "spill/glass", kind: "poly", ink: "neon", alpha: 0.07, pts: [[x0 + 40, FLOOR + 4], [x1 - 40, FLOOR + 4], [x1 + skew * 0.4, FLOOR + 60], [x0 + skew * 0.3, FLOOR + 60]] }];
  for (let i = 0; i < 6; i++) {
    const y = FLOOR + 70 + i * 22;
    const h = 4 + 10 * open;
    const sx = skew * (0.45 + i * 0.12);
    out.push({ id: `spill/${i}`, kind: "poly", ink: "neon", alpha: 0.06, pts: [[x0 + sx, y], [x1 + sx, y], [x1 + sx + 12, y + h], [x0 + sx + 12, y + h]] });
  }
  return out;
}

type RoomSetup = "wide" | "glass" | "face";

/** The figure at the window, looking out, smoking. */
export const windowScene: Scene = (s) => {
  const fx = 900;
  const spb = 60 / s.c.bpm;
  const bar = spb * s.track.meter;
  const lightAt = s.t0 + bar * 0.75;
  const order = shuffle(s.r, ["glass", "face", "wide"] as RoomSetup[]);
  const table = s.r.chance(0.5) ? -1 : 1;
  return (t) => {
    const sp = setupSpan(s, t);
    const setup: RoomSetup = sp.i === 0 ? "wide" : order[(sp.i - 1) % 3]!;
    const b = breathe(s, t);
    const energy = s.c.sections.find((x) => t >= x.t && t < x.end)?.energy ?? 0.4;
    const open = clamp01(0.35 + energy * 0.5);
    const on = rng(`flicker/${count(s.c.beats, t)}`).next() > 0.1;
    let cam: Camera;
    if (setup === "wide") cam = frame(960, 560, lerp(1.0, 1.1, inOut(sp.k)) * b, W / 2, H / 2, 1, lerp(0, 0.08, sp.k));
    else if (setup === "glass") cam = frame(fx, FLOOR - 230, 1.9 * b, W * 0.42, H * 0.46, 1, 0.02);
    else cam = frame(fx + 40, FLOOR - 300, 3.2 * b, W * 0.4, H * 0.48, 1, 0.05);

    const lift = out3((t - lightAt) / 0.5) - 0.8 * out3((t - lightAt - bar * 1.5) / 0.6);
    const fig = figure({ id: "fig", x: fx, y: FLOOR + 2, scale: 1.12, facing: 1 }, { walk: null, smoke: Math.max(0, lift), look: 0.12 + 0.05 * Math.sin(t * 0.3), wind: 0.05, hat: s.cast.hat, scarf: true, coat: "long" });
    const puffs = t > lightAt ? smoke("smoke", fig.ember ?? fig.mouth, t - lightAt, spb * 2, 0.15) : [];

    // a table with the lamp off, and a chair
    const tx = table < 0 ? 180 : 1700;
    const furniture: Piece[] = [
      { id: "table/top", kind: "rect", ink: "near", x: tx - 150, y: FLOOR - 200, w: 300, h: 16, edge: 0.4 },
      { id: "table/l1", kind: "rect", ink: "near", x: tx - 130, y: FLOOR - 186, w: 12, h: 190, edge: 0.4 },
      { id: "table/l2", kind: "rect", ink: "near", x: tx + 118, y: FLOOR - 186, w: 12, h: 190, edge: 0.4 },
      { id: "lamp/stem", kind: "rect", ink: "near", x: tx - 60, y: FLOOR - 330, w: 8, h: 130, edge: 0.3 },
      { id: "lamp/shade", kind: "poly", ink: "back", pts: [[tx - 100, FLOOR - 320], [tx - 12, FLOOR - 320], [tx - 30, FLOOR - 380], [tx - 82, FLOOR - 380]] },
      { id: "chair/seat", kind: "rect", ink: "near", x: tx + 200 * -table, y: FLOOR - 120, w: 120, h: 14, edge: 0.4 },
      { id: "chair/back", kind: "rect", ink: "near", x: tx + 200 * -table + (table < 0 ? 108 : 0), y: FLOOR - 300, w: 12, h: 300, edge: 0.4 },
      { id: "chair/leg", kind: "rect", ink: "near", x: tx + 200 * -table + (table < 0 ? 0 : 108), y: FLOOR - 110, w: 12, h: 112, edge: 0.4 },
    ];

    const layers: Layer[] = [
      { id: "sky", z: 14, pieces: sky(s.world, t, { beams: true }) },
      ...town(s, t, {}),
      { id: "sign", z: 2.2, pieces: neon("outside", s.cast.sign, 1240, 300, 80, on, "near") },
      { id: "glass", z: 1.27, pieces: glassRain(s, t) },
      { id: "blinds", z: 1.26, pieces: blinds(open) },
      { id: "room", z: 1.25, pieces: [...walls(), ...spill(on, open)], cast: true },
      { id: "furniture", z: 1.1, pieces: furniture, cast: true },
      { id: "fig", z: 1, pieces: [pool("fig/shadow", fx + 6, FLOOR + 4, 56, 7), ...fig.pieces, ...puffs], cast: true },
    ];
    return view(layers, cam, 1);
  };
};

/* ------------------------------------------------------------------ the insert */

/** Cut paper in a hand's own frame: origin at the wrist, the fingers along +x. */
function cutAt(id: string, at: Pt, scale: number, rot: number, out: Piece[]) {
  const P = (p: Pt): Pt => {
    const [x, y] = spin(p, [0, 0], rot);
    return [at[0] + x * scale, at[1] + y * scale];
  };
  return {
    P,
    poly(name: string, ink: Ink, pts: Pt[], edge?: number, alpha?: number) {
      out.push({ id: `${id}/${name}`, kind: "poly", ink, pts: pts.map(P), edge, alpha });
    },
    box(name: string, ink: Ink, x: number, y: number, w: number, h: number, edge = 0.4) {
      out.push({ id: `${id}/${name}`, kind: "poly", ink, pts: ([[x, y], [x + w, y], [x + w, y + h], [x, y + h]] as Pt[]).map(P), edge });
    },
    disc(name: string, ink: Ink, c: Pt, r: number, alpha?: number) {
      const [x, y] = P(c);
      out.push({ id: `${id}/${name}`, kind: "circle", ink, x, y, r: r * scale, alpha });
    },
    text(name: string, ink: Ink, text: string, c: Pt, size: number, weight = 700) {
      const [x, y] = P(c);
      out.push({ id: `${id}/${name}`, kind: "text", ink, text, x, y, size: size * scale, weight, rot, align: "center", spacing: 0.08 });
    },
  };
}

/**
 * A hand, close: a coat sleeve, the cuff, and a hand holding something between finger and thumb.
 * `grip` closes the fingers, 0..1.
 */
function hand(id: string, at: Pt, scale: number, rot: number, grip: number): Piece[] {
  const out: Piece[] = [];
  const c = cutAt(id, at, scale, rot, out);
  c.poly("sleeve", "figure", [[-700, -120], [-30, -80], [-20, 80], [-700, 150]]);
  c.box("cuff", "back", -40, -70, 34, 140, 0.3);
  c.poly("palm", "near", [[-8, -56], [84, -64], [118, -40], [124, 30], [80, 58], [-8, 56]]);
  for (let i = 0; i < 4; i++) {
    const y = -46 + i * 26;
    const bend = 0.5 + 1.1 * grip + i * 0.1;
    const k1: Pt = [118, y];
    const k2: Pt = [k1[0] + Math.cos(bend * 0.5) * 50, k1[1] + Math.sin(bend * 0.5) * 50];
    const tip: Pt = [k2[0] + Math.cos(bend * 1.4) * 38, k2[1] + Math.sin(bend * 1.4) * 38];
    c.poly(`finger${i}/a`, "near", [[k1[0], y - 11], [k2[0], k2[1] - 10], [k2[0], k2[1] + 10], [k1[0], y + 11]]);
    c.poly(`finger${i}/b`, "near", [[k2[0] - 4, k2[1] - 9], [tip[0], tip[1] - 7], [tip[0], tip[1] + 7], [k2[0] + 4, k2[1] + 9]]);
  }
  c.poly("thumb", "near", [[60, -60], [126, -104], [150, -96], [148, -84], [92, -40]]);
  return out;
}

/** The thing they carry, close up, doing what it does on the band's hit. */
export const insertScene: Scene = (s) => {
  const act = s.cuts[0] ?? s.t0 + (s.t1 - s.t0) * 0.4;
  const spb = 60 / s.c.bpm;
  const prop = s.cast.prop;
  const r = rng(`${s.track.seed}/insert`);
  const pitches = s.c.lead.filter((n) => n.t >= s.t0 - 4 && n.t < s.t1);
  const lo = Math.min(...pitches.map((n) => n.midi), 60);
  const hi = Math.max(...pitches.map((n) => n.midi), 72) + 1;
  return (t) => {
    const sp = setupSpan(s, t);
    const b = breathe(s, t);
    const k = clamp01((t - act) / 0.35);
    const shown: Piece[] = [];
    const held: Piece[] = [];
    const glow: Piece[] = [];
    // where the action is, for the second setup to move in on
    let focus: Pt = [960, 560];

    if (prop === "match") {
      // a box on the table, a match struck along it on the hit, then it burns down
      const box = cutAt("box", [700, 700], 1, -0.06, shown);
      box.box("tray", "paper", -170, -60, 340, 120);
      box.box("label", "label", -150, -44, 300, 88);
      box.text("brand", "near", s.cast.sign, [0, 18], 40, 800);
      box.box("strike", "wood", -170, 60, 340, 18, 0.2);
      const stroke = k < 1 ? lerp(-140, 260, out3(k)) : 260;
      const lit = t >= act + 0.2;
      const burn = clamp01((t - act) / (s.t1 - act));
      const tip: Pt = [700 + stroke, 760 - (lit ? 120 * out3((t - act - 0.2) / 0.6) : 0)];
      const m = cutAt("match", tip, 1, -0.5, held);
      m.box("stick", "paper", -230 + 120 * burn, -5, 230 - 120 * burn, 10, 0.15);
      m.disc("head", lit ? "near" : "trim", [0, 0], 9);
      held.push(...hand("hand", m.P([-300, 20]), 1.05, -0.5, 0.7));
      if (lit) {
        const flick = 1 + 0.18 * Math.max(0, 1 - since(s.c.hats, t) / 0.12) + 0.05 * Math.sin(t * 23);
        const out = 1 - clamp01((t - (s.t1 - 0.6)) / 0.4);
        const f = cutAt("flame", tip, flick * out * (0.6 + 0.4 * out3((t - act - 0.2) / 0.3)), -0.08 * Math.sin(t * 3), glow);
        f.poly("body", "flame", [[0, 6], [-16, -14], [-8, -52], [0, -88], [10, -50], [16, -14]], 0.3);
        f.poly("core", "spot", [[0, 2], [-6, -12], [0, -36], [6, -12]], 0.2);
        for (const [i, [rr, a]] of ([[110, 0.12], [210, 0.07], [340, 0.04]] as const).entries()) glow.push({ id: `flame/light${i}`, kind: "circle", ink: "light", alpha: a * out * flick, x: tip[0], y: tip[1] - 30, r: rr });
      }
      focus = tip;
    } else if (prop === "key") {
      // a key comes to a lock, goes in on the hit and turns on the next beat; the door gives
      const door = cutAt("door", [960, 540], 1, 0, shown);
      door.box("door", "wood", -700, -700, 1400, 1400);
      const open = clamp01((t - act - spb * 2) / (spb * 4));
      door.box("gap", "light", 560 - 140 * open, -700, 6 + 140 * inOut(open), 1400);
      door.box("plate", "brass", -50, -150, 100, 300, 0.3);
      door.disc("hole", "near", [0, -20], 16);
      door.box("slot", "near", -5, -20, 10, 46, 0.2);
      const into = out3((t - (act - 1.2)) / 1.2);
      // seen end on, a key turning is its bow going thin and coming back
      const turn = inOut((t - act - spb) / (spb * 0.6));
      const sq = Math.max(0.12, Math.abs(Math.cos(turn * Math.PI * 0.5)));
      const kc = cutAt("key", [lerp(1400, 960, into), lerp(860, 520, into)], 1, 0, held);
      kc.box("blade", "brass", 0, -9, 190, 18, 0.2);
      kc.poly("bow", "brass", ([[180, -50], [280, -50], [300, 0], [280, 50], [180, 50]] as Pt[]).map(([x, y]): Pt => [x, y * sq]), 0.3);
      if (sq > 0.4) kc.disc("hole", "wood", [250, 0], 16 * sq);
      held.push(...hand("hand", kc.P([450, 30]), 1.05, Math.PI + 0.1, 0.55 + 0.2 * turn));
      glow.push({ id: "door/spill", kind: "poly", ink: "light", alpha: 0.25 * open, pts: [[1520, 0], [1540, 0], [1700, 1080], [1300, 1080]] });
      focus = [960, 520];
    } else if (prop === "letter") {
      // a letter drawn out of its envelope, the tune's title across the top of it
      const env = cutAt("env", [900, 640], 1, -0.04, shown);
      const pull = out3((t - act + 0.4) / 1.4);
      const tilt = cutAt("letter", [900, 640 - 340 * pull], 1, -0.04 + 0.06 * pull, held);
      tilt.box("sheet", "paper", -300, -220, 600, 400, 0.3);
      tilt.text("line0", "near", s.track.title, [0, -120], 34, 600);
      for (let i = 0; i < 5; i++) tilt.box(`line${i + 1}`, "back", -240, -60 + i * 40, 480 - r.range(0, 140), 6, 0.2);
      env.box("back", "paper", -340, -200, 680, 400, 0.4);
      env.poly("flap", "cloud", [[-340, -200], [340, -200], [0, 30]], 0.4);
      env.box("front", "paper", -340, -40, 680, 240, 0.4);
      env.box("stamp", "label", 220, -20, 70, 80, 0.3);
      held.push(...hand("hand", tilt.P([-420, -60]), 1.05, 0.15, 0.85));
      focus = tilt.P([0, -60]);
    } else if (prop === "ticket") {
      // a ticket, and a conductor's punch closing on it on the hit
      const tk = cutAt("ticket", [880, 560], 1, -0.08, held);
      tk.box("stub", "paper", -260, -110, 520, 220, 0.3);
      tk.box("band", "label", -260, -110, 90, 220, 0.3);
      tk.text("no", "near", `No. ${s.act + 1}`, [40, -20], 54, 800);
      tk.text("line", "near", "ONE WAY", [40, 50], 30, 600);
      const holes = count(s.cuts, t) + (t >= act ? 1 : 0);
      for (let i = 0; i < Math.min(4, holes); i++) tk.disc(`hole${i}`, "wood", [180, -60 + i * 40], 12);
      const shut = Math.max(0, 1 - since([act, ...s.cuts], t) / 0.25);
      const p = cutAt("punch", tk.P([180, -60]), 1, -0.08, glow);
      p.poly("jawA", "near", [[-30, -40 - 50 * (1 - shut)], [30, -40 - 50 * (1 - shut)], [40, -300], [-40, -300]]);
      p.poly("jawB", "near", [[-30, 40 + 50 * (1 - shut)], [30, 40 + 50 * (1 - shut)], [40, 300], [-40, 300]]);
      held.push(...hand("hand", tk.P([-320, 40]), 1.05, 0.1, 0.8));
      focus = tk.P([100, 0]);
    } else if (prop === "photo") {
      // a photograph held to the light: someone else, in a hat, under a lamp
      const tilt = 0.06 * Math.sin(t * 0.4);
      const ph = cutAt("photo", [960, 540], 1, -0.05 + tilt, held);
      ph.box("print", "paper", -300, -220, 600, 440, 0.3);
      ph.box("image", "far", -270, -190, 540, 330, 0.2);
      ph.box("lamp", "near", 120, -170, 6, 300, 0.1);
      ph.poly("light", "farLit", [[110, -150], [130, -150], [190, 140], [50, 140]], 0.2);
      const them = figure({ id: "them", x: 0, y: 0, scale: 0.75, facing: -1 }, { walk: null, hat: "beret", coat: "long", look: 0.05 });
      for (const pc of them.pieces) if (pc.kind === "poly") held.push({ ...pc, pts: pc.pts.map(([x, y]) => ph.P([x + 60, y + 140])) });
      held.push(...hand("hand", ph.P([-360, 120]), 1.05, 0.2, 0.85));
      ph.disc("moon", "moon", [-150, -110], 26);
      focus = [960, 520];
    } else {
      // a radio: the needle finds the tune, a hand on the knob
      const rd = cutAt("radio", [960, 470], 1, 0, shown);
      rd.box("case", "wood", -420, -260, 840, 520, 0.5);
      rd.box("grille", "back", -380, -220, 360, 440, 0.4);
      for (let i = 0; i < 9; i++) rd.box(`slot${i}`, "near", -360, -200 + i * 48, 320, 10, 0.2);
      rd.box("face", "paper", 20, -200, 360, 150, 0.3);
      for (let i = 0; i <= 12; i++) rd.box(`tick${i}`, "near", 40 + i * 26, -80, 3, i % 4 ? 14 : 26, 0.1);
      const last = pitches.filter((n) => n.t <= t).at(-1);
      const target = last ? (last.midi - lo) / (hi - lo) : 0.5;
      const needle = 40 + target * 312;
      rd.box("needle", "trim", needle - 2, -190, 4, 130, 0.1);
      rd.disc("knob", "near", [200, 120], 70);
      rd.disc("knob2", "back", [200, 120], 52);
      glow.push({ id: "radio/glow", kind: "rect", ink: "light", alpha: 0.18, x: 980, y: 270, w: 360, h: 150, edge: 0.3 });
      held.push(...hand("hand", rd.P([10, 300]), 1.05, -0.75, 0.9));
      focus = [1140, 400];
    }

    // close, then closer on the hit
    const mid: Pt = [lerp(960, focus[0], 0.6), lerp(560, focus[1], 0.6)];
    const cam = sp.i === 0 ? frame(mid[0], mid[1], lerp(1.4, 1.5, sp.k) * b, W / 2, H / 2, 1) : frame(focus[0], focus[1] + 40, lerp(2.0, 2.15, sp.k) * b, W / 2, H / 2, 1, 0.03);
    const layers: Layer[] = [
      { id: "table", z: 1.3, pieces: [{ id: "table", kind: "rect", ink: "wood", x: -800, y: -600, w: 3600, h: 2400 }, ...grainLines(s)] },
      { id: "shown", z: 1.06, pieces: shown, cast: true },
      { id: "held", z: 1, pieces: held, cast: true },
      { id: "glow", z: 0.99, pieces: glow },
    ];
    return view(layers, cam, -1);
  };
};

/** The grain of the table under the insert. */
function grainLines(s: Shot): Piece[] {
  const r = rng(`${s.cast.seed}/table`);
  return Array.from({ length: 22 }, (_, i): Piece => ({ id: `table/g${i}`, kind: "rect", ink: "near", alpha: 0.18, x: -800, y: -600 + i * 110 + r.range(-30, 30), w: 3600, h: r.range(2, 6), edge: 0.6 }));
}

