import type { Midi } from "../music/theory.ts";
import type { Rng } from "../music/rng.ts";
import { chordAt, pad, rootless, shell } from "./chords.ts";
import type { StyleSpec } from "./styles.ts";
import { type ChordSlot, type Ctx, type Keys, type NoteEvent, type Section, stopHits, stopped } from "./types.ts";

type Rhythm = [beat: number, dur: number][];

/** Comping rhythms per bar, by style. */
const RHYTHMS: Record<StyleSpec["comp"], Rhythm[]> = {
  stabs: [[[0, 1.5], [2.5, 0.5]], [[0, 3]], [[0.5, 1], [3.5, 0.5]], [[0, 0.75], [1.5, 1.5]]],
  charleston: [[[0, 1], [1.5, 0.5]], [[1.5, 1]], [[0, 0.5], [2.5, 1]], [[1, 0.5], [3.5, 0.5]], [[2, 1]]],
  ballad: [[[0, 4]], [[0, 2], [2, 2]], [[0, 3], [3.5, 0.5]]],
  waltz: [[[1, 0.5], [2, 0.5]], [[0, 3]], [[1, 1.5]]],
  bossa: [[[0, 0.5], [1.5, 0.5], [3, 0.5]], [[1, 0.5], [2.5, 0.5]]],
  shuffle: [[[0, 0.6], [1 + 2 / 3, 0.3], [2, 0.6]], [[1, 0.6], [3, 0.6]], [[0, 1], [2 + 2 / 3, 0.3], [3, 0.6]]],
};

/**
 * The piano (or electric keys) comps: stabs under boom-bap, charleston and anticipations in swing,
 * rolled chords in a ballad, oom-pah-pah in three, the bossa's two-bar figure. Under its own
 * solo the left hand keeps shells going. The strings, when they are on the date, hold pads under
 * the heads and swell into the end.
 */
export function writeComp(ctx: Ctx, r: Rng, spec: StyleSpec): NoteEvent[] {
  const events: NoteEvent[] = [];
  const keys: Keys = ctx.band.keys;
  const meter = ctx.meter;
  let prev: Midi[] | null = null;

  const chord = (c: ChordSlot, beat: number, dur: number, vel: number, roll = 0, lh = false) => {
    const v = rootless(c, prev);
    prev = v;
    v.forEach((m, i) => events.push({ part: keys, beat: beat + i * roll, dur, midi: m, vel: vel * (i === v.length - 1 ? 1.05 : 0.92) }));
    if (lh) shell(c).slice(0, 1).forEach((m) => events.push({ part: keys, beat, dur, midi: m, vel: vel * 0.85 }));
  };
  const shells = (c: ChordSlot, beat: number, dur: number, vel: number) => shell(c).forEach((m) => events.push({ part: keys, beat, dur, midi: m, vel }));

  const patterns = RHYTHMS[spec.comp];
  for (const sec of ctx.sections) {
    const from = sec.startBar * meter;
    const to = from + sec.bars * meter;
    const vel = 0.32 + 0.24 * sec.energy;
    const ownSolo = sec.kind === "solo" && sec.voice === keys;

    if (sec.kind === "ending") {
      endingComp(ctx, r, sec, (c, beat, dur, v, roll) => chord(c, beat, dur, v, roll, true), patterns);
      continue;
    }
    if (sec.treatment === "stop") {
      for (const h of stopHits(sec, meter)) chord(chordAt(ctx.chords, from + h), from + h, 0.4, vel + 0.15);
    }

    for (let k = 0; k < sec.bars; k++) {
      const bar = sec.startBar + k;
      const t = bar * meter;
      if (stopped(sec, bar)) continue;
      if (sec.treatment === "break") {
        // the breakdown is keys and bass: whole-bar chords, rolled
        chord(chordAt(ctx.chords, t), t, meter * 0.98, vel + 0.05, 0.04, true);
        continue;
      }
      const sparse = sec.treatment === "two" || sec.kind === "intro";
      let rhythm = spec.comp === "bossa" ? patterns[k % 2]! : r.pick(patterns);
      if (sparse && spec.comp === "charleston") rhythm = r.pick([[[0, 1.5]], [[1.5, 1]], [[0, 0.5], [2.5, 1]]] as Rhythm[]);
      if (sparse && spec.comp === "stabs") rhythm = [[0, meter]];
      for (const [b, d] of rhythm) {
        if (b >= meter) continue;
        // an anticipation on the and-of-4 plays the next bar's chord
        const at = b % 1 === 0.5 && b + d >= meter - 0.01 ? t + meter : t + b;
        const c = chordAt(ctx.chords, Math.min(at, to - 0.01));
        if (ownSolo) shells(c, t + b, d * 0.95, vel * 0.8);
        else if (spec.comp === "waltz" && b === 0 && d < 3) shells(c, t, d, vel);
        else chord(c, t + b, d * 0.95, vel * (b % 1 !== 0 ? 1.05 : 1), spec.comp === "ballad" ? 0.03 : 0, spec.comp === "ballad");
      }
      // the waltz's oom: a low root on 1 under the pah-pahs
      if (spec.comp === "waltz" && !ownSolo && rhythm[0]![0] > 0) shells(chordAt(ctx.chords, t), t, 0.9, vel * 0.9);
      // the chord can change mid-bar under a sustained rhythm
      for (const c of ctx.chords) if (c.beat > t && c.beat < t + meter && !rhythm.some(([b]) => Math.abs(t + b - c.beat) < 0.01) && rhythm.some(([b, d]) => t + b < c.beat && t + b + d > c.beat)) chord(c, c.beat, t + meter - c.beat, vel * 0.9);
    }
  }
  if (ctx.band.strings) events.push(...strings(ctx));
  return events;
}

