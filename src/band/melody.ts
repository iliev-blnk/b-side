import type { Midi } from "../music/theory.ts";
import type { Rng } from "../music/rng.ts";
import { chordAt, chordPcs, guidePcs, restingPcs, scalePcs } from "./chords.ts";
import { type Ctx, type Lead, type Keys, type NoteEvent, type Section, RANGES, TESSITURA } from "./types.ts";

// Rhythm is written in eighth-note slots: [start, length] within one bar.
type Slot = [start: number, len: number];

const CELLS: Record<3 | 4, Slot[][]> = {
  4: [
    [[0, 3], [3, 1], [4, 4]],
    [[1, 1], [2, 2], [4, 1], [5, 3]],
    [[0, 1], [1, 1], [2, 1], [3, 5]],
    [[0, 2], [2, 2], [4, 2], [6, 2]],
    [[0, 1], [1, 2], [3, 1], [4, 4]],
    [[0, 3], [3, 3], [6, 2]],
    [[1, 2], [3, 1], [4, 3], [7, 1]],
    [[0, 2], [2, 1], [3, 1], [4, 1], [5, 3]],
  ],
  3: [
    [[0, 4], [4, 2]],
    [[0, 2], [2, 2], [4, 2]],
    [[0, 3], [3, 1], [4, 2]],
    [[1, 1], [2, 4]],
    [[0, 1], [1, 1], [2, 4]],
  ],
};

/** Calmer cells for the second bar of a two-bar idea. */
const ANSWERS: Record<3 | 4, Slot[][]> = {
  4: [
    [[0, 6], [6, 1], [7, 1]],
    [[0, 4], [5, 3]],
    [[0, 2], [2, 6]],
    [[1, 7]],
  ],
  3: [
    [[0, 6]],
    [[0, 4], [5, 1]],
    [[0, 2], [2, 4]],
  ],
};

const CADENCES: Record<3 | 4, Slot[][]> = {
  4: [[[0, 8]], [[0, 2], [2, 6]], [[0, 1], [1, 7]]],
  3: [[[0, 6]], [[0, 2], [2, 4]]],
};

interface Motif {
  /** One cell per bar of the idea. */
  rhythm: Slot[][];
  /** Scale steps from each note to the next; the first entry is ignored. */
  steps: number[];
}

/** A note before it has a pitch: where it falls in the section and how it moves. */
interface Tone {
  beat: number;
  dur: number;
  /** Scale steps from the previous note, or, on the first note of a phrase, semitones from the anchor. */
  step: number;
  phrase: boolean;
}

const count = (rhythm: Slot[][]) => rhythm.reduce((n, c) => n + c.length, 0);

function contour(r: Rng, n: number, shape: "arch" | "fall" | "rise" | "valley"): number[] {
  const steps = [0];
  for (let i = 1; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    let dir = shape === "arch" ? (t <= 0.5 ? 1 : -1) : shape === "valley" ? (t <= 0.5 ? -1 : 1) : shape === "rise" ? 1 : -1;
    if (r.chance(0.18)) dir = -dir;
    steps.push(r.chance(0.1) ? 0 : dir * r.pick([1, 1, 1, 2, 2, 3]));
  }
  return steps;
}

function makeMotif(r: Rng, meter: 3 | 4, unit: number, shape?: "arch" | "fall" | "rise" | "valley"): Motif {
  const rhythm = unit === 1 ? [r.pick(CELLS[meter])] : [r.pick(CELLS[meter]), r.pick(ANSWERS[meter])];
  return { rhythm, steps: contour(r, count(rhythm), shape ?? r.pick(["arch", "fall", "rise", "valley"] as const)) };
}

/** The same rhythm with its last turn changed: the third phrase of a tune. */
function vary(r: Rng, m: Motif): Motif {
  const steps = [...m.steps];
  const last = steps.length - 1;
  if (last >= 1) steps[last] = -steps[last]! || 1;
  if (last >= 2 && r.chance(0.5)) steps[last - 1] = steps[last - 1]! + r.pick([-1, 1]);
  return { rhythm: m.rhythm, steps };
}

const invert = (m: Motif): Motif => ({ rhythm: m.rhythm, steps: m.steps.map((s) => -s) });

function place(m: Motif, bar: number, meter: number, shift: number): Tone[] {
  const out: Tone[] = [];
  let i = 0;
  m.rhythm.forEach((cell, b) => {
    for (const [start, len] of cell) {
      out.push({ beat: (bar + b) * meter + start / 2, dur: len / 2, step: i === 0 ? shift : m.steps[i]!, phrase: i === 0 });
      i++;
    }
  });
  return out;
}

