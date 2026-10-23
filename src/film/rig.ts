import type { Ink, Piece } from "./stage.ts";

/**
 * The figure: a cut-paper puppet in a hat and a long coat, jointed at the hips, knees, shoulders,
 * elbows and neck. Built in its own units (about 300 tall, feet at the origin, facing +x), then
 * placed, scaled and mirrored into a layer.
 */

type Pt = [number, number];

export interface Pose {
  /** Stride phase: one unit is two steps. Null when standing still. */
  walk: number | null;
  /** 0..1: the near hand brought up to the mouth. */
  smoke: number;
  /** 0..1: the head tipped back to look up. */
  look: number;
  /** -1..1: the coat and scarf blown back by the wind or the walk. */
  wind?: number;
}

export interface Placement {
  id: string;
  x: number;
  y: number;
  scale: number;
  facing: 1 | -1;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const TAU = Math.PI * 2;

/** Where a limb segment ends: θ is measured from straight down, positive swinging forward. */
const reach = ([x, y]: Pt, θ: number, len: number): Pt => [x + Math.sin(θ) * len, y + Math.cos(θ) * len];

export interface Figure {
  pieces: Piece[];
  /** The tip of the cigarette, in layer units, while it is lit. */
  ember: Pt | null;
  /** Top of the hat, in layer units. */
  top: Pt;
  /** Where breath and smoke come out. */
  mouth: Pt;
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

  const φ = (pose.walk ?? 0) * TAU;
  const walking = pose.walk !== null;
  const stride = walking ? 0.42 : 0;
  const bob = walking ? -4 * Math.abs(Math.cos(φ)) : 0;
  const wind = pose.wind ?? (walking ? 0.6 : 0.15);
  const hip: Pt = [0, -136 + bob];
  const shoulder: Pt = [2, -232 + bob];
  const neck: Pt = [3, -244 + bob];

  const leg = (name: string, ink: Ink, phase: number) => {
    const thigh = stride * Math.sin(phase);
    const knee = walking ? 0.1 + 0.6 * Math.max(0, Math.sin(phase + 1.9)) : 0.04;
    const k = reach(hip, thigh, 68);
    const ankle = reach(k, thigh - knee, 66);
    limb(`${name}/thigh`, ink, hip, k, 24, 19);
    limb(`${name}/shin`, ink, k, ankle, 18, 13);
    // the shoe stays flat on the ground, toe forward
    poly(`${name}/shoe`, ink, [[ankle[0] - 8, ankle[1] - 6], [ankle[0] + 22, ankle[1] - 2], [ankle[0] + 24, ankle[1] + 5], [ankle[0] - 9, ankle[1] + 5]]);
  };
  const arm = (name: string, ink: Ink, phase: number, smoke: number) => {
    const swing = walking ? -0.38 * Math.sin(phase) : 0.04;
    const upper = lerp(swing, 0.9, smoke);
    const fore = lerp(swing + 0.28, 3.6, smoke);
    const elbow = reach(shoulder, upper, 58);
    const hand = reach(elbow, fore, 52);
    limb(`${name}/upper`, ink, shoulder, elbow, 19, 15);
    limb(`${name}/fore`, ink, elbow, hand, 15, 11);
    disc(`${name}/hand`, ink, hand, 6.5);
    return hand;
  };

  // far side first: it sits behind the coat
  leg("legB", "back", φ + Math.PI);
  arm("armB", "back", φ, 0);
  leg("legF", "figure", φ);

  // the coat: shoulders to below the knee, its hem kicking back with the wind
  const hem = 18 * wind;
  poly("coat", "figure", [
    [-20, shoulder[1] - 6], [22, shoulder[1] - 6], [27, -170 + bob], [30, -82 + bob], [8, -78 + bob],
    [-24 - hem, -80 + bob], [-27 - hem * 0.5, -150 + bob],
  ]);
  // collar up, and the scarf: the figure's one colour
  poly("collar", "back", [[-14, neck[1] - 4], [16, neck[1] - 2], [20, neck[1] + 18], [-18, neck[1] + 16]]);
  poly("scarf", "trim", [[-12, neck[1] - 1], [15, neck[1] + 1], [14, neck[1] + 9], [-12, neck[1] + 8]]);
  // the tail hangs down the back and lifts with the wind
  const tail = 22 + 18 * wind;
  const fly = 0.25 + 0.9 * wind;
  const root: Pt = [-9, neck[1] + 5];
  limb("scarf/tail", "trim", root, reach(root, -fly, tail), 9, 7);

  const hand = arm("armF", "figure", φ + Math.PI, pose.smoke);

  // the head tips back around the neck to look up
  const tip = -0.5 * pose.look;
  const turn = ([x, y]: Pt): Pt => {
    const dx = x - neck[0];
    const dy = y - neck[1];
    return [neck[0] + dx * Math.cos(tip) - dy * Math.sin(tip), neck[1] + dx * Math.sin(tip) + dy * Math.cos(tip)];
  };
  const head: Pt = [5, neck[1] - 17];
  const onHead = (pts: Pt[]) => pts.map(([x, y]) => turn([head[0] + x, head[1] + y - 2]));
  disc("head", "figure", turn(head), 15.5);
  poly("nose", "figure", [turn([head[0] + 12, head[1] - 4]), turn([head[0] + 20, head[1] + 4]), turn([head[0] + 12, head[1] + 6])]);
  poly("brim", "figure", onHead([[-24, -10], [33, -10], [34, -3], [-25, -3]]));
  poly("crown", "figure", onHead([[-14, -10], [19, -10], [16, -34], [3, -30], [-12, -33]]));
  poly("band", "trim", onHead([[-14, -16], [19, -16], [18.4, -12], [-13.6, -12]]));

  let ember: Pt | null = null;
  if (pose.smoke > 0.6) {
    const a = hand;
    const b: Pt = [hand[0] + 13, hand[1] - 5];
    limb("cig", "moon", a, b, 3, 3);
    ember = place(b);
  }
  return { pieces, ember, top: place(turn([head[0], head[1] - 36])), mouth: place(turn([head[0] + 19, head[1] + 6])) };
}
