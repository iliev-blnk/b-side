import type { Part } from "../../band/types.ts";
import { rng } from "../../music/rng.ts";
import { smoke } from "../city.ts";
import { beatAt, count, since } from "../cues.ts";
import { type Play, player } from "../instruments.ts";
import type { Player as Chair } from "../names.ts";
import { figure } from "../rig.ts";
import { type Camera, H, type Layer, type Piece, W } from "../stage.ts";
import { blend, breathe, frame, inOut, lerp, out3, pool, type Scene, setupSpan, type Shot, shuffle, view } from "./kit.ts";

/**
 * The club: the band on a low stand under one hard light, the room dark and smoky, heads between
 * the camera and the stage. Whoever has the tune stands in the spot. The figure sits at a table
 * with a drink, or at the bar with their back to us, and does not clap.
 */

const RISER = 820;
const FLOOR = 900;
const KIT: Part[] = ["kick", "snare", "hat", "ride", "crash", "tom", "brush"];
const HAND: Part[] = ["conga", "bongo", "shaker", "clave"];

/** Where each chair stands on the stand, and how far back. */
const SPOTS: Record<string, { x: number; back: boolean; facing: 1 | -1 }> = {
  keys: { x: 250, back: false, facing: 1 },
  bass: { x: 820, back: true, facing: 1 },
  drums: { x: 980, back: true, facing: 1 },
  percussion: { x: 1330, back: true, facing: -1 },
  lead: { x: 1500, back: false, facing: -1 },
  second: { x: 1700, back: false, facing: -1 },
  vibes: { x: 1640, back: false, facing: -1 },
  bells: { x: 1180, back: false, facing: 1 },
};

interface Seat {
  who: Chair;
  x: number;
  y: number;
  z: number;
  facing: 1 | -1;
  /** What sounds when they play, and which hand plays it. */
  notes: { t: number; midi: number; vel: number }[];
  near: number[];
  far: number[];
  lo: number;
  hi: number;
}

function seats(s: Shot): Seat[] {
  const at = (b: number) => s.c.beats[Math.floor(b)] ?? 0;
  const sec = (b: number) => {
    const i = Math.floor(b);
    const a = s.c.beats[i];
    const n = s.c.beats[i + 1];
    return a === undefined ? at(b) : a + (b - i) * ((n ?? a + 60 / s.c.bpm) - a);
  };
  const out: Seat[] = [];
  for (const who of s.cast.band.players) {
    const spot = SPOTS[who.chair];
    if (!spot) continue;
    const parts = who.chair === "drums" ? KIT : who.chair === "percussion" ? HAND : who.chair === "keys" ? (["piano", "keys"] as Part[]) : [who.part];
    const evs = s.track.events.filter((e) => parts.includes(e.part)).map((e) => ({ t: sec(e.beat), midi: e.midi ?? 60, vel: e.vel, part: e.part }));
    evs.sort((a, b) => a.t - b.t);
    const near = who.chair === "drums" ? evs.filter((e) => e.part === "snare" || e.part === "hat" || e.part === "brush") : evs.filter((_, i) => i % 2 === 0);
    const far = who.chair === "drums" ? evs.filter((e) => e.part !== "snare" && e.part !== "hat" && e.part !== "brush") : evs.filter((_, i) => i % 2 === 1);
    const midis = evs.map((e) => e.midi);
    out.push({
      who,
      x: spot.x,
      y: spot.back ? RISER - 40 : RISER,
      z: spot.back ? 1.12 : 1,
      facing: spot.facing,
      notes: evs,
      near: near.map((e) => e.t),
      far: far.map((e) => e.t),
      lo: Math.min(...midis),
      hi: Math.max(...midis) + 1,
    });
  }
  return out;
}

const hit = (times: number[], t: number, len = 0.14) => {
  const d = since(times, t);
  return d < len ? 1 - d / len : 0;
};

