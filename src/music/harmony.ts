import type { Progression } from "./moods.ts";
import { MOODS } from "./moods.ts";
import type { Rng } from "./rng.ts";
import { type Midi, type Quality, voiceLead } from "./theory.ts";
import { type ChordSlot, type Ctx, type NoteEvent, RANGES, type Section } from "./types.ts";

/** Rootless jazz voicings (the bass has the root): what the left hand of a jazz pianist plays. */
const ROOTLESS: Record<Quality, number[]> = {
  m7: [3, 7, 10, 14],
  m9: [3, 7, 10, 14],
  m11: [3, 10, 14, 17],
  maj7: [4, 7, 11, 14],
  maj9: [4, 7, 11, 14],
  "7": [4, 10, 14, 21],
  "7b9": [4, 10, 13, 19],
  m7b5: [3, 6, 10, 12],
};

const VOICE_RANGE: [Midi, Midi] = [50, 76];

/** One chord per bar; the last bar is the tonic. */
export function buildChords(prog: Progression, key: number, bars: number): ChordSlot[] {
  const slots: ChordSlot[] = [];
  let prev: Midi[] | null = null;
  for (let bar = 0; bar < bars; bar++) {
    const [step, quality]: [number, Quality] = bar === bars - 1 ? [0, prog[0]![1] === "m11" ? "m11" : "m9"] : prog[bar % prog.length]!;
    const root = 36 + ((key + step) % 12);
    const voicing = voiceLead(prev, ROOTLESS[quality].map((i) => root + i), VOICE_RANGE);
    slots.push({ bar, root, quality, voicing });
    prev = voicing;
  }
  return slots;
}

export function chordTones(slot: ChordSlot): number[] {
  return [slot.root % 12, ...slot.voicing.map((n) => n % 12)];
}

function inSection(sections: Section[], bar: number, name: Section["name"]) {
  return sections.some((s) => s.name === name && bar >= s.startBar && bar < s.startBar + s.bars);
}

/** The keys/piano part. */
export function comp(r: Rng, ctx: Ctx): NoteEvent[] {
  const spec = MOODS[ctx.mood];
  const part = ctx.keysPart;
  const [lo, hi] = RANGES[part];
  const events: NoteEvent[] = [];
  const add = (beat: number, dur: number, notes: Midi[], vel: number) => {
    for (const n of notes) if (n >= lo && n <= hi) events.push({ part, beat, dur, midi: n, vel });
  };
  const stabs = r.pick<[number, number][]>([
    [[0, 0.75], [1.5, 0.5], [2.75, 1]],
    [[0, 0.5], [0.75, 0.5], [2.5, 1.25]],
    [[0, 1.25], [2.25, 0.5], [3.5, 0.5]],
  ]);
  const last = ctx.bars - 1;
  // anticipations: the next chord arrives on the "and" of 4
  const pushed = new Set<number>();

  for (const slot of ctx.chords) {
    const { bar, voicing } = slot;
    const t = bar * 4;
    const soft = inSection(ctx.sections, bar, "intro") ? 0.8 : 1;
    if (bar === last) {
      if (!pushed.has(bar)) add(t, 4, voicing, 0.55);
      if (spec.comp === "broken") add(t + 1.5, 2.5, [voicing[voicing.length - 1]! + 12].filter((n) => n <= hi), 0.3);
      continue;
    }
    const next = ctx.chords[bar + 1]!;
    const push = bar + 1 < last && next.root !== slot.root && r.chance(spec.comp === "held" ? 0.35 : 0.2);

    if (spec.comp === "held") {
      if (!pushed.has(bar)) add(t, push ? 3.5 : 3.75, voicing, 0.55 * soft);
      if (!push && r.chance(0.3)) add(t + 2.5, 1, voicing.slice(1), 0.38 * soft);
    } else if (spec.comp === "stabs") {
      for (const [b, d] of stabs) {
        if (b === 0 && pushed.has(bar)) continue;
        if (push && b + d > 3.5) continue;
        add(t + b, d, voicing, (b === 0 ? 0.6 : 0.45) * soft);
      }
    } else {
      // broken: a rolled chord, then the voicing climbs on the off-beats
      if (!pushed.has(bar)) voicing.forEach((n, i) => add(t + i * 0.06, 3.5 - i * 0.06, [n], 0.42 * soft));
      const climb = r.pick([[2, 2.5, 3], [2.5, 3, 3.5], [1.5, 2.5, 3]]);
      climb.forEach((b, i) => add(t + b, 3.5 - b + 0.5, [voicing[(i + 1) % voicing.length]! + (i === 2 ? 12 : 0)].filter((n) => n <= hi), 0.3 * soft));
    }

    if (push) {
      add(t + 3.5, 4.25, next.voicing, 0.5 * soft);
      pushed.add(bar + 1);
    }
  }
  return events;
}
