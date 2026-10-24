import type { Part } from "../band/types.ts";
import { figure, type Hat, placed, type Placement, type Pose, type Pt, spin } from "./rig.ts";
import type { Ink, Piece } from "./stage.ts";

/**
 * The band, as puppets with their instruments. Each player is posed by how they are playing right
 * now: a horn comes up to the mouth when its player has the tune and lifts on the high notes, sticks
 * come down on the hits, the bass player's hand walks the neck, the pianist rocks into the chords.
 */

export interface Play {
  /** Has the tune, or is comping; a horn that is not playing is held down. */
  on: boolean;
  /** 0..1, how hard the last note was played, falling away after it. */
  note: number;
  /** 0..1, how high the last note sits in the instrument's range. */
  pitch: number;
  /** 0..1 strike for the near and far hands (sticks, mallets, hands on keys or skins). */
  strike: [number, number];
  /** Beats elapsed, for the body to move in time. */
  beat: number;
}

export interface Player {
  pieces: Piece[];
  top: Pt;
  mouth: Pt;
}

const HORNS: Part[] = ["sax", "trumpet", "trombone", "flute", "clarinet", "harmonica"];
const BARS: Part[] = ["vibes", "glock", "marimba"];
const dir = (a: number): Pt => [Math.cos(a), Math.sin(a)];
const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k];
const along = (a: Pt, b: Pt, k: number): Pt => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];

/** Paper cut in the puppet's own units, placed like the puppet. */
function cutter(at: Placement, out: Piece[]) {
  const P = (p: Pt) => placed(at, p);
  const poly = (name: string, ink: Ink, pts: Pt[], edge?: number) => out.push({ id: `${at.id}/${name}`, kind: "poly", ink, pts: pts.map(P), edge });
  return {
    poly,
    disc(name: string, ink: Ink, c: Pt, r: number) {
      const [x, y] = P(c);
      out.push({ id: `${at.id}/${name}`, kind: "circle", ink, x, y, r: r * at.scale });
    },
    ring(name: string, ink: Ink, c: Pt, r: number, inner: number) {
      const [x, y] = P(c);
      out.push({ id: `${at.id}/${name}`, kind: "ring", ink, x, y, r: r * at.scale, inner: inner * at.scale });
    },
    /** A tube from `a` to `b`, `w0` wide at `a` and `w1` at `b`. */
    tube(name: string, ink: Ink, a: Pt, b: Pt, w0: number, w1 = w0, edge = 0.3) {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      const n: Pt = [-dy / len, dx / len];
      poly(name, ink, [add(a, n, w0 / 2), add(b, n, w1 / 2), add(b, n, -w1 / 2), add(a, n, -w0 / 2)], edge);
    },
    box(name: string, ink: Ink, x: number, y: number, w: number, h: number, edge = 0.5) {
      poly(name, ink, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], edge);
    },
  };
}