function endingComp(ctx: Ctx, r: Rng, sec: Section, chord: (c: ChordSlot, beat: number, dur: number, vel: number, roll: number) => void, patterns: Rhythm[]) {
  const meter = ctx.meter;
  const from = sec.startBar * meter;
  const to = from + sec.bars * meter;
  const vel = 0.36 + 0.24 * sec.energy;
  const tonic = chordAt(ctx.chords, to - 0.01);
  switch (ctx.ending) {
    case "button":
      chord(tonic, from, 0.35, vel + 0.15, 0);
      return;
    case "fermata":
      chord(tonic, from, sec.bars * meter, vel, 0.05);
      return;
    case "tag":
    case "fade":
    case "runout": {
      const held = ctx.ending === "tag" ? to - 2 * meter : to;
      for (let t = from; t < held; t += meter) for (const [b, d] of r.pick(patterns)) if (b < meter) chord(chordAt(ctx.chords, t + b), t + b, d * 0.95, vel, 0);
      if (ctx.ending === "tag") chord(tonic, held, 2 * meter, vel + 0.05, 0.04);
    }
  }
}

/** Where the strings play: under the heads, the last solo's climb, breakdowns, and the ending. */
function stringsIn(ctx: Ctx, sec: Section): boolean {
  if (sec.kind === "intro") return ctx.style === "ballad";
  if (sec.kind === "head") return ctx.style !== "boombap" || sec.letter === "B";
  if (sec.kind === "solo") return sec.energy > 0.78 || ctx.style === "ballad";
  return sec.treatment !== "stop";
}

function strings(ctx: Ctx): NoteEvent[] {
  const out: NoteEvent[] = [];
  const meter = ctx.meter;
  let prev: Midi[] | null = null;
  let held: { top: NoteEvent[]; low: NoteEvent } | null = null;
  for (const sec of ctx.sections) {
    const from = sec.startBar * meter;
    const to = from + sec.bars * meter;
    if (!stringsIn(ctx, sec)) {
      held = null;
      continue;
    }
    const vel = 0.26 + 0.24 * sec.energy;
    for (const c of ctx.chords) {
      if (c.beat < from || c.beat >= to) continue;
      const p = pad(c, prev);
      // the same voicing again just keeps sounding
      if (held && prev && p.top.every((m, i) => m === prev![i]) && held.low.midi === p.low) {
        for (const e of held.top) e.dur += c.dur;
        held.low.dur += c.dur;
        continue;
      }
      prev = p.top;
      const top = p.top.map((m) => ({ part: "strings" as const, beat: c.beat, dur: c.dur, midi: m, vel }));
      const low = { part: "strings" as const, beat: c.beat, dur: c.dur, midi: p.low, vel: vel * 0.9 };
      out.push(...top, low);
      held = { top, low };
    }
    if (sec.kind === "ending" && (ctx.ending === "button")) held = null;
  }
  // a button cuts everyone off
  if (ctx.ending === "button") {
    const end = ctx.sections.at(-1)!.startBar * meter;
    return out.filter((e) => e.beat < end).map((e) => ({ ...e, dur: Math.min(e.dur, end + 0.35 - e.beat) }));
  }
  return out;
}
