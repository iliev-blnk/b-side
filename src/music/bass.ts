import { chordTones } from "./harmony.ts";
import { MOODS } from "./moods.ts";
import type { Rng } from "./rng.ts";
import { type ChordSlot, type Ctx, type NoteEvent, RANGES, sectionAt } from "./types.ts";

const [LO, HI] = RANGES.bass;

/** Root in A1..G#2, the warm middle of an upright. */
function low(pc: number): number {
  return 33 + ((pc - 9 + 12) % 12);
}

function fit(n: number): number {
  while (n > HI) n -= 12;
  while (n < LO) n += 12;
  return n;
}

/** A chromatic or scale step into the next root. */
function approach(r: Rng, next: ChordSlot): number {
  const root = low(next.root % 12);
  return fit(root + r.pick([-1, 1, -2, 2, -5]));
}

export function bass(r: Rng, ctx: Ctx): NoteEvent[] {
  const style = MOODS[ctx.mood].bass;
  const events: NoteEvent[] = [];
  const note = (beat: number, dur: number, midi: number, vel: number) => events.push({ part: "bass", beat, dur, midi: fit(midi), vel });
  const last = ctx.bars - 1;

  for (const slot of ctx.chords) {
    const { bar } = slot;
    const sec = sectionAt(ctx.sections, bar);
    const t = bar * 4;
    const root = low(slot.root % 12);
    if (bar === last) {
      note(t, 4, root, 0.8);
      continue;
    }
    if (sec.name === "intro") {
      // a pickup into section a
      if (bar === sec.startBar + sec.bars - 1 && style !== "sparse") note(t + 3.5, 0.5, approach(r, ctx.chords[bar + 1]!), 0.55);
      continue;
    }
    const next = ctx.chords[bar + 1]!;
    const tones = chordTones(slot).map((pc) => fit(root + ((pc - (root % 12) + 12) % 12)));
    const third = tones[1]!;
    const fifth = fit(root + 7);
    const octave = root + 12 <= HI ? root + 12 : root;

    if (style === "walk") {
      note(t, 0.9, root, 0.8);
      note(t + 1, 0.9, r.pick([third, fifth]), 0.62);
      note(t + 2, 0.9, r.pick([fifth, octave, tones[2]!]), 0.66);
      note(t + 3, 0.9, approach(r, next), 0.6);
      if (r.chance(0.25)) note(t + 2.5, 0.4, fifth, 0.42);
    } else if (style === "pocket") {
      note(t, 1.5, root, 0.85);
      if (r.chance(0.6)) note(t + 2.5, 0.75, r.pick([root, octave, fifth]), 0.6);
      if (next.root !== slot.root || r.chance(0.3)) note(t + 3.5, 0.5, approach(r, next), 0.55);
    } else {
      note(t, 3, root, 0.75);
      if (r.chance(0.4)) note(t + 3, 1, fifth, 0.5);
    }
  }
  return events;
}