/** One player and their instrument. */
export function player(id: string, part: Part, at: Placement, play: Play, dress: { hat: Hat; coat?: "long" | "jacket" }): Player {
  const base: Pose = { walk: null, hat: dress.hat, coat: dress.coat ?? "jacket", wind: 0.1 };
  const sway = Math.sin(play.beat * Math.PI) * 0.03;

  // seated players: keys and drums
  if (part === "piano" || part === "keys" || part === "snare" || part === "kick" || part === "hat" || part === "ride" || part === "brush") {
    return seated(id, part === "piano" || part === "keys" ? part : "drums", at, play, base, sway);
  }
  const lean = play.on ? 0.05 + 0.1 * play.note + sway : sway * 0.5;
  // where the mouth will be, so a horn can be put to it
  const probe = figure({ ...at, id: `${id}/probe` }, { ...base, lean, look: 0 });
  const M = probe.mouthLocal;
  const out: Piece[] = [];
  const c = cutter({ ...at, id }, out);
  let hands: { near?: Pt; far?: Pt } | undefined;
  const after: (() => void)[] = [];
  let look = 0;

  if (HORNS.includes(part) && !play.on) {
    // resting: the horn hangs from the near hand
    const h: Pt = [24, -150];
    hands = { near: h };
    after.push(() => {
      if (part === "harmonica") return;
      const len = part === "trombone" ? 120 : part === "flute" ? 120 : 90;
      c.tube("horn", part === "flute" ? "smoke" : "brass", add(h, [-4, -14]), add(h, dir(1.25), len), 6, part === "trumpet" || part === "trombone" ? 22 : 9);
    });
  } else if (part === "trumpet") {
    // the bell lifts on the high notes and when it is played hard
    const a = -0.06 - 0.32 * play.note * (0.4 + play.pitch);
    look = 0.5 * play.note;
    const d = dir(a);
    const down = dir(a + Math.PI / 2);
    const end = add(M, d, 92);
    hands = { near: add(add(M, d, 42), down, 13), far: add(add(M, d, 28), down, 10) };
    after.push(() => {
      c.tube("pipe", "brass", M, end, 5, 6);
      c.tube("slide", "brass", add(add(M, d, 22), down, 9), add(add(M, d, 70), down, 9), 5);
      c.box("valves", "brass", ...valveBox(add(add(M, d, 40), down, 5)), 0.2);
      c.poly("bell", "brass", [add(end, down, 4), add(add(end, d, 30), down, 21), add(add(end, d, 30), down, -21), add(end, down, -4)]);
    });
  } else if (part === "sax") {
    // a tenor swung up from the hip when it gets loud
    const tilt = -0.18 * play.note;
    const R = (p: Pt) => spin(p, M, tilt);
    const neck = R([M[0] + 10, M[1] + 30]);
    const top = R([M[0] + 16, M[1] + 46]);
    const bow = R([M[0] + 36, -126]);
    const bell = R([M[0] + 66, -170]);
    hands = { far: along(top, bow, 0.3), near: along(top, bow, 0.75) };
    after.push(() => {
      c.tube("neck", "brass", M, neck, 4, 5);
      c.tube("crook", "brass", neck, top, 5, 9);
      c.tube("body", "brass", top, bow, 12, 24);
      c.tube("bow", "brass", add(bow, [-6, 0]), add(bow, [20, -4]), 26, 24);
      c.tube("rise", "brass", add(bow, [14, 0]), bell, 22, 34, 0.4);
    });
  } else if (part === "clarinet" || part === "flute") {
    const flute = part === "flute";
    const θ = flute ? -0.05 - 0.1 * play.note : 1.05 - 0.45 * play.note * (0.5 + play.pitch);
    const end = add(M, dir(θ), flute ? 128 : 122);
    const start = flute ? add(M, [-10, 4]) : M;
    hands = { far: along(start, end, flute ? 0.42 : 0.33), near: along(start, end, flute ? 0.82 : 0.72) };
    after.push(() => {
      c.tube("body", flute ? "smoke" : "back", start, end, 6, 7);
      if (!flute) c.tube("bell", "back", along(start, end, 0.87), add(end, dir(θ), 4), 8, 18);
      c.tube("keys", flute ? "moon" : "brass", along(start, end, 0.4), along(start, end, 0.8), 2, 2, 0.1);
    });
    look = flute ? 0 : -0.15;
  } else if (part === "trombone") {
    const reachOut = 30 + 80 * (1 - play.pitch);
    const a = -0.04 - 0.12 * play.note;
    const d = dir(a);
    const down = dir(a + Math.PI / 2);
    const tip = add(add(M, d, 92 + reachOut), down, 18);
    hands = { far: add(add(M, d, 30), down, 12), near: add(tip, d, -10) };
    after.push(() => {
      c.tube("bellpipe", "brass", M, add(M, d, 86), 5);
      c.poly("bell", "brass", [add(add(M, d, 70), down, -4), add(add(M, d, 100), down, -24), add(add(M, d, 100), down, 18), add(add(M, d, 70), down, 4)]);
      c.tube("slide1", "brass", add(M, down, 6), add(add(M, d, 92 + reachOut), down, 6), 4);
      c.tube("slide2", "brass", add(M, down, 18), tip, 4);
      c.tube("crook", "brass", add(add(M, d, 92 + reachOut), down, 4), add(tip, down, 2), 6);
    });
  } else if (part === "harmonica") {
    hands = { near: add(M, [6, 6]), far: add(M, [0, 10]) };
    look = 0.15 * play.note;
    after.push(() => c.box("harp", "brass", M[0] - 4, M[1] - 2, 20, 9, 0.2));
  } else if (BARS.includes(part)) {
    // a frame of bars at hip height; the mallets come down in turn
    const y = -142;
    const left = 30;
    const width = part === "glock" ? 130 : 220;
    const strike = (k: number, x: number): Pt => [x, y - 18 - 40 * (1 - k)];
    const nx = left + 40 + 50 * Math.sin(play.beat * 0.9);
    const fx = nx + 46;
    hands = { near: strike(play.strike[0], nx), far: strike(play.strike[1], fx) };
    after.push(() => {
      c.box("frame", "back", left, y, width, 14);
      c.tube("leg1", "back", [left + 10, y], [left + 6, 0], 6);
      c.tube("leg2", "back", [left + width - 10, y], [left + width - 6, 0], 6);
      for (let i = 0; i < width / 14 - 1; i++) c.box(`bar${i}`, part === "marimba" ? "wood" : "brass", left + 6 + i * 14, y - 7, 10, 9, 0.2);
      for (const [k, h] of [["n", hands!.near!], ["f", hands!.far!]] as const) {
        const head = add(h, [20, 20]);
        c.tube(`mallet${k}`, "back", h, head, 2.5);
        c.disc(`mallet${k}/head`, "moon", head, 5);
      }
    });
    look = -0.35;
  } else if (part === "bass") {
    // the bass stands in front, leant back against the player; the far hand walks the neck
    const pos = 0.5 + 0.5 * Math.sin(play.beat * 0.5);
    hands = { far: [34 - 6 * pos, -250 + 60 * pos], near: [62, -150 + 14 * play.strike[0]] };
    after.push(() => {
      const R = (p: Pt) => spin(p, [60, 0], -0.16);
      const body: Pt[] = [[22, -40], [16, -100], [30, -130], [24, -170], [40, -196], [80, -196], [96, -170], [90, -130], [104, -100], [98, -40], [76, -16], [44, -16]];
      c.poly("bass", "wood", body.map(R));
      c.tube("ff", "near", R([48, -100]), R([46, -64]), 3, 3, 0.2);
      c.tube("ff2", "near", R([72, -100]), R([74, -64]), 3, 3, 0.2);
      c.tube("neck", "wood", R([60, -190]), R([60, -320]), 12, 10);
      c.disc("scroll", "wood", R([60, -326]), 9);
      c.tube("strings", "moon", R([60, -50]), R([60, -316]), 2, 1, 0.05);
      c.tube("pin", "back", R([60, -16]), R([60, 0]), 4, 3);
    });
    look = -0.2;
  } else {
    // hand drums: two congas in front, hands come down on the hits
    const y = -168;
    hands = { near: [70, y - 4 - 38 * (1 - play.strike[0])], far: [118, y - 10 - 38 * (1 - play.strike[1])] };
    after.push(() => {
      c.poly("conga1", "wood", [[44, y], [96, y], [92, -60], [80, 0], [60, 0], [48, -60]]);
      c.poly("conga2", "wood", [[96, y - 8], [144, y - 8], [140, -66], [130, 0], [110, 0], [100, -66]]);
      c.box("skin1", "paper", 44, y - 6, 52, 6, 0.2);
      c.box("skin2", "paper", 96, y - 14, 48, 6, 0.2);
    });
    look = -0.3;
  }

  const fig = figure({ ...at, id }, { ...base, lean, look, hands });
  after.forEach((f) => f());
  return { pieces: [...fig.pieces, ...out], top: fig.top, mouth: fig.mouth };
}

