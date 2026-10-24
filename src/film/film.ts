import { trackStarts, cutSeconds, sideSeconds } from "../band/side.ts";
import { secondsAt } from "../band/time.ts";
import type { Ep } from "../band/types.ts";
import { rng } from "../music/rng.ts";
import { type Cast, cast } from "./cast.ts";
import { count, cues, type Cues } from "./cues.ts";
import { type Scene, type Shot, type World, world } from "./scenes/kit.ts";
import { SCENES } from "./scenes/index.ts";
import { finish, type Look, paint, type Piece, scratch, type View, W } from "./stage.ts";
import { type SceneName, story, type Transition } from "./story.ts";
import { credits } from "./type.ts";

/**
 * A night's film: three acts cut to the three tracks of the side, one scene for each section of
 * each tune, new setups on the band's hits, and paper transitions at the turns of the form. Time is
 * the side's: zero is the needle down, the same clock the music is played on.
 */

export interface FilmShot {
  scene: SceneName;
  variant: string;
  into: Transition;
  /** Which track, and that track's music time zero on the side's clock. */
  n: number;
  offset: number;
  /** On the side's clock. */
  start: number;
  end: number;
  /** How long the transition into this shot takes. */
  blend: number;
  /** Where the setup changes inside the shot, on the side's clock. */
  cuts: number[];
  at: (t: number) => View;
}

export interface Frame {
  view: View;
  /** The shot being left, while a transition is under way. */
  prev?: View;
  mix?: { kind: Transition; k: number; seed: string };
  /** Screen type over everything: credits, titles, cards. */
  type: Piece[];
}

export interface Film {
  length: number;
  shots: FilmShot[];
  starts: number[];
  ep: Ep;
  cast: Cast;
  cues: Cues[];
  /** Which shot is up at `t`. */
  shotAt(t: number): number;
  at(t: number): Frame;
}

export interface Sleeve {
  no: number;
  day: string;
}

/** The shortest a section may be and still get its own scene; shorter ones run on the last. */
const MIN_SHOT = 4;

export function film(ep: Ep, sleeve: Sleeve): Film {
  const c0 = cast(ep);
  const w: World = world(c0);
  const starts = trackStarts(ep);
  const all = ep.tracks.map(cues);
  const shots: FilmShot[] = [];

  ep.tracks.forEach((track, n) => {
    const c = all[n]!;
    const beats = story(track, ep.mood, n);
    const hits = track.hits.map((b) => secondsAt(track, b));
    const spb = 60 / track.bpm;
    const pieces: { from: number; to: number; i: number }[] = [];
    c.sections.forEach((sec, i) => {
      const last = pieces.at(-1);
      if (last && sec.end - sec.t < MIN_SHOT && beats[i]!.scene !== "record") last.to = sec.end;
      else pieces.push({ from: sec.t, to: sec.end, i });
    });
    // the last scene runs out the ring of the last chord; the gap after it belongs to the card, or the record
    const tail = n === 2 ? cutSeconds(track) - 0.05 : track.lengthSec;
    pieces.at(-1)!.to = Math.max(pieces.at(-1)!.to, tail);
    if (n === 0) pieces[0]!.from = -starts[0]!;

    for (const p of pieces) {
      const b = beats[p.i]!;
      const sec = c.sections[p.i]!;
      // setups change on the hits, no closer together than the tempo allows
      const gap = Math.max(ep.mood === "chase" ? 1.2 : 1.8, spb * 2);
      const cuts: number[] = [];
      for (const h of hits) if (h > p.from + gap && h < p.to - gap && h - (cuts.at(-1) ?? -Infinity) >= gap) cuts.push(h);
      // where the band leaves a long stretch without a hit, the camera moves on with the phrase
      const barSec = track.meter * spb;
      const phrase = barSec * Math.max(1, Math.round((ep.mood === "chase" ? 3.5 : 5.5) / barSec));
      const edges = [p.from, ...cuts, p.to];
      for (let j = 1; j < edges.length; j++) {
        let last = edges[j - 1]!;
        for (const b of c.bars) {
          if (b - last >= phrase * 0.95 && edges[j]! - b >= phrase * 0.6) {
            cuts.push(b);
            last = b;
          }
        }
      }
      cuts.sort((a, b) => a - b);
      const shot: Shot = { track, c, cast: c0, world: w, t0: p.from, t1: p.to, cuts, section: sec, act: n, variant: b.variant, r: rng(`${track.seed}/film/${p.i}`) };
      const scene: Scene = SCENES[b.scene];
      shots.push({
        scene: b.scene,
        variant: b.variant,
        into: b.into,
        n,
        offset: starts[n]!,
        start: starts[n]! + p.from,
        end: starts[n]! + p.to,
        blend: b.into === "cut" ? 0 : Math.min(0.9, Math.max(0.4, spb * (b.into === "iris" ? 2 : 1))),
        cuts: cuts.map((x) => starts[n]! + x),
        at: scene(shot),
      });
    }
    if (n < 2) {
      // between the acts, the next title on a card
      const from = track.lengthSec;
      const to = cutSeconds(track);
      const card: Shot = { track, c, cast: c0, world: w, t0: from, t1: to, cuts: [], section: c.sections.at(-1)!, act: n, variant: "", r: rng(`${track.seed}/film/card`) };
      shots.push({ scene: "card", variant: "", into: "slide", n, offset: starts[n]!, start: starts[n]! + from, end: starts[n]! + to, blend: 0.55, cuts: [], at: SCENES.card(card) });
    }
  });
  // the shots tile the side with no holes
  for (let i = 1; i < shots.length; i++) shots[i]!.start = shots[i - 1]!.end;
  const length = sideSeconds(ep);
  shots.at(-1)!.end = length;

  const ends = shots.map((s) => s.end);
  const shotAt = (t: number) => Math.min(shots.length - 1, count(ends, t));
  const self: Film = {
    length,
    shots,
    starts,
    ep,
    cast: c0,
    cues: all,
    shotAt,
    at(t) {
      const i = shotAt(t);
      const s = shots[i]!;
      const frame: Frame = { view: s.at(t - s.offset), type: [] };
      const k = s.blend ? (t - s.start) / s.blend : 1;
      if (k < 1 && i > 0) {
        const p = shots[i - 1]!;
        frame.prev = p.at(t - p.offset);
        frame.mix = { kind: s.into, k: Math.max(0, k), seed: `${ep.seed}/${i}` };
      }
      frame.type = credits(self, sleeve, t);
      return frame;
    },
  };
  return self;
}

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

