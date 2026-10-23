import { swingBeat } from "../audio/play.ts";
import { rng } from "../music/rng.ts";
import type { Mood, PitchedPart } from "../music/types.ts";
import { longDay } from "../record/date.ts";
import type { Palette, Paper } from "../record/palette.ts";
import type { Pressing } from "../record/press.ts";
import { type CompName, COMPS, type Scene, type Stage } from "./comps.ts";
import { draw, finish, FPS, type Frame, ground, measure, type Shape, type Sheet } from "./paper.ts";

/** The picture runs a little past the last bar while the final chord rings out. */
export const TAIL = 2.5;

export interface Shot {
  start: number;
  end: number;
  kind: "open" | "title" | "montage" | "end";
  comp: CompName;
  /** In the bridge the colours swap round. */
  bridge: boolean;
  /** A line of credits set on a paper label, like the opening of a film. */
  credit?: string;
  light: -1 | 1;
}

const POOLS: Record<Mood, CompName[]> = {
  noir: ["blinds", "doorway", "smoke", "clock", "record", "letter", "eclipse", "horizon", "windows", "rain", "split"],
  chase: ["rails", "crossing", "quarters", "stairs", "letter", "clock", "windows", "split", "eclipse", "record"],
  sad: ["rain", "horizon", "windows", "record", "eclipse", "doorway", "smoke", "stairs", "letter", "clock"],
};

/** Shortest montage shot, in beats: noir cuts by the bar, chase too (its bars are short), sad holds. */
const MIN_BEATS: Record<Mood, number> = { noir: 4, chase: 4, sad: 8 };

const NAMES: Record<PitchedPart, string> = {
  piano: "piano",
  keys: "electric piano",
  sax: "tenor saxophone",
  vibes: "vibraphone",
  harmonica: "harmonica",
  bass: "bass",
};

export function length(p: Pressing): number {
  return p.score.lengthSec + TAIL;
}

/** The cut list: cold open, title card on the first hit of the tune, a montage on the hits, end card. */
export function shots(p: Pressing): Shot[] {
  const { score, mood } = p;
  const spb = 60 / score.bpm;
  const sec = (beat: number) => swingBeat(beat, score.swing) * spb;
  const r = rng(`b-side/${p.day}/shots`);
  const a = score.sections.find((s) => s.name === "a")!;
  const outro = score.sections.find((s) => s.name === "outro")!;
  const bridgeAt = score.sections.filter((s) => s.name === "b").map((s) => [s.startBar * 4, (s.startBar + s.bars) * 4] as const);
  const sectionStarts = new Set(score.sections.map((s) => s.startBar * 4));

  // comps cycle through a shuffled pool; a comp never follows itself
  const deck: CompName[] = [];
  // the title card is always "split", so the open is never dealt it
  let last: CompName | null = "split";
  const refill = () => {
    const pool = [...POOLS[mood]];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = r.int(0, i);
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    deck.unshift(...pool);
  };
  const deal = (): CompName => {
    if (!deck.length) refill();
    if (deck.at(-1) === last) {
      if (deck.length === 1) refill();
      const n = deck.length;
      [deck[n - 1], deck[n - 2]] = [deck[n - 2]!, deck[n - 1]!];
    }
    last = deck.pop()!;
    return last;
  };
  const light = () => (r.chance(0.5) ? -1 : 1) as -1 | 1;

  const titleBeat = a.startBar * 4;
  const titleEnd = titleBeat + 8;
  const endBeat = outro.startBar * 4;
  const out: Shot[] = [{ start: 0, end: sec(titleBeat), kind: "open", comp: deal(), bridge: false, light: light() }];
  out.push({ start: sec(titleBeat), end: 0, kind: "title", comp: "split", bridge: false, light: light() });
  last = "split";

  const cuts: number[] = [];
  let prev = titleEnd;
  for (const h of score.hits) {
    if (h < titleEnd || h >= endBeat) continue;
    const forced = sectionStarts.has(h) && h - prev >= 2;
    if (h - prev >= MIN_BEATS[mood] || forced || (cuts.length === 0 && h === titleEnd)) {
      cuts.push(h);
      prev = h;
    }
  }
  if (cuts[0] !== titleEnd) cuts.unshift(titleEnd);

  const credits = [NAMES[score.band.keys], score.band.lead ? NAMES[score.band.lead] : null, "bass", "drums"].filter((c): c is string => !!c);
  cuts.forEach((beat, i) => {
    let comp = deal();
    // the end card is a record too, so the last shot before it must be something else
    if (i === cuts.length - 1 && comp === "record") comp = deal();
    out.push({
      start: sec(beat),
      end: 0,
      kind: "montage",
      comp,
      bridge: bridgeAt.some(([s, e]) => beat >= s && beat < e),
      credit: credits[i],
      light: light(),
    });
  });
  out.push({ start: sec(endBeat), end: length(p), kind: "end", comp: "record", bridge: false, light: light() });
  for (let i = 0; i < out.length - 1; i++) out[i]!.end = out[i + 1]!.start;
  return out;
}