/**
 * The tune: one melody for each letter, written as motifs. An A states its idea, sequences it,
 * varies it and cadences; the bridge does the same with a new idea a fourth higher.
 */
export interface Tune {
  A: Tone[];
  B: Tone[];
  /** The A idea, which the soloists quote and develop. */
  motif: Motif;
  aBars: number;
}

export function writeTune(r: Rng, meter: 3 | 4, aBars: 4 | 8): Tune {
  const unit = aBars / 4;
  const mA = makeMotif(r, meter, unit);
  const answer = r.chance(0.4);
  const seq = r.pick([2, 3, 5, -2, -3]);
  const cadence = (bar: number, from: Motif, low: number): Tone[] => {
    const lead = unit === 2 ? place({ rhythm: [from.rhythm[0]!], steps: from.steps }, bar, meter, low) : [];
    const cell = r.pick(CADENCES[meter]);
    const at = bar + unit - 1;
    const tail = cell.map(([s, l], i) => ({ beat: at * meter + s / 2, dur: l / 2, step: i === 0 && lead.length === 0 ? low : -1, phrase: i === 0 && lead.length === 0 }));
    return [...lead, ...tail];
  };
  const A = [
    ...place(mA, 0, meter, 0),
    ...place(answer ? invert(mA) : mA, unit, meter, answer ? 0 : seq),
    // the third phrase climbs past both before the cadence brings it home
    ...place(vary(r, mA), 2 * unit, meter, Math.max(answer ? 0 : seq, 0) + r.pick([2, 3])),
    ...cadence(3 * unit, mA, -2),
  ];
  const mB = makeMotif(r, meter, unit, r.pick(["rise", "arch"] as const));
  const lift = r.pick([4, 5]);
  const B = [
    ...place(mB, 0, meter, lift),
    ...place(mB, unit, meter, lift + r.pick([2, -2])),
    ...place(vary(r, mB), 2 * unit, meter, lift + r.pick([0, 3])),
    ...cadence(3 * unit, mB, lift - 3),
  ];
  return { A, B, motif: mA, aBars };
}

// --- pitch -------------------------------------------------------------------------------------

const pc = (m: Midi) => ((m % 12) + 12) % 12;

/** The pitch with one of `pcs` nearest `target` inside the range; ties go `toward` (+1 up, -1 down). */
function nearest(pcs: number[], target: Midi, [lo, hi]: [Midi, Midi], toward = 0, not?: Midi): Midi {
  let best = target;
  let cost = Infinity;
  for (let m = lo; m <= hi; m++) {
    if (!pcs.includes(pc(m)) || m === not) continue;
    const c = Math.abs(m - target) + (toward !== 0 && Math.sign(m - target) === -toward ? 0.5 : 0);
    if (c < cost) [best, cost] = [m, c];
  }
  return best;
}

/** Walks `steps` notes along the scale. */
function stepScale(from: Midi, steps: number, pcs: number[]): Midi {
  let m = pcs.includes(pc(from)) ? from : from + (steps >= 0 ? -1 : 1);
  while (!pcs.includes(pc(m))) m += steps >= 0 ? -1 : 1;
  const dir = Math.sign(steps);
  for (let k = 0; k < Math.abs(steps); k++) {
    m += dir;
    while (!pcs.includes(pc(m))) m += dir;
  }
  return m;
}

/** A note lands on a chord tone if it falls on 1 or 3, or rings, or anticipates the next bar. */
function strong(beat: number, dur: number, meter: number): { strong: boolean; at: number } {
  const pos = beat - Math.floor(beat / meter) * meter;
  if (pos % 1 !== 0 && dur >= 1) return { strong: true, at: beat + 0.5 };
  return { strong: pos === 0 || (meter === 4 && pos === 2) || dur >= 1.5, at: beat };
}

export interface Voice {
  part: Lead | Keys;
  range: [Midi, Midi];
}

/** Sounds a line of tones over the changes, starting from `anchor`. */
function realize(ctx: Ctx, tones: Tone[], offset: number, anchor: Midi, range: [Midi, Midi]): Midi[] {
  const out: Midi[] = [];
  let prev = anchor;
  for (const t of tones) {
    const s = strong(t.beat + offset, t.dur, ctx.meter);
    const c = chordAt(ctx.chords, s.at);
    let m: Midi;
    if (t.phrase) m = nearest(restingPcs(c), anchor + t.step, range);
    else {
      m = stepScale(prev, t.step, scalePcs(c, ctx.aeolian));
      if (m < range[0] || m > range[1]) m = stepScale(prev, -t.step, scalePcs(c, ctx.aeolian));
      if (s.strong) m = nearest(restingPcs(c), m, range, Math.sign(t.step), t.step !== 0 ? prev : undefined);
    }
    while (m > range[1]) m -= 12;
    while (m < range[0]) m += 12;
    out.push(m);
    prev = m;
  }
  return out;
}

