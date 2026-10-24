import type { Ink, Piece } from "./stage.ts";

/**
 * A cut-paper puppet, jointed at the hips, knees, shoulders, elbows and neck. Built in its own
 * units (about 300 tall standing, feet at the origin, facing +x), then placed, scaled and mirrored
 * into a layer. It walks, runs, sits, smokes and looks up, and its hands can be put on an
 * instrument: give them a target and the elbows find their own way.
 */

export type Pt = [number, number];

export type Hat = "fedora" | "cap" | "beret" | "none";

export interface Pose {
  /** Stride phase: one unit is two steps. Null when standing still. */
  walk: number | null;
  /** Running instead of walking. */
  run?: boolean;
  /** 0..1: the near hand brought up to the mouth with a cigarette. */
  smoke?: number;
  /** 0..1: the head tipped back to look up; negative looks down. */
  look?: number;
  /** -1..1: the coat and scarf blown back by the wind or the walk. */
  wind?: number;
  /** Sat on a stool or a bench. */
  sit?: boolean;
  /** Radians the body leans forward from the hips. */
  lean?: number;
  /** Where the hands go, in the puppet's own units; the elbows follow. */
  hands?: { near?: Pt; far?: Pt };
  hat?: Hat;
  /** A long coat to below the knee, or a jacket to the hips. */
  coat?: "long" | "jacket";
  /** The hero's scarf, in the record's colour. */
  scarf?: boolean;
}

export interface Placement {
  id: string;
  x: number;
  y: number;
  scale: number;
  facing: 1 | -1;
}

export interface Figure {
  pieces: Piece[];
  /** The tip of the cigarette, in layer units, while it is lit. */
  ember: Pt | null;
  /** Top of the head or hat, in layer units. */
  top: Pt;
  /** Where breath, smoke and a horn come out, in layer units and in the puppet's own. */
  mouth: Pt;
  mouthLocal: Pt;
  /** The near and far hands, in layer units. */
  hands: { near: Pt; far: Pt };
  /** The middle of the chest, in the puppet's units: instruments hang from here. */
  chest: Pt;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const TAU = Math.PI * 2;
const UPPER = 58;
const FORE = 52;

/** Where a limb segment ends: θ is measured from straight down, positive swinging forward. */
export const reach = ([x, y]: Pt, θ: number, len: number): Pt => [x + Math.sin(θ) * len, y + Math.cos(θ) * len];

/** Turns `p` by `a` radians around `c` (positive tips the top forward, toward +x). */
export const spin = ([x, y]: Pt, [cx, cy]: Pt, a: number): Pt => {
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
};

/** Two-bone reach: the elbow that puts the hand on `target`, bent downward. */
function elbowFor(s: Pt, target: Pt): { elbow: Pt; hand: Pt } {
  const dx = target[0] - s[0];
  const dy = target[1] - s[1];
  const d = Math.max(8, Math.min(Math.hypot(dx, dy), UPPER + FORE - 0.5));
  const a = Math.atan2(dy, dx);
  const hand: Pt = [s[0] + Math.cos(a) * d, s[1] + Math.sin(a) * d];
  const bend = Math.acos(Math.max(-1, Math.min(1, (UPPER * UPPER + d * d - FORE * FORE) / (2 * UPPER * d))));
  const e1: Pt = [s[0] + Math.cos(a + bend) * UPPER, s[1] + Math.sin(a + bend) * UPPER];
  const e2: Pt = [s[0] + Math.cos(a - bend) * UPPER, s[1] + Math.sin(a - bend) * UPPER];
  return { elbow: e1[1] > e2[1] ? e1 : e2, hand };
}

export function figure(at: Placement, pose: Pose): Figure {
  const { id, scale: s, facing } = at;
  const place = ([x, y]: Pt): Pt => [at.x + facing * x * s, at.y + y * s];
  const pieces: Piece[] = [];
  const poly = (name: string, ink: Ink, pts: Pt[]) => pieces.push({ id: `${id}/${name}`, kind: "poly", ink, pts: pts.map(place) });
  const disc = (name: string, ink: Ink, c: Pt, r: number) => {
    const [x, y] = place(c);
    pieces.push({ id: `${id}/${name}`, kind: "circle", ink, x, y, r: r * s });
  };
  /** A tapered limb from `a` to `b`, `w0` wide at the joint and `w1` at the far end. */
  const limb = (name: string, ink: Ink, a: Pt, b: Pt, w0: number, w1: number) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    poly(name, ink, [
      [a[0] + (nx * w0) / 2, a[1] + (ny * w0) / 2],
      [b[0] + (nx * w1) / 2, b[1] + (ny * w1) / 2],
      [b[0] - (nx * w1) / 2, b[1] - (ny * w1) / 2],
      [a[0] - (nx * w0) / 2, a[1] - (ny * w0) / 2],
    ]);
  };