const swap = (pal: Palette): Palette => ({ ...pal, main: pal.second, second: pal.main });

/** Recolours pieces that would vanish under the title type. */
function clearOf(shapes: Shape[], type: Paper, pal: Palette): Shape[] {
  const alt = [pal.main, pal.second, pal.accent, pal.ground].find((c) => c !== type && c !== pal.ground) ?? pal.ground;
  return shapes.map((s) => (s.color === type ? { ...s, color: alt } : s));
}

/** Breaks a title into lines that suit the frame: fewer, longer lines when it is wide. */
function lines(title: string, wide: boolean): string[] {
  const words = title.toUpperCase().split(" ");
  const n = words.length <= 2 ? (wide ? 1 : words.length) : wide ? 2 : Math.min(3, words.length);
  if (n === 1) return [words.join(" ")];
  // split where the longest line is shortest
  let best: string[] = [title];
  let bestLen = Infinity;
  const go = (from: number, left: number, acc: string[]) => {
    if (left === 1) {
      const all = [...acc, words.slice(from).join(" ")];
      const len = Math.max(...all.map((l) => l.length));
      if (len < bestLen) {
        bestLen = len;
        best = all;
      }
      return;
    }
    for (let i = from + 1; i <= words.length - left + 1; i++) go(i, left - 1, [...acc, words.slice(from, i).join(" ")]);
  };
  go(0, n, []);
  return best;
}

function titleShapes(sheet: Sheet, p: Pressing, t: number): Shape[] {
  const { w, h, u, ctx } = sheet;
  const ls = lines(p.title, w / h > 1.2);
  const widest = Math.max(...ls.map((l) => measure(ctx, l, 100)));
  const size = Math.min(((w * 0.86) / widest) * 100, (h * 0.62) / (ls.length * 0.92), u * 0.42);
  const lead = size * 0.92;
  const top = h / 2 - (ls.length * lead) / 2 + size * 0.74;
  const x = w * 0.07;
  // letters are laid on twos, a few per frame for long titles so the whole title is down in about a second
  const step = Math.max(1, Math.ceil(ls.join("").length / 12));
  let budget = Math.floor(t * FPS) * step;
  const out: Shape[] = ls.map((l, i): Shape => {
    const shown = l.slice(0, Math.max(0, budget));
    budget -= l.length;
    return { id: `title${i}`, kind: "text", color: p.palette.type, text: shown, x, y: top + i * lead, size };
  });
  if (budget > 3 * step) {
    out.push({ id: "byline", kind: "text", color: p.palette.type, flat: true, text: `b-side no. ${p.no}, ${longDay(p.day)}`, x, y: top + (ls.length - 1) * lead + size * 0.5, size: Math.max(14, u * 0.04), weight: 600 });
  }
  return out;
}