const velocity = (energy: number, beat: number, dur: number, first: boolean) => {
  const off = beat % 1 !== 0 && dur < 1;
  return Math.min(1, 0.5 + 0.32 * energy + (first ? 0.06 : 0) - (off ? 0.08 : 0));
};

const anchorOf = ([lo, hi]: [Midi, Midi]) => Math.round(lo + (hi - lo) * 0.42);

/** Plays a letter of the tune in a section. */
function head(ctx: Ctx, tune: Tune, sec: Section, part: Lead | Keys): NoteEvent[] {
  const tones = sec.letter === "A" ? tune.A : tune.B;
  const start = sec.startBar * ctx.meter;
  const range = TESSITURA[part];
  const pitches = realize(ctx, tones, start, anchorOf(range), range);
  return tones.map((t, i) => ({ part, beat: start + t.beat, dur: t.dur * 0.94, midi: pitches[i]!, vel: velocity(sec.energy, t.beat, t.dur, t.phrase) }));
}

// --- solos -------------------------------------------------------------------------------------

type Idea = "quote" | "run" | "riff" | "long";

/**
 * A solo is a run of phrases with breaths between them. It quotes and develops the tune's motif,
 * runs the scale into guide tones, worries a riff, or leans on a long note; the more energy, the
 * more runs and riffs, and the higher it climbs.
 */
function solo(ctx: Ctx, r: Rng, tune: Tune, sec: Section, part: Lead | Keys, from: Midi): { events: NoteEvent[]; last: Midi } {
  const events: NoteEvent[] = [];
  const meter = ctx.meter;
  const start = sec.startBar * meter;
  const end = start + sec.bars * meter;
  const [tlo, thi] = TESSITURA[part];
  const [rlo, rhi] = RANGES[part];
  const range: [Midi, Midi] = [Math.max(rlo, tlo - 2), Math.min(rhi, thi + 3)];
  const grid = ctx.bpm < 90 ? 0.25 : 0.5;
  let cur = from;
  let t = start + r.pick([0, 0.5, 1]);

  const add = (beat: number, dur: number, midi: Midi, accent = 0) => {
    if (beat >= end - 0.01) return;
    const d = Math.min(dur, end - beat);
    events.push({ part, beat, dur: d * 0.94, midi, vel: Math.min(1, velocity(sec.energy, beat, d, false) + accent) });
    cur = midi;
  };

  while (t < end - meter / 2) {
    const progress = (t - start) / (end - start);
    const e = sec.energy + 0.1 * progress;
    const ceiling = Math.round(range[0] + (range[1] - range[0]) * Math.min(1, 0.55 + 0.45 * e));
    const lane: [Midi, Midi] = [range[0], Math.max(range[0] + 10, ceiling)];
    const idea: Idea = r.pick<Idea>(
      e > 0.7 ? ["run", "run", "riff", "quote", "run", "long"] : e > 0.5 ? ["run", "quote", "quote", "riff", "long"] : ["quote", "long", "run", "quote"],
    );

    if (idea === "quote") {
      const bar = Math.ceil((t - 0.01) / meter);
      const m = r.chance(0.3) ? invert(tune.motif) : r.chance(0.4) ? vary(r, tune.motif) : tune.motif;
      const tones = place(m, 0, meter, 0);
      const pitches = realize(ctx, tones, bar * meter, cur + r.pick([-3, 0, 2, 4, 5]), lane);
      tones.forEach((x, i) => add(bar * meter + x.beat, x.dur, pitches[i]!, i === 0 ? 0.04 : 0));
      t = bar * meter + tones.reduce((z, x) => Math.max(z, x.beat + x.dur), 0);
    } else if (idea === "run") {
      const n = r.int(4, grid === 0.25 ? 12 : 8);
      const target = Math.ceil((t + n * grid) / 2) * 2;
      const c = chordAt(ctx.chords, Math.min(target, end - 0.01));
      const up = cur < (lane[0] + lane[1]) / 2 ? r.chance(0.75) : r.chance(0.25);
      let beat = target - n * grid;
      if (beat < t) beat += grid * Math.ceil((t - beat) / grid);
      let m = cur;
      while (beat < target - grid - 1e-9) {
        const sc = scalePcs(chordAt(ctx.chords, beat), ctx.aeolian);
        m = stepScale(m, (up ? 1 : -1) * (r.chance(0.15) ? 2 : 1), sc);
        if (m > lane[1] || m < lane[0]) m = stepScale(m, (up ? -1 : 1) * 2, sc);
        add(beat, grid, m);
        beat += grid;
      }
      const goal = nearest(guidePcs(c), m + (up ? 2 : -2), lane);
      add(target - grid, grid, r.chance(0.5) ? goal + (up ? -1 : 1) : m);
      const hold = r.pick([1, 1.5, 2]);
      add(target, hold, goal, 0.05);
      t = target + hold;
    } else if (idea === "riff") {
      const c = chordAt(ctx.chords, t);
      const pcs = chordPcs(c);
      const top = nearest(pcs, cur + 2, lane);
      const cell = [top, nearest(pcs, top - 3, lane, -1, top), top];
      const len = r.pick([1.5, 1, 0.75]);
      const reps = r.int(2, 3);
      let beat = Math.ceil(t * 2) / 2;
      for (let k = 0; k < reps; k++) {
        cell.forEach((m, i) => add(beat + (i * len) / cell.length, len / cell.length, m, i === 0 ? 0.05 : 0));
        beat += len;
      }
      t = beat;
    } else {
      const beat = Math.ceil(t);
      const c = chordAt(ctx.chords, beat);
      const dur = r.pick([1.5, 2, 3]);
      add(beat, dur, nearest(r.chance(0.6) ? guidePcs(c) : restingPcs(c), cur + r.pick([-2, 2, 4]), lane), 0.03);
      t = beat + dur;
    }
    // breathe
    t += r.pick([0.5, 1, 1, 1.5, 2]) * (1.3 - Math.min(1, e) * 0.7);
  }
  return { events, last: cur };
}