  const walking = pose.walk !== null && !pose.sit;
  const run = walking && !!pose.run;
  const φ = (pose.walk ?? 0) * TAU;
  const stride = walking ? (run ? 0.78 : 0.42) : 0;
  const bob = walking ? (run ? -10 * Math.abs(Math.sin(φ)) : -4 * Math.abs(Math.cos(φ))) : 0;
  const wind = pose.wind ?? (run ? 1 : walking ? 0.6 : 0.15);
  const lean = (pose.lean ?? 0) + (run ? 0.2 : 0);
  const coat = pose.coat ?? "long";
  const hip: Pt = pose.sit ? [-4, -84] : [0, -136 + bob];
  /** Upper-body points are built upright, then leaned from the hip. */
  const body = (p: Pt): Pt => spin(p, hip, lean);
  const shoulder = body([hip[0] + 2, hip[1] - 96]);
  const neck = body([hip[0] + 3, hip[1] - 108]);
  const chest = body([hip[0] + 14, hip[1] - 60]);

  const leg = (name: string, ink: Ink, phase: number, side: number) => {
    let thigh: number;
    let knee: number;
    if (pose.sit) {
      thigh = 1.4 + side * 0.06;
      knee = 1.3 + side * 0.08;
    } else {
      thigh = stride * Math.sin(phase);
      knee = walking ? (run ? 0.2 + 1.3 * Math.max(0, Math.sin(phase + 1.6)) : 0.1 + 0.6 * Math.max(0, Math.sin(phase + 1.9))) : 0.04;
    }
    const k = reach(hip, thigh, 68);
    const ankle = reach(k, thigh - knee, 66);
    limb(`${name}/thigh`, ink, hip, k, 24, 19);
    limb(`${name}/shin`, ink, k, ankle, 18, 13);
    // the shoe stays flat, toe forward
    poly(`${name}/shoe`, ink, [[ankle[0] - 8, ankle[1] - 6], [ankle[0] + 22, ankle[1] - 2], [ankle[0] + 24, ankle[1] + 5], [ankle[0] - 9, ankle[1] + 5]]);
  };

  const arm = (name: string, ink: Ink, phase: number, target: Pt | undefined, smoke: number): Pt => {
    let elbow: Pt;
    let hand: Pt;
    if (target) ({ elbow, hand } = elbowFor(shoulder, target));
    else {
      const swing = walking ? (run ? -0.7 : -0.38) * Math.sin(phase) : 0.04;
      const bent = run ? 1.5 : 0.28;
      const upper = lerp(swing + lean * 0.5, 0.9, smoke);
      const fore = lerp(swing + bent + lean, 3.6, smoke);
      elbow = reach(shoulder, upper, UPPER);
      hand = reach(elbow, fore, FORE);
    }
    limb(`${name}/upper`, ink, shoulder, elbow, 19, 15);
    limb(`${name}/fore`, ink, elbow, hand, 15, 11);
    disc(`${name}/hand`, ink, hand, 6.5);
    return hand;
  };

  // far side first: it sits behind the coat
  leg("legB", "back", φ + Math.PI, -1);
  const farHand = arm("armB", "back", φ, pose.hands?.far, 0);
  leg("legF", "figure", φ, 1);