function playing(s: Shot, seat: Seat, t: number): Play {
  const i = count(
    seat.notes.map((n) => n.t),
    t,
  );
  const last = seat.notes[i - 1];
  const ago = last ? t - last.t : Infinity;
  const horn = seat.who.chair === "lead" || seat.who.chair === "second";
  const voice = s.c.sections.find((x) => t >= x.t && t < x.end)?.voice;
  return {
    on: horn ? voice === seat.who.part || ago < 1.2 : true,
    note: last ? last.vel * Math.exp(-ago / 0.4) : 0,
    pitch: last ? (last.midi - seat.lo) / (seat.hi - seat.lo) : 0.5,
    strike: [hit(seat.near, t), hit(seat.far, t)],
    beat: beatAt(s.c, t),
  };
}

/** The room behind the stand: a curtain in pleats, sconces, and the band's name on the drum. */
function room(s: Shot): Piece[] {
  const out: Piece[] = [{ id: "wall", kind: "rect", ink: "mid", x: -1600, y: -900, w: 5200, h: 1900 }];
  for (let i = 0; i < 26; i++) {
    const x = 120 + i * 66;
    out.push({ id: `pleat${i}`, kind: "rect", ink: i % 2 ? "back" : "near", alpha: i % 2 ? 1 : 0.55, x, y: -300, w: 66, h: 1200, edge: 0.4 });
  }
  out.push({ id: "pelmet", kind: "rect", ink: "near", x: 80, y: -320, w: 1830, h: 110, edge: 0.4 });
  for (const [i, x] of [-300, 2220].entries()) {
    out.push({ id: `sconce${i}`, kind: "poly", ink: "near", pts: [[x - 26, 420], [x + 26, 420], [x + 16, 470], [x - 16, 470]] });
    out.push({ id: `sconce${i}/light`, kind: "poly", ink: "light", alpha: 0.5, pts: [[x - 22, 420], [x + 22, 420], [x + 60, 280], [x - 60, 280]] });
  }
  const r = rng(`${s.cast.seed}/club/wall`);
  // frames on the side walls, the band's past
  for (let i = 0; i < 6; i++) {
    const x = i < 3 ? -1100 + i * 260 : 2100 + (i - 3) * 260;
    out.push({ id: `frame${i}`, kind: "rect", ink: "back", x, y: r.range(380, 460), w: 150, h: 190, edge: 0.4 });
  }
  return out;
}

/** The low stand the band plays on, with a step up at the back for the rhythm section. */
const STEP: Piece = { id: "riser/back", kind: "rect", ink: "back", x: 60, y: RISER - 40, w: 1800, h: 120 };
function stand(): Piece[] {
  return [
    { id: "riser", kind: "rect", ink: "near", x: 40, y: RISER, w: 1860, h: FLOOR - RISER + 6 },
    { id: "riser/lip", kind: "rect", ink: "brass", alpha: 0.5, x: 40, y: RISER, w: 1860, h: 4, edge: 0.2 },
    { id: "floor", kind: "rect", ink: "street", x: -2000, y: FLOOR, w: 6000, h: 900 },
  ];
}

/** Heads and shoulders between the camera and the band, nodding on the beat. */
function crowd(s: Shot, t: number, clear: [number, number]): Piece[] {
  const r = rng(`${s.cast.seed}/club/crowd`);
  const beat = beatAt(s.c, t);
  const out: Piece[] = [];
  for (let i = 0, x = -900; x < 3000; i++, x += r.range(190, 300)) {
    const y = r.range(985, 1040);
    const nod = r.chance(0.5) ? 5 * Math.abs(Math.sin(beat * Math.PI + i)) : 0;
    const w = r.range(150, 190);
    const hat = r.chance(0.3);
    if (x > clear[0] && x < clear[1]) continue;
    out.push({ id: `crowd${i}`, kind: "poly", ink: "near", pts: [[x - w / 2, y + 260], [x - w / 2, y + 60], [x - w * 0.36, y + 22], [x + w * 0.36, y + 22], [x + w / 2, y + 60], [x + w / 2, y + 260]] });
    out.push({ id: `crowd${i}/head`, kind: "circle", ink: "near", x: x + r.range(-6, 6), y: y - 30 + nod, r: r.range(36, 44) });
    if (hat) {
      out.push({ id: `crowd${i}/brim`, kind: "rect", ink: "near", x: x - 62, y: y - 58 + nod, w: 124, h: 10, edge: 0.3 });
      out.push({ id: `crowd${i}/crown`, kind: "rect", ink: "near", x: x - 38, y: y - 98 + nod, w: 76, h: 42, edge: 0.4 });
    }
  }
  return out;
}