// --- endings, harmony, answers -----------------------------------------------------------------

function ending(ctx: Ctx, r: Rng, tune: Tune, sec: Section, part: Lead, last: Midi): NoteEvent[] {
  const meter = ctx.meter;
  const start = sec.startBar * meter;
  const range = TESSITURA[part];
  const tonic = chordAt(ctx.chords, start + sec.bars * meter - 0.01);
  const home = nearest(restingPcs(tonic).slice(0, 3), last, range);
  const vel = velocity(sec.energy, 0, 2, true);
  switch (ctx.ending) {
    case "tag": {
      // the last two bars of the tune, three times, then home
      const from = tune.aBars - 2;
      const tail = tune.A.filter((x) => x.beat >= from * meter).map((x, i) => ({ ...x, beat: x.beat - from * meter, phrase: i === 0, step: i === 0 ? 0 : x.step }));
      const out: NoteEvent[] = [];
      for (let k = 0; k < 3; k++) {
        const at = start + k * 2 * meter;
        const pitches = realize(ctx, tail, at, last + (k === 1 ? 2 : 0), range);
        tail.forEach((x, i) => out.push({ part, beat: at + x.beat, dur: x.dur * 0.94, midi: pitches[i]!, vel: velocity(sec.energy, x.beat, x.dur, i === 0) }));
      }
      out.push({ part, beat: start + 6 * meter, dur: 2 * meter, midi: home, vel });
      return out;
    }
    case "fermata":
      return [{ part, beat: start, dur: sec.bars * meter, midi: home, vel: vel - 0.08 }];
    case "button":
      return [{ part, beat: start, dur: 0.35, midi: home, vel: Math.min(1, vel + 0.1) }];
    case "fade":
      return solo(ctx, r, tune, { ...sec, energy: sec.energy * 0.8 }, part, last).events;
    case "runout":
      return [];
  }
}

/** A second horn a third or sixth away, below the lead unless it lives above it. */
function harmonize(ctx: Ctx, line: NoteEvent[], second: Lead, lead: Lead): NoteEvent[] {
  const [lo, hi] = TESSITURA[second];
  const above = (lo + hi) / 2 > (TESSITURA[lead][0] + TESSITURA[lead][1]) / 2 + 6;
  const out: NoteEvent[] = [];
  for (const e of line) {
    const c = chordAt(ctx.chords, e.beat);
    const pcs = e.dur >= 0.9 ? chordPcs(c) : scalePcs(c, ctx.aeolian);
    const options = [3, 4, 8, 9, 5].map((iv) => e.midi! + (above ? iv : -iv)).filter((m) => pcs.includes(pc(m)));
    for (const base of options) {
      let m = base;
      while (m > hi + 2) m -= 12;
      while (m < lo - 2) m += 12;
      if (m >= RANGES[second][0] && m <= RANGES[second][1]) {
        out.push({ ...e, part: second, midi: m, vel: e.vel * 0.85 });
        break;
      }
    }
  }
  return out;
}