/** Draws a frame of the film: the shot, the transition from the last one, the type, then the stock. */
export function draw(ctx: CanvasRenderingContext2D, f: Frame, look: Look, n: number) {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const S = cw / W;
  if (!f.prev || !f.mix) paint(ctx, f.view, look, n);
  else {
    paint(ctx, f.prev, look, n);
    const g = scratch(2, cw, ch);
    paint(g, f.view, look, n);
    const k = ease(f.mix.k);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const edge = new Path2D();
    let shadow: [number, number] = [0, 0];
    let dx = 0;
    switch (f.mix.kind) {
      case "iris": {
        // opens from the middle of the frame
        edge.arc(cw / 2, ch / 2, k * Math.hypot(cw, ch) * 0.55, 0, Math.PI * 2);
        break;
      }
      case "wipe": {
        edge.rect(0, 0, k * cw, ch);
        shadow = [10 * S, 0];
        break;
      }
      case "slide": {
        // a new sheet slides in from the right and lands
        dx = (1 - k) * cw;
        edge.rect(dx, 0, cw, ch);
        shadow = [-14 * S, 0];
        break;
      }
      case "tear": {
        // a torn edge travels across the frame
        const r = rng(`tear/${f.mix.seed}`);
        const x = k * (cw + 160 * S) - 80 * S;
        edge.moveTo(0, 0);
        for (let y = 0; y <= ch; y += 24 * S) edge.lineTo(x + r.range(-34, 34) * S, y);
        edge.lineTo(x, ch);
        edge.lineTo(0, ch);
        edge.closePath();
        shadow = [8 * S, 2 * S];
        break;
      }
      default:
        edge.rect(0, 0, cw, ch);
    }
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 24 * S;
    ctx.shadowOffsetX = shadow[0];
    ctx.shadowOffsetY = shadow[1];
    ctx.fillStyle = "#000";
    ctx.fill(edge);
    ctx.shadowColor = "transparent";
    ctx.clip(edge);
    ctx.drawImage(g.canvas, dx, 0);
    ctx.restore();
    if (f.mix.kind === "tear") {
      // the white of the torn paper along the edge
      ctx.save();
      ctx.strokeStyle = look.inks.paper;
      ctx.lineWidth = 3 * S;
      ctx.globalAlpha = 0.85;
      ctx.stroke(edge);
      ctx.restore();
    }
  }
  if (f.type.length) paint(ctx, { layers: [{ id: "type", z: 1, fixed: true, pieces: f.type }], cam: { x: 0, y: 0, d: 0, zoom: 1, focus: 1 }, light: 1 }, look, n, false);
  finish(ctx, look, n);
}