const valveBox = ([x, y]: Pt): [number, number, number, number] => [x - 9, y - 4, 18, 20];

function seated(id: string, kind: "piano" | "keys" | "drums", at: Placement, play: Play, base: Pose, sway: number): Player {
  const pre: Piece[] = [];
  const post: Piece[] = [];
  const back = cutter({ ...at, id }, pre);
  const front = cutter({ ...at, id }, post);
  let hands: { near: Pt; far: Pt };
  let lean = 0.12 + sway;
  let look = -0.3;
  // the stool
  back.box("stool", "back", -40, -84, 64, 12);
  back.tube("stoolLeg", "back", [-8, -72], [-8, 0], 8);

  if (kind === "drums") {
    const y = -118;
    // sticks come down from high on each stroke
    hands = { near: [62, y - 22 - 46 * (1 - play.strike[0])], far: [118, y - 46 - 40 * (1 - play.strike[1])] };
    back.tube("hatStand", "back", [140, 0], [140, -172], 4);
    back.poly("hatTop", "brass", [[106, -176], [174, -176], [170, -170], [110, -170]], 0.2);
    back.poly("hatBottom", "brass", [[106, -168], [174, -168], [170, -162], [110, -162]], 0.2);
    back.tube("rideStand", "back", [236, 0], [226, -226], 4);
    back.poly("ride", "brass", spinAll([[176, -232], [276, -232], [272, -224], [180, -224]], [226, -228], -0.12), 0.2);
    front.disc("kick", "back", [150, -64], 62);
    front.ring("kickRim", "brass", [150, -64], 62, 54);
    front.box("tom", "back", 110, -170, 54, 36);
    front.box("snare", "back", 46, y, 70, 24);
    front.box("snareRim", "brass", 44, y - 3, 74, 4, 0.2);
    front.tube("snareLeg", "back", [80, y + 24], [80, 0], 4);
    lean = 0.08 + 0.1 * Math.max(play.strike[0], play.strike[1]);
    look = -0.1;
    const fig = figure({ ...at, id }, { ...base, sit: true, lean, look, hands });
    const sticks = cutter({ ...at, id }, post);
    sticks.tube("stickN", "moon", local(at, fig.hands.near), add(local(at, fig.hands.near), [46, 14]), 3, 2, 0.1);
    sticks.tube("stickF", "moon", local(at, fig.hands.far), add(local(at, fig.hands.far), [42, 18]), 3, 2, 0.1);
    return { pieces: [...pre, ...fig.pieces, ...post], top: fig.top, mouth: fig.mouth };
  }

  // keys: the hands rock on the chords, one then the other
  const y = kind === "piano" ? -134 : -140;
  hands = {
    near: [70 + 22 * Math.sin(play.beat * 0.7), y - 4 - 16 * play.strike[0]],
    far: [104 + 18 * Math.sin(play.beat * 0.5 + 1), y - 6 - 14 * play.strike[1]],
  };
  lean = 0.2 + 0.08 * play.note + sway;
  if (kind === "piano") {
    // a grand, side on, lid up
    front.poly("case", "near", [[40, y], [420, y - 4], [430, y + 30], [40, y + 34]]);
    front.box("keys", "paper", 40, y - 6, 86, 8, 0.15);
    front.tube("leg1", "near", [60, y + 30], [56, 0], 12);
    front.tube("leg2", "near", [400, y + 30], [404, 0], 12);
    front.tube("pedals", "near", [110, y + 30], [116, -10], 6, 10);
    back.poly("lid", "near", [[150, y - 6], [430, y - 8], [380, y - 150]]);
    back.tube("prop", "back", [300, y - 6], [330, y - 96], 3);
  } else {
    front.box("case", "back", 36, y, 210, 30);
    front.box("keys", "paper", 40, y - 4, 160, 5, 0.15);
    front.tube("legA", "back", [60, y + 30], [200, 0], 6);
    front.tube("legB", "back", [200, y + 30], [60, 0], 6);
  }
  const fig = figure({ ...at, id }, { ...base, sit: true, lean, look, hands });
  return { pieces: [...pre, ...fig.pieces, ...post], top: fig.top, mouth: fig.mouth };
}

const spinAll = (pts: Pt[], c: Pt, a: number) => pts.map((p) => spin(p, c, a));
/** Back from layer units to the puppet's own. */
const local = (at: Placement, [x, y]: Pt): Pt => [((x - at.x) / at.scale) * at.facing, (y - at.y) / at.scale];