/** Bells an octave or two above the tune. */
function colour(line: NoteEvent[], part: "glock" | "marimba"): NoteEvent[] {
  const [lo, hi] = RANGES[part];
  return line.flatMap((e) => {
    let m = e.midi!;
    while (m < lo) m += 12;
    if (m > hi) return [];
    return [{ ...e, part, midi: m, dur: Math.min(e.dur, 1), vel: e.vel * 0.55 }];
  });
}

/** The piano answers the horn in the gaps of the head, up high and quietly. */
function answers(ctx: Ctx, r: Rng, line: NoteEvent[], part: Keys): NoteEvent[] {
  const out: NoteEvent[] = [];
  const range: [Midi, Midi] = [72, 88];
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]!;
    const gapStart = Math.ceil((a.beat + a.dur / 0.94) * 2) / 2 + 0.5;
    const gap = line[i + 1]!.beat - gapStart;
    if (gap < 1.5 || !r.chance(0.55)) continue;
    const n = gap >= 2.5 ? 4 : 3;
    let m = nearest(restingPcs(chordAt(ctx.chords, gapStart)), a.midi! + 12, range);
    for (let k = 0; k < n; k++) {
      const beat = gapStart + k * 0.5;
      const c = chordAt(ctx.chords, beat);
      if (k > 0) m = stepScale(m, -1, scalePcs(c, ctx.aeolian));
      if (k === n - 1) m = nearest(restingPcs(c), m, range, -1);
      out.push({ part, beat, dur: k === n - 1 ? 1 : 0.45, midi: m, vel: 0.36 + (k === 0 ? 0.04 : 0) });
    }
  }
  return out;
}

// --- the arrangement ---------------------------------------------------------------------------

export interface MelodyOut {
  events: NoteEvent[];
  /** Beats where a melodic phrase begins: the picture can cut on these. */
  phrases: number[];
}

export function writeMelody(ctx: Ctx, r: Rng, tune: Tune): MelodyOut {
  const events: NoteEvent[] = [];
  const phrases: number[] = [];
  const { band } = ctx;
  const lead = band.lead;
  const lastOut = ctx.sections.filter((s) => s.kind === "out").at(-1);
  let last: Midi = anchorOf(TESSITURA[lead]);
  const sr = r.fork("solo");

  for (const sec of ctx.sections) {
    const start = sec.startBar * ctx.meter;
    if (sec.kind === "intro") {
      // a hint of the tune from the piano in the last bars of the intro
      if (r.chance(0.6)) {
        const tones = place(tune.motif, 0, ctx.meter, 0);
        const at = start + (sec.bars - tune.motif.rhythm.length) * ctx.meter;
        const pitches = realize(ctx, tones, at, anchorOf(TESSITURA.piano) + 5, TESSITURA.piano);
        tones.forEach((x, i) => events.push({ part: band.keys, beat: at + x.beat, dur: x.dur * 0.9, midi: pitches[i]!, vel: 0.38 }));
      }
      continue;
    }
    if (sec.kind === "head" || sec.kind === "out") {
      const line = head(ctx, tune, sec, lead);
      events.push(...line);
      phrases.push(...(sec.letter === "A" ? tune.A : tune.B).filter((x) => x.phrase).map((x) => start + x.beat));
      if (sec.treatment !== "break") events.push(...answers(ctx, r.fork(`answer${sec.startBar}`), line, band.keys));
      if (sec.kind === "out" && band.second) events.push(...harmonize(ctx, line, band.second, lead));
      if (sec === lastOut && band.color) events.push(...colour(line, band.color));
      last = line.at(-1)?.midi ?? last;
      continue;
    }
    if (sec.kind === "solo") {
      const part = sec.voice;
      const from = part === lead ? last : anchorOf(TESSITURA[part]);
      const s = solo(ctx, sr, tune, sec, part, from);
      events.push(...s.events);
      phrases.push(start);
      if (part === lead) last = s.last;
      continue;
    }
    events.push(...ending(ctx, r.fork("ending"), tune, sec, lead, last));
  }
  return { events, phrases };
}
