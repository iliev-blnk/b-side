import { rng } from "../../music/rng.ts";
import { lamp, lampLight, shops, smoke } from "../city.ts";
import { beatAt, count, glow, lights, since } from "../cues.ts";
import { figure } from "../rig.ts";
import { type Camera, type Layer, type Piece, W } from "../stage.ts";
import { along, BASE, blend, breathe, frame, inOut, lerp, out3, pool, type Scene, setupSpan, type Shot, shuffle, sky, town, view, weather } from "./kit.ts";

/**
 * The street: shopfronts lit under awnings, lamps every so often, the city stacked up behind.
 * Under the lamp the figure stops, lights up and looks at the sky; along the shops they walk, or
 * run, or walk out of the picture.
 */

export const LAMPS = Array.from({ length: 10 }, (_, i) => -400 + i * 900 + 1590);

/** The street set, from x0 to x1: shops, road, lamps and their light. */
export function set(s: Shot, t: number, x0: number, x1: number): { street: Piece[]; air: Piece[] } {
  const chord = lights(s.c, t);
  const street: Piece[] = [...shops("shops", x0, x1, BASE - 14, chord, "near", "lit"), { id: "road", kind: "rect", ink: "street", x: x0 - 400, y: BASE - 14, w: x1 - x0 + 800, h: 900, edge: 0.3 }];
  const air: Piece[] = [];
  for (const [i, x] of LAMPS.entries()) {
    if (x < x0 || x > x1) continue;
    const post = lamp(`lamp${i}`, x, BASE + 6, 410, "near");
    street.push(...post.pieces);
    air.push(...lampLight(`lamp${i}`, post.head, BASE, 150));
  }
  return { street, air };
}

/** Someone who stops under a lamp, lights a cigarette and looks up. */
export const lampScene: Scene = (s) => {
  const LAMP = LAMPS[0]!;
  const fx = LAMP - 64;
  const spb = 60 / s.c.bpm;
  const bar = spb * s.track.meter;
  const lightAt = s.t0 + bar;
  const lookAt = s.t0 + 2.6 * bar;
  const first = s.c.lead.find((n) => n.t >= s.t0)?.t ?? s.t0 + spb;
  const order = shuffle(s.r, [0, 1, 2]);
  return (t) => {
    const sp = setupSpan(s, t);
    const setup = sp.i === 0 ? 0 : order[sp.i % 3]!;
    const b = breathe(s, t);
    const look = inOut((t - lookAt) / (1.2 * bar)) * (0.7 + 0.3 * Math.sin(t * 0.4));
    let cam: Camera;
    if (setup === 0) {
      // the figure in the left third, the street and the sign over the shoulder; focus racks in on the first note
      const z = lerp(2.05, 2.3, sp.k) * b;
      cam = frame(fx, lerp(BASE - 160, BASE - 190, look), z, W * 0.3, 600, lerp(0.56, 1, out3((t - first) / 0.8)), lerp(0, 0.06, sp.k));
    } else if (setup === 1) {
      // close on the face and the ember
      cam = frame(fx + 20, BASE - 250, 3.4 * b, W * 0.42, 520, 1, 0.04);
    } else {
      // wide: the figure small under the light, the city above
      cam = frame(fx + 200, lerp(BASE - 380, BASE - 420, sp.k), 1.1 * b, W * 0.5, 540, 1);
    }
    const lift = out3((t - lightAt) / 0.45) - out3((t - (lightAt + 1.2 * bar)) / 0.5) * 0.85;
    const fig = figure({ id: "fig", x: fx, y: BASE + 4, scale: 1, facing: 1 }, { walk: null, smoke: Math.max(0, lift), look, wind: 0.25, scarf: true, hat: s.cast.hat });
    const puffs = t > lightAt ? smoke("smoke", fig.ember ?? fig.mouth, t - lightAt, spb * 2, 0.6) : [];
    const st = set(s, t, -1400, 3200);
    const rain = weather(s, t, cam);
    const layers: Layer[] = [
      { id: "sky", z: 14, pieces: sky(s.world, t) },
      ...town(s, t, { sign: s.world.sign }),
      ...rain.slice(0, 1),
      { id: "street", z: 1.05, pieces: st.street, cast: true },
      { id: "air", z: 1.03, pieces: st.air },
      { id: "fig", z: 1, pieces: [pool("fig/shadow", fx + 4, BASE + 6, 46, 6), ...fig.pieces, ...puffs], cast: true },
      ...rain.slice(1),
      railing(),
    ];
    return view(layers, cam);
  };
};