/** Smoke hanging in the light. */
function haze(s: Shot, t: number): Piece[] {
  const r = rng(`${s.cast.seed}/club/haze`);
  return Array.from({ length: 9 }, (_, i): Piece => {
    const y = r.range(80, 640);
    const x = r.range(-200, 1900) + Math.sin(t * r.range(0.05, 0.12) + i) * 80;
    return { id: `haze${i}`, kind: "rect", ink: "smoke", alpha: 0.05, x: x - 300, y, w: r.range(500, 900), h: r.range(28, 60), edge: 1.4 };
  });
}

type Setup = "wide" | "solo" | "close" | "drums" | "shoulder";

export const clubScene: Scene = (s) => {
  const bar = s.variant === "bar";
  const band = seats(s);
  const lead = band.find((b) => b.who.chair === "lead");
  const drummer = band.find((b) => b.who.chair === "drums");
  // the hero: at a table on the left, or at the bar on the right with their back to us
  const hero = bar ? { x: 1640, y: 1090, z: 0.74, facing: -1 as const } : { x: 300, y: 1080, z: 0.8, facing: 1 as const };
  const order = shuffle(s.r, ["solo", "close", drummer ? "drums" : "solo", "shoulder", "wide"] as Setup[]);
  const spb = 60 / s.c.bpm;
  return (t) => {
    const voice = s.c.sections.find((x) => t >= x.t && t < x.end)?.voice;
    const star = band.find((b) => b.who.part === voice) ?? band.find((b) => (voice === "piano" || voice === "keys") && b.who.chair === "keys") ?? lead ?? band[0]!;
    const sp = setupSpan(s, t);
    const setup: Setup = sp.i === 0 ? (bar ? "shoulder" : "wide") : order[(sp.i - 1) % order.length]!;
    const b = breathe(s, t);
    const sx = star.x + star.facing * 60;
    let cam: Camera;
    if (setup === "wide") cam = blend(frame(1000, 640, 1.3 * b, W / 2, H * 0.5, 1.1), frame(1000, 660, 1.42 * b, W / 2, H * 0.5, 1), inOut(sp.k));
    else if (setup === "solo") cam = frame(sx, star.y - 170, lerp(1.9, 2.05, sp.k) * b, W * (star.x > 960 ? 0.62 : 0.38), H * 0.5);
    else if (setup === "close") cam = frame(sx + star.facing * 30, star.y - 220, 3.6 * b, W / 2, H * 0.48, 1, 0.04);
    else if (setup === "drums") cam = frame(drummer!.x + 100, drummer!.y - 140, 2.6 * b, W * 0.45, H * 0.5, drummer!.z, 0, drummer!.z);
    // over the shoulder: the camera moves right up behind them, so they loom and the band stays small
    else cam = frame(hero.x, hero.y - 280, lerp(0.8, 0.86, sp.k) * b, bar ? W * 0.78 : W * 0.22, H * 0.72, 1, 0.42, hero.z);

    // the players, back row first
    const back: Piece[] = [];
    const front: Piece[] = [];
    for (const seat of band) {
      const p = player(`p/${seat.who.chair}`, seat.who.chair === "drums" ? "snare" : seat.who.part, { id: `p/${seat.who.chair}`, x: seat.x, y: seat.y, scale: 0.92, facing: seat.facing }, playing(s, seat, t), { hat: seat.who.chair === "lead" ? "fedora" : "none", coat: "jacket" });
      (seat.z > 1 ? back : front).push(pool(`p/${seat.who.chair}/shadow`, seat.x + seat.facing * 40, seat.y + 2, 70, 6), ...p.pieces);
      if (seat.who.chair === "drums") back.push({ id: "kick/name", kind: "text", ink: "label", text: s.cast.band.name.split(" ")[1]!.toUpperCase(), x: seat.x + seat.facing * 150 * 0.92, y: seat.y - 54, size: 15, weight: 800, align: "center", spacing: 0.06 });
    }

    // the spot: on whoever has the tune, and it follows them when the tune moves
    const into = since(s.c.sections.map((x) => x.t), t);
    const swing = out3(into / (spb * 2));
    const spotX = star.x + star.facing * 50;
    const spot: Piece[] = [
      { id: "spot/cone", kind: "poly", ink: "spot", alpha: 0.1 + 0.08 * swing, pts: [[spotX - 30, -400], [spotX + 30, -400], [spotX + 170, star.y + 4], [spotX - 170, star.y + 4]] },
      { id: "spot/pool", kind: "poly", ink: "spot", alpha: 0.35, pts: Array.from({ length: 10 }, (_, i): [number, number] => [spotX + Math.cos((i / 10) * Math.PI * 2) * 180, star.y + 6 + Math.sin((i / 10) * Math.PI * 2) * 18]) },
    ];

    // the hero, still, a drink and a cigarette
    const lift = 0.5 + 0.5 * Math.sin(t * 0.5);
    const me = figure({ id: "fig", x: hero.x, y: hero.y, scale: 1.25, facing: hero.facing }, { walk: null, sit: true, smoke: lift > 0.8 ? 1 : 0, look: 0.08, lean: 0.06, hat: s.cast.hat, scarf: true, coat: "long" });
    const table: Piece[] = bar
      ? [
          { id: "bar/top", kind: "rect", ink: "wood", x: hero.x + 40, y: hero.y - 236, w: 1400, h: 24, edge: 0.4 },
          { id: "bar/front", kind: "rect", ink: "back", x: hero.x + 60, y: hero.y - 212, w: 1380, h: 600 },
          { id: "bar/rail", kind: "rect", ink: "brass", alpha: 0.6, x: hero.x + 60, y: hero.y - 60, w: 1380, h: 6, edge: 0.2 },
          ...[0, 1, 2].map((i): Piece => ({ id: `bar/glass${i}`, kind: "rect", ink: "smoke", alpha: 0.5, x: hero.x + 80 + i * 300, y: hero.y - 282, w: 26, h: 46, edge: 0.3 })),
        ]
      : [
          { id: "table/top", kind: "rect", ink: "near", x: hero.x + 90, y: hero.y - 190, w: 280, h: 18, edge: 0.4 },
          { id: "table/leg", kind: "rect", ink: "near", x: hero.x + 222, y: hero.y - 172, w: 16, h: 200, edge: 0.4 },
          { id: "table/glass", kind: "rect", ink: "smoke", alpha: 0.5, x: hero.x + 290, y: hero.y - 238, w: 30, h: 48, edge: 0.3 },
          { id: "table/shade", kind: "poly", ink: "near", pts: [[hero.x + 150, hero.y - 260], [hero.x + 210, hero.y - 260], [hero.x + 222, hero.y - 220], [hero.x + 138, hero.y - 220]] },
          { id: "table/lamp", kind: "poly", ink: "light", alpha: 0.7, pts: [[hero.x + 140, hero.y - 220], [hero.x + 220, hero.y - 220], [hero.x + 280, hero.y - 190], [hero.x + 80, hero.y - 190]] },
        ];
    const puffs = smoke("fig/smoke", me.ember ?? me.mouth, t - s.t0, spb * 3, -0.2);

    const layers: Layer[] = [
      { id: "room", z: 1.6, pieces: room(s) },
      { id: "back", z: 1.12, pieces: [STEP, ...back], cast: true },
      { id: "spot", z: 1.05, pieces: spot },
      { id: "band", z: 1, pieces: [...stand(), ...front], cast: true },
      { id: "haze", z: 0.95, pieces: haze(s, t) },
      { id: "crowd", z: 0.88, pieces: crowd(s, t, bar ? [1450, 2600] : [80, 760]), cast: true },
      { id: "hero", z: hero.z, pieces: [...(bar ? table : []), ...me.pieces, ...(bar ? [] : table), ...puffs], cast: true },
    ];
    return view(layers, cam, -1);
  };
};
