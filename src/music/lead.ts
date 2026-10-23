import { chordTones } from "./harmony.ts";
import { MOODS } from "./moods.ts";
import type { Rng } from "./rng.ts";
import type { Ctx, NoteEvent, PitchedPart, Section } from "./types.ts";

interface Cell {
  t: number;
  d: number;
}

/** Two-bar phrase rhythms, in beats from the phrase start. */
const RHYTHMS: Record<"low" | "high", Cell[][]> = {
  low: [
    [{ t: 0.5, d: 0.5 }, { t: 1, d: 1.5 }, { t: 2.5, d: 0.5 }, { t: 3, d: 3 }],
    [{ t: 1.5, d: 0.5 }, { t: 2, d: 0.5 }, { t: 2.5, d: 1 }, { t: 3.5, d: 3.5 }],
    [{ t: 0, d: 2.5 }, { t: 2.5, d: 0.5 }, { t: 3, d: 0.5 }, { t: 3.5, d: 2.5 }],
    [{ t: 2, d: 0.5 }, { t: 2.5, d: 0.5 }, { t: 3, d: 1 }, { t: 4, d: 0.5 }, { t: 4.5, d: 2.5 }],
    [{ t: 0.5, d: 1 }, { t: 1.5, d: 0.5 }, { t: 2, d: 2 }, { t: 4.5, d: 0.5 }, { t: 5, d: 2 }],
  ],
  high: [
    [{ t: 0, d: 0.5 }, { t: 0.5, d: 0.5 }, { t: 1, d: 0.5 }, { t: 1.5, d: 0.5 }, { t: 2, d: 1 }, { t: 3, d: 0.5 }, { t: 3.5, d: 0.5 }, { t: 4, d: 1.5 }],
    [{ t: 0.5, d: 0.5 }, { t: 1, d: 0.25 }, { t: 1.25, d: 0.25 }, { t: 1.5, d: 0.5 }, { t: 2.5, d: 0.5 }, { t: 3, d: 1 }, { t: 4.5, d: 0.5 }, { t: 5, d: 1 }],
    [{ t: 0, d: 0.75 }, { t: 0.75, d: 0.75 }, { t: 1.5, d: 0.5 }, { t: 2, d: 0.5 }, { t: 2.5, d: 1.5 }, { t: 4, d: 0.5 }, { t: 4.5, d: 0.5 }, { t: 5, d: 1 }],
  ],
};

/** Where each lead part sits (inside its playable range). */
const TESSITURA: Record<string, [number, number]> = {
  sax: [50, 72],
  vibes: [62, 84],
  harmonica: [62, 82],
};

interface Hook {
  rhythm: Cell[];
  steps: number[];
  start: number;
}

/**
 * The lead: one short hook, stated (call) and answered, then varied in section b.
 * Long notes always land on a chord tone, so the line never hangs on a clash.
 */
export function lead(r: Rng, ctx: Ctx): NoteEvent[] {
  const part = ctx.leadPart;
  if (!part) return [];
  const spec = MOODS[ctx.mood];
  const [lo, hi] = TESSITURA[part]!;
  const pcs = spec.leadScale.map((i) => (ctx.key + i) % 12);
  const scale: number[] = [];
  for (let m = lo; m <= hi; m++) if (pcs.includes(m % 12)) scale.push(m);
  const nearest = (m: number) => scale.reduce((bi, n, i) => (Math.abs(n - m) < Math.abs(scale[bi]! - m) ? i : bi), 0);
  const clamp = (i: number) => Math.max(0, Math.min(scale.length - 1, i));
  const chordAt = (beat: number) => ctx.chords[Math.min(ctx.chords.length - 1, Math.floor(beat / 4))]!;
  const toChordTone = (m: number, beat: number, prefer?: number) => {
    const tones = prefer !== undefined ? [prefer] : chordTones(chordAt(beat));
    for (let d = 0; d <= 6; d++) {
      for (const c of [m - d, m + d]) {
        if (c >= lo && c <= hi && tones.includes(c % 12)) return c;
      }
    }
    return m;
  };

  const rhythm = r.pick(RHYTHMS[spec.density]);
  const hook: Hook = {
    rhythm,
    steps: rhythm.slice(1).map(() => r.pick([-2, -1, -1, 1, 1, 2, -3, 3, 0])),
    start: nearest((lo + hi) / 2) + r.int(-2, 2),
  };

  const events: NoteEvent[] = [];
  const play = (h: Hook, at: number, lift: number, close: boolean, vel: number) => {
    let idx = clamp(h.start + lift);
    const notes: { beat: number; dur: number; midi: number }[] = [];
    h.rhythm.forEach((c, i) => {
      if (i > 0) {
        idx += h.steps[i - 1]!;
        if (idx < 0 || idx >= scale.length) idx -= 2 * h.steps[i - 1]!;
        idx = clamp(idx);
      }
      const beat = at + c.t;
      let m = scale[idx]!;
      const isLast = i === h.rhythm.length - 1;
      if (isLast) m = toChordTone(m, beat, close ? ctx.key : undefined);
      else if (c.d >= 1 || beat % 1 === 0) m = toChordTone(m, beat);
      idx = nearest(m);
      notes.push({ beat, dur: c.d, midi: m });
    });
    for (const [i, n] of notes.entries()) {
      events.push({ part: part as PitchedPart, beat: n.beat, dur: n.dur, midi: n.midi, vel: Math.min(1, vel + (i === 0 ? 0.06 : 0)) });
    }
  };

  // the answer keeps the rhythm and bends the end of the line
  const answer: Hook = { ...hook, steps: hook.steps.map((s, i) => (i >= hook.steps.length - 2 ? -s || -1 : s)) };

  const leadSections = ctx.sections.filter((s): s is Section => (s.name === "a" && !spec.quietA) || s.name === "b");
  for (const sec of leadSections) {
    const t = sec.startBar * 4;
    const lift = sec.name === "b" ? 2 : 0;
    for (let p = 0; p + 4 <= sec.bars; p += 4) {
      if (spec.density === "low") {
        // call in bars 0-1, answer in bars 2-3 of every four, but only every other phrase answers
        const answered = p % 8 === 4;
        play(answered ? answer : hook, t + p * 4, lift, answered, 0.62);
      } else {
        // busy: call and answer back to back, then two bars of space every eight
        play(hook, t + p * 4, lift, false, 0.66);
        if (p % 8 === 0) play(answer, t + (p + 2) * 4, lift, true, 0.62);
      }
    }
  }

  // a last word over the final chord
  if (spec.density === "low" && r.chance(0.6)) {
    const at = (ctx.bars - 1) * 4;
    events.push({ part, beat: at + 0.5, dur: 3.5, midi: toChordTone(scale[clamp(hook.start)]!, at, ctx.key), vel: 0.5 });
  }
  return events;
}