  // the coat, leaned with the body; its hem kicks back with the wind
  const hem = 18 * wind;
  const [hx, hy] = hip;
  if (coat === "long" && !pose.sit) {
    poly("coat", "figure", ([
      [hx - 20, hy - 102], [hx + 22, hy - 102], [hx + 27, hy - 34], [hx + 30, hy + 54], [hx + 8, hy + 58],
      [hx - 24 - hem, hy + 56], [hx - 27 - hem * 0.5, hy - 14],
    ] as Pt[]).map(body));
  } else {
    poly("coat", "figure", ([
      [hx - 20, hy - 102], [hx + 22, hy - 102], [hx + 26, hy - 30], [hx + 24, hy + 12], [hx - 22 - hem * 0.3, hy + 12], [hx - 24, hy - 30],
    ] as Pt[]).map(body));
  }
  const collar = (p: Pt) => spin(p, neck, lean * 0.5);
  poly("collar", "back", ([[neck[0] - 17, neck[1] - 4], [neck[0] + 13, neck[1] - 2], [neck[0] + 17, neck[1] + 18], [neck[0] - 21, neck[1] + 16]] as Pt[]).map(collar));
  if (pose.scarf) {
    poly("scarf", "trim", [[neck[0] - 15, neck[1] - 1], [neck[0] + 12, neck[1] + 1], [neck[0] + 11, neck[1] + 9], [neck[0] - 15, neck[1] + 8]]);
    // the tail hangs down the back and lifts with the wind
    const root: Pt = [neck[0] - 12, neck[1] + 5];
    limb("scarf/tail", "trim", root, reach(root, -(0.25 + 0.9 * wind), 22 + 18 * wind), 9, 7);
  }

  const smoke = pose.hands?.near ? 0 : (pose.smoke ?? 0);
  const nearHand = arm("armF", "figure", φ + Math.PI, pose.hands?.near, smoke);

  // the head tips back around the neck to look up
  const tip = -0.5 * (pose.look ?? 0) + lean * 0.6;
  const turn = (p: Pt): Pt => spin(p, neck, tip);
  const head: Pt = [neck[0] + 2, neck[1] - 17];
  const onHead = (pts: Pt[]) => pts.map(([x, y]) => turn([head[0] + x, head[1] + y - 2]));
  disc("head", "figure", turn(head), 15.5);
  poly("nose", "figure", [turn([head[0] + 12, head[1] - 4]), turn([head[0] + 20, head[1] + 4]), turn([head[0] + 12, head[1] + 6])]);
  const hat = pose.hat ?? "fedora";
  let crown = -36;
  if (hat === "fedora") {
    poly("brim", "figure", onHead([[-24, -10], [33, -10], [34, -3], [-25, -3]]));
    poly("crown", "figure", onHead([[-14, -10], [19, -10], [16, -34], [3, -30], [-12, -33]]));
    poly("band", pose.scarf ? "trim" : "back", onHead([[-14, -16], [19, -16], [18.4, -12], [-13.6, -12]]));
  } else if (hat === "cap") {
    poly("cap", "figure", onHead([[-17, -2], [-16, -16], [-4, -22], [14, -20], [18, -10], [30, -6], [30, -2]]));
    crown = -24;
  } else if (hat === "beret") {
    poly("beret", "figure", onHead([[-19, -6], [-14, -18], [4, -22], [20, -16], [16, -8]]));
    crown = -24;
  } else {
    poly("hair", "figure", onHead([[-16, 4], [-17, -10], [-6, -18], [10, -16], [15, -8], [6, -10], [-8, -6]]));
    crown = -20;
  }

  let ember: Pt | null = null;
  if (smoke > 0.6) {
    const b: Pt = [nearHand[0] + 13, nearHand[1] - 5];
    limb("cig", "moon", nearHand, b, 3, 3);
    ember = place(b);
  }
  const mouthLocal = turn([head[0] + 19, head[1] + 6]);
  return {
    pieces,
    ember,
    top: place(turn([head[0], head[1] + crown])),
    mouth: place(mouthLocal),
    mouthLocal,
    hands: { near: place(nearHand), far: place(farHand) },
    chest,
  };
}

/** Where a point in the puppet's units lands in the layer. */
export function placed(at: Placement, [x, y]: Pt): Pt {
  return [at.x + at.facing * x * at.scale, at.y + y * at.scale];
}