/** A railing between the camera and the street, close enough to whip past. */
function railing(): Layer {
  return {
    id: "front",
    z: 0.55,
    pieces: [
      { id: "rail", kind: "rect", ink: "near", x: -2400, y: 1004, w: 12000, h: 12, edge: 0.4 },
      ...Array.from({ length: 70 }, (_, i): Piece => ({ id: `rail/${i}`, kind: "rect", ink: "near", x: -2400 + i * 150, y: 1004, w: 10, h: 300, edge: 0.4 })),
    ],
  };
}

/** Along the shops: walking, running (and maybe followed), or walking out of the picture. */
export const walkScene: Scene = (s) => {
  const run = s.variant === "run";
  const away = s.variant === "away";
  const stepsPerBeat = run ? 2 : 1;
  const stepLen = run ? 96 : 52;
  // fast tunes walk at the half time
  const beatScale = s.c.bpm > 110 && !run ? 0.5 : run && s.c.bpm > 110 ? 0.6 : 1;
  const b0 = beatAt(s.c, s.t0);
  const X0 = away ? 600 : 200;
  const order = shuffle(s.r, [0, 1, 2, 3]);
  const chased = run && s.cast.weather !== "snow" && s.r.chance(0.7);
  return (t) => {
    const steps = (beatAt(s.c, t) - b0) * stepsPerBeat * beatScale;
    const fx = X0 + steps * stepLen;
    const sp = setupSpan(s, t);
    const setup = away ? 4 : order[sp.i % 4]!;
    const b = breathe(s, t);
    let cam: Camera;
    if (setup === 0) cam = frame(fx + 80, BASE - 170, 1.5 * b, W * 0.42, 560);
    else if (setup === 1) cam = frame(fx + 300, BASE - 330, 0.9 * b, W * 0.36, 520);
    else if (setup === 2) cam = frame(fx + 30, BASE - 230, 2.6 * b, W * 0.45, 520, 1, 0.03);
    else if (setup === 3) cam = frame(fx - 40, BASE - 120, 1.25 * b, W * 0.6, 640, 0.8);
    else {
      // the camera stops and lets them go, then lifts to the sky
      const k = along(s, t);
      const stop = X0 + 300;
      cam = blend(frame(stop, BASE - 300, 1.1 * b, W * 0.4, 560), frame(stop + 600, BASE - 1200, 0.95, W * 0.5, 540, 3), inOut((k - 0.55) / 0.45));
    }
    const fig = figure({ id: "fig", x: fx, y: BASE + 4, scale: 1, facing: 1 }, { walk: steps / 2, run, scarf: true, hat: s.cast.hat });
    const people: Piece[] = [pool("fig/shadow", fx + 4, BASE + 6, 40, 5), ...fig.pieces];
    if (chased) {
      // someone in a long coat, a few lamps behind, gaining on the hits
      const gain = count(s.cuts, t) * 60;
      const px = fx - 900 + gain + Math.sin(t * 0.7) * 60;
      people.unshift(...figure({ id: "them", x: px, y: BASE + 4, scale: 1, facing: 1 }, { walk: steps / 2 + 0.3, run: true, hat: "fedora", coat: "long" }).pieces);
    }
    const st = set(s, t, -1400, 9000);
    const rain = weather(s, t, cam);
    const flash = since(s.c.snares, t) < 0.08 && run ? 1 : 0;
    const layers: Layer[] = [
      { id: "sky", z: 14, pieces: sky(s.world, t) },
      ...town(s, t, { sign: s.world.sign, lit: 0.26 + 0.1 * flash }),
      ...rain.slice(0, 1),
      { id: "street", z: 1.05, pieces: st.street, cast: true },
      { id: "air", z: 1.03, pieces: st.air },
      { id: "fig", z: 1, pieces: people, cast: true },
      ...rain.slice(1),
      posts(s.track.seed),
    ];
    return view(layers, cam);
  };
};

/** Posts and meters on the near kerb: they whip past when the camera tracks. */
function posts(seed: string): Layer {
  const r = rng(`${seed}/posts`);
  const pieces: Piece[] = [];
  for (let x = -2000, i = 0; x < 11000; x += r.range(500, 900), i++) {
    const tall = r.chance(0.4);
    pieces.push({ id: `post${i}`, kind: "rect", ink: "near", x, y: tall ? 300 : 860, w: tall ? 22 : 16, h: tall ? 1000 : 400, edge: 0.4 });
    if (!tall) pieces.push({ id: `post${i}/head`, kind: "rect", ink: "near", x: x - 12, y: 820, w: 40, h: 52, edge: 0.5 });
  }
  return { id: "posts", z: 0.6, pieces };
}
