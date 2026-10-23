import type { Track } from "../band/types.ts";
import { rng } from "../music/rng.ts";
import { beams, bridge, shops, drawSkyline, lamp, lampLight, neon, rain, skyline, smoke, tram, wire } from "./city.ts";
import { beatAt, count, cues } from "./cues.ts";
import { figure } from "./rig.ts";
import { type Camera, H, type Layer, type Piece, type View, W } from "./stage.ts";

/**
 * The night street, in two shots over the top of the title track. Over the intro the camera comes
 * down from the moon through the city as the figure walks in under a lamp. On the first beat of the
 * tune it cuts to the figure: the rain racks out of focus, they light up and look up, and the
 * title is set word by word on the melody.
 */

export interface Scene {
  /** Seconds, from the top of the track. */
  length: number;
  cuts: number[];
  at(t: number): View;
}

const SIGNS = ["HOTEL", "ROOMS", "BAR", "DINER", "RADIO", "DANCE", "TAXI", "CAFE"];
const clamp01 = (k: number) => Math.max(0, Math.min(1, k));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const inOut = (k: number) => {
  const x = clamp01(k);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
const out3 = (k: number) => 1 - (1 - clamp01(k)) ** 3;

/** The part of a layer the camera sees, in that layer's units. */
function seen(z: number, cam: Camera) {
  const ze = z - cam.d;
  const k = (cam.zoom * z) / ze;
  const toLayer = (sx: number, sy: number): [number, number] => [W / 2 + (sx - W / 2 + (cam.zoom * cam.x) / ze) / k, H / 2 + (sy - H / 2 + (cam.zoom * cam.y) / ze) / k];
  const [x0, y0] = toLayer(0, 0);
  const [x1, y1] = toLayer(W, H);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function street(track: Track): Scene {
  const c = cues(track);
  const r = rng(`${track.seed}/film/street`);
  const headAt = c.sections.findIndex((s) => s.kind === "head");
  const head = c.sections[headAt]!;
  const cut = head.t;
  const end = c.bars[head.startBar + 4] ?? head.end;
  const spb = 60 / c.bpm;

  const BASE = 900;
  const far = skyline(r.fork("far"), { x0: -700, x1: 2700, base: BASE, tall: [170, 440], wide: [60, 140], gap: 8, win: 6 });
  const mid = skyline(r.fork("mid"), { x0: -600, x1: 2600, base: BASE, tall: [280, 600], wide: [150, 280], gap: 60, win: 12 });
  const SIGN_X = 1330;
  const host = mid.buildings.find((b) => b.x <= SIGN_X && b.x + b.w >= SIGN_X);
  if (host && host.top > 300) host.top = 300;
  const word = r.pick(SIGNS);
  const LAMP_X = 1190;
  const post = lamp("lamp", LAMP_X, BASE + 6, 410, "near");
  const STOP = post.head[0] - 30;
  const START = 260;
  const walkFrom = cut * 0.28;
  const walkTo = cut * 0.9;
  const first = c.lead.find((n) => n.t >= cut)?.t ?? cut + spb;
  const words = track.title.toUpperCase().split(" ");
  const wordNotes = c.lead.filter((n) => n.t >= cut && n.t < end);
  const wordAt = words.map((_, i) => wordNotes[Math.min(wordNotes.length - 1, i * 2)]?.t ?? cut + i * spb);
  const bar = spb * track.meter;

  const camera = (t: number): Camera => {
    const e = c.sections.find((s) => t >= s.t && t < s.end)?.energy ?? 0.4;
    const breathe = 1 + 0.006 * e * Math.sin((beatAt(c, t) / track.meter) * Math.PI);
    if (t < cut) {
      // down from the moon to the street, easing in over the intro
      const k = t / cut;
      return { x: lerp(-140, 70, inOut(k)), y: lerp(-1300, 0, inOut(k * 1.08)), d: lerp(0, 0.16, k), zoom: breathe, focus: lerp(5, 1, inOut((k - 0.3) / 0.6)) };
    }
    const k = (t - cut) / (end - cut);
    const zoom = lerp(2.05, 2.3, k) * breathe;
    const look = inOut((t - (cut + 2.6 * bar)) / (1.2 * bar));
    return {
      x: 140 + 269 / zoom + lerp(0, 18, k),
      y: lerp(150, 112, look),
      d: lerp(0, 0.06, k),
      zoom,
      focus: lerp(0.56, 1, out3((t - first) / 0.8)),
    };
  };

  return {
    length: end,
    cuts: [0, cut],
    at(t: number): View {
      const cam = camera(t);
      const chord = count(c.chords, t);
      const hats = count(c.hats, t);
      const fall = hats * 46 + t * 150;

      // sky: the moon behind a strip of cloud, and searchlights sweeping
      const sky: Piece[] = [
        { id: "moon", kind: "circle", ink: "moon", x: 1430, y: 250, r: 64 },
        { id: "cloud1", kind: "rect", ink: "cloud", x: 1240, y: 246, w: 440, h: 15, edge: 0.6 },
        { id: "cloud2", kind: "rect", ink: "cloud", x: 1330, y: 286, w: 300, h: 9, edge: 0.5 },
        { id: "cloud3", kind: "rect", ink: "cloud", x: 260, y: 160, w: 520, h: 12, edge: 0.6 },
        ...beams("beam", [[420, 1000], [1700, 1000]], [-0.28 + 0.3 * Math.sin(t * 0.33), 0.24 + 0.28 * Math.sin(t * 0.27 + 2)], 1300, 70),
      ];

      // the tram crosses the line during the intro
      const tk = (t - cut * 0.12) / (cut * 0.7);
      const line: Piece[] = [wire("wire", -900, 2900, 410, "mid"), ...bridge("line", -900, 2900, 560, BASE, "mid")];
      if (tk > 0 && tk < 1) line.push(...tram("tram", lerp(-800, 2500, tk), 560, 300, "mid", "lit"));

      // the figure: walks in on the beat, stops under the lamp; after the cut, a smoke and a look up
      const walking = t >= walkFrom && t < walkTo;
      const wk = clamp01((t - walkFrom) / (walkTo - walkFrom));
      const fx = t < cut ? lerp(START, STOP, wk) : STOP;
      const steps = beatAt(c, Math.min(t, walkTo)) - beatAt(c, walkFrom);
      const lift = t < cut ? 0 : out3((t - (cut + bar)) / 0.45) - out3((t - (cut + 2.2 * bar)) / 0.5) * 0.85;
      const look = t < cut ? 0 : inOut((t - (cut + 2.6 * bar)) / (1.2 * bar));
      const fig = figure({ id: "fig", x: fx, y: BASE + 4, scale: 1, facing: 1 }, { walk: walking ? steps / 2 : null, smoke: lift, look, wind: walking ? 0.7 : 0.25 });
      const puffs = t > cut + bar ? smoke("smoke", fig.ember ?? fig.mouth, t - (cut + bar), spb * 2, 0.6) : [];
      const pool: [number, number][] = Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        return [fx + 4 + Math.cos(a) * 46, BASE + 6 + Math.sin(a) * 6];
      });

      const near = seen(1.8, cam);
      const front = seen(0.55, cam);
      const layers: Layer[] = [
        { id: "sky", z: 14, pieces: sky },
        { id: "far", z: 6, pieces: drawSkyline("far", far, "far", "farLit", chord, 0.2), cast: true },
        {
          id: "mid",
          z: 3,
          pieces: [...drawSkyline("mid", mid, "mid", "lit", chord, 0.26), ...neon("sign", word, SIGN_X, 330, 44, rng(`flicker/${count(c.beats, t)}`).next() > 0.07, "near")],
          cast: true,
        },
        { id: "line", z: 2, pieces: line, cast: true },
        { id: "rain2", z: 1.8, pieces: rain("rain2", rng(`${track.seed}/rain2`), 130, near, 26, fall * 0.8) },
        { id: "street", z: 1.05, pieces: [...shops("shops", -900, 1010, BASE - 14, chord, "near", "lit"), { id: "road", kind: "rect", ink: "street", x: -1200, y: BASE - 14, w: 4400, h: 900, edge: 0.3 }, ...post.pieces], cast: true },
        { id: "air", z: 1.03, pieces: lampLight("lamp", post.head, BASE, 150) },
        { id: "fig", z: 1, pieces: [{ id: "fig/shadow", kind: "poly", ink: "shade", pts: pool }, ...fig.pieces, ...puffs], cast: true },
        {
          id: "front",
          z: 0.55,
          pieces: [
            ...rain("rain", rng(`${track.seed}/rain`), 34, front, 44, fall),
            { id: "rail", kind: "rect", ink: "near", x: -1200, y: 1004, w: 4400, h: 12, edge: 0.4 },
            ...Array.from({ length: 30 }, (_, i): Piece => ({ id: `rail/${i}`, kind: "rect", ink: "near", x: -1200 + i * 150, y: 1004, w: 10, h: 300, edge: 0.4 })),
          ],
        },
      ];

      if (t >= cut) {
        // the title is set on a strip of black paper laid down on the first note
        const plate = out3((t - wordAt[0]!) / 0.3);
        const type: Piece[] = plate > 0 ? [{ id: "title/plate", kind: "rect", ink: "near", x: 1110, y: 534, w: (Math.max(...words.map((w) => w.length)) * 92 * 0.7 + 80) * plate, h: (words.length - 1) * 104 + 146, edge: 0.5 }] : [];
        words.forEach((w, i) => {
          const k = out3((t - wordAt[i]!) / 0.22);
          if (k <= 0) return;
          type.push({ id: `title/${i}`, kind: "text", ink: "type", text: w, x: 1150, y: 640 + i * 104 + (1 - k) * 40, size: 92, weight: 800, spacing: 0.04 });
        });
        layers.push({ id: "type", z: 1, fixed: true, pieces: type });
      }
      return { layers, cam, light: 1 };
    },
  };
}