function endShapes(sheet: Sheet, p: Pressing, t: number): Shape[] {
  const { w, h, u } = sheet;
  const wide = w / h > 1.2;
  const R = u * (wide ? 0.52 : 0.4);
  const cx = wide ? w * 0.78 : w * 0.5;
  const cy = wide ? h * 0.5 : h * 0.86;
  const a = t * (33.3 / 60) * Math.PI * 2;
  const pal = p.palette;
  const vinyl: Paper = pal.ground === "ink" || pal.ground === "night" ? pal.second : "ink";
  const big = u * (wide ? 0.3 : 0.26);
  const tx = w * 0.07;
  const ty = wide ? h * 0.5 : h * 0.34;
  const show = (k: number) => t > k;
  return [
    { id: "vinyl", kind: "circle", color: vinyl, x: cx, y: cy, r: R },
    { id: "groove", kind: "ring", color: pal.ground, alpha: 0.3, flat: true, x: cx, y: cy, r: R * 0.8, inner: R * 0.79 },
    { id: "label", kind: "circle", color: pal.main, x: cx, y: cy, r: R * 0.34 },
    { id: "mark", kind: "sector", color: pal.accent, flat: true, x: cx, y: cy, r0: R * 0.1, r1: R * 0.3, a0: a, a1: a + 0.9 },
    { id: "hole", kind: "circle", color: pal.ground, flat: true, x: cx, y: cy, r: R * 0.035 },
    ...(show(0.2) ? [{ id: "no", kind: "text", color: pal.type, text: `no. ${p.no}`, x: tx, y: ty, size: big } as Shape] : []),
    ...(show(0.7) ? [{ id: "title", kind: "text", color: pal.type, text: p.title.toLowerCase(), x: tx, y: ty + u * 0.1, size: u * 0.05, weight: 600 } as Shape] : []),
    ...(show(1.1) ? [{ id: "pressed", kind: "text", color: pal.accent === pal.type ? pal.main : pal.accent, text: `pressed ${longDay(p.day)}`, x: tx, y: ty + u * 0.17, size: u * 0.04, weight: 500 } as Shape] : []),
  ];
}

function creditShapes(sheet: Sheet, pal: Palette, text: string, t: number): Shape[] {
  if (t < 0.4) return [];
  const { u, h, ctx } = sheet;
  const size = Math.max(13, u * 0.038);
  const tw = measure(ctx, text, size, 600);
  const pad = size * 0.5;
  const label: Paper = pal.accent;
  const ink: Paper = ["bone", "yellow", "orange"].includes(label) ? "ink" : "bone";
  return [
    { id: `credit/${text}`, kind: "rect", color: label, x: u * 0.06, y: h - u * 0.06 - size - pad * 2, w: tw + pad * 2, h: size + pad * 2 },
    { id: `credit/${text}/t`, kind: "text", color: ink, text, x: u * 0.06 + pad, y: h - u * 0.06 - pad - size * 0.22, size, weight: 600, flat: true },
  ];
}

/** Draws one record's episode. Keeps the built scenes so each shot is laid out once per size. */
export class Episode {
  readonly cuts: Shot[];
  readonly length: number;
  private scenes = new Map<string, Scene>();
  constructor(readonly p: Pressing) {
    this.cuts = shots(p);
    this.length = length(p);
  }

  shotAt(t: number): Shot {
    return this.cuts.find((s) => t >= s.start && t < s.end) ?? this.cuts[this.cuts.length - 1]!;
  }

  /** `t` is seconds since the music started. */
  draw(sheet: Sheet, t: number) {
    const shot = this.shotAt(t);
    const local = Math.floor((t - shot.start) * FPS) / FPS;
    const spb = 60 / this.p.score.bpm;
    const frame: Frame = { twos: Math.floor(t * FPS), light: shot.light };
    const pal = shot.bridge ? swap(this.p.palette) : this.p.palette;
    const key = `${this.cuts.indexOf(shot)}/${sheet.w}x${sheet.h}`;
    let scene = this.scenes.get(key);
    if (!scene && shot.kind !== "end") {
      const stage: Stage = { w: sheet.w, h: sheet.h, u: sheet.u, pal, r: rng(`b-side/${this.p.day}/shot${this.cuts.indexOf(shot)}`), title: this.p.title, spb };
      scene = COMPS[shot.comp](stage);
      this.scenes.set(key, scene);
    }
    ground(sheet, pal.ground);
    if (shot.kind === "end") draw(sheet, endShapes(sheet, this.p, local), frame);
    else if (shot.kind === "title") {
      draw(sheet, clearOf(scene!(local, local / spb), pal.type, pal), frame);
      draw(sheet, titleShapes(sheet, this.p, local), frame);
    } else {
      draw(sheet, scene!(local, local / spb), frame);
      if (shot.credit) draw(sheet, creditShapes(sheet, pal, shot.credit, local), frame);
    }
    finish(sheet, frame);
    // fade out over the last second
    const left = this.length - t;
    if (left < 1) {
      sheet.ctx.fillStyle = `rgba(0,0,0,${Math.min(1, 1 - left)})`;
      sheet.ctx.fillRect(0, 0, sheet.w, sheet.h);
    }
  }
}
