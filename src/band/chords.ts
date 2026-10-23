import { type Midi, voiceLead } from "../music/theory.ts";
import type { Rng } from "../music/rng.ts";
import type { ChordSlot, Ending, Section } from "./types.ts";

export type Quality = "m7" | "m9" | "m11" | "mMaj7" | "m6" | "maj7" | "maj9" | "6" | "7" | "13" | "7b9" | "m7b5";

const INTERVALS: Record<Quality, number[]> = {
  m7: [0, 3, 7, 10],
  m9: [0, 3, 7, 10, 14],
  m11: [0, 3, 7, 10, 14, 17],
  mMaj7: [0, 3, 7, 11, 14],
  m6: [0, 3, 7, 9, 14],
  maj7: [0, 4, 7, 11],
  maj9: [0, 4, 7, 11, 14],
  "6": [0, 4, 7, 9, 14],
  "7": [0, 4, 7, 10],
  "13": [0, 4, 7, 10, 14, 21],
  "7b9": [0, 4, 7, 10, 13],
  m7b5: [0, 3, 6, 10],
};

const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
const IONIAN = [0, 2, 4, 5, 7, 9, 11];
const MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10];

/** The scale a soloist thinks in over each chord. */
const SCALES: Record<Quality, number[]> = {
  m7: DORIAN,
  m9: DORIAN,
  m11: DORIAN,
  mMaj7: [0, 2, 3, 5, 7, 9, 11],
  m6: DORIAN,
  maj7: IONIAN,
  maj9: IONIAN,
  "6": IONIAN,
  "7": MIXOLYDIAN,
  "13": MIXOLYDIAN,
  "7b9": [0, 1, 4, 5, 7, 8, 10],
  m7b5: [0, 1, 3, 5, 6, 8, 10],
};

/** Left-hand voicings without the root (the bass has it): thirds and sevenths with colour on top. */
const ROOTLESS: Record<Quality, number[]> = {
  m7: [3, 7, 10, 14],
  m9: [3, 7, 10, 14],
  m11: [3, 10, 14, 17],
  mMaj7: [3, 7, 11, 14],
  m6: [3, 7, 9, 14],
  maj7: [4, 7, 11, 14],
  maj9: [4, 7, 11, 14],
  "6": [4, 7, 9, 14],
  "7": [4, 9, 10, 14],
  "13": [4, 10, 14, 21],
  "7b9": [4, 10, 13, 19],
  m7b5: [3, 6, 10, 12],
};

export function chordPcs(c: ChordSlot): number[] {
  return INTERVALS[c.quality].map((i) => (c.root + i) % 12);
}

/** Root, third, fifth and seventh (or sixth): the notes a long melody note can rest on. */
export function restingPcs(c: ChordSlot): number[] {
  return INTERVALS[c.quality].slice(0, 4).map((i) => (c.root + i) % 12);
}

/** Third and seventh, the notes that say what the chord is. */
export function guidePcs(c: ChordSlot): number[] {
  const iv = INTERVALS[c.quality];
  return [iv[1]!, iv[3]!].map((i) => (c.root + i) % 12);
}

export function scalePcs(c: ChordSlot, aeolian = false): number[] {
  const s = aeolian && SCALES[c.quality] === DORIAN ? AEOLIAN : SCALES[c.quality];
  return s.map((i) => (c.root + i) % 12);
}

/** Rootless voicing nearest the previous one, inside `range`. */
export function rootless(c: ChordSlot, prev: Midi[] | null, range: [Midi, Midi] = [50, 76]): Midi[] {
  return voiceLead(prev, ROOTLESS[c.quality].map((i) => c.root + i), range);
}

/** Root, seventh, third: the three-note shell a swing pianist's left hand plays. */
export function shell(c: ChordSlot): Midi[] {
  const iv = INTERVALS[c.quality];
  const root = 43 + ((c.root % 12) - 7 + 12) % 12; // G2..F#3
  return [root, root + iv[3]!, root + iv[1]! + 12];
}

/** A four-note pad for the strings, close and high, plus the root underneath for the cellos. */
export function pad(c: ChordSlot, prev: Midi[] | null): { top: Midi[]; low: Midi } {
  const iv = INTERVALS[c.quality];
  const colour = iv.length > 4 ? iv[4]! : iv[2]!;
  const top = voiceLead(prev, [iv[1]!, iv[2]!, iv[3]!, colour].map((i) => c.root + i), [58, 81]);
  return { top, low: 38 + ((c.root % 12) - 2 + 12) % 12 };
}

// --- progressions ------------------------------------------------------------------------------

type Chord = [degree: number, quality: Quality];
/** One bar: a chord, or two that split it. */
type Bar = Chord | [Chord, Chord];
export interface Prog {
  bars: Bar[];
  /** A vamp loops as written: no cadence is forced on its last bar. */
  vamp?: boolean;
}

const split = (b: Bar): b is [Chord, Chord] => Array.isArray(b[0]);

const MINOR_A4: Prog[] = [
  { bars: [[0, "m9"], [8, "maj7"], [[2, "m7b5"], [7, "7b9"]], [0, "m9"]] },
  { bars: [[0, "m9"], [0, "mMaj7"], [0, "m7"], [0, "m6"]] },
  { bars: [[0, "m9"], [5, "m9"], [[2, "m7b5"], [7, "7b9"]], [0, "m11"]] },
  { bars: [[0, "m9"], [1, "maj7"], [0, "m9"], [1, "maj7"]], vamp: true },
  { bars: [[0, "m11"], [0, "m11"], [8, "7"], [7, "7b9"]], vamp: true },
  { bars: [[0, "m9"], [5, "m9"], [10, "7"], [3, "maj7"]], vamp: true },
];
const MINOR_A8: Prog[] = [
  { bars: [[5, "m9"], [10, "13"], [3, "maj7"], [8, "maj7"], [2, "m7b5"], [7, "7b9"], [0, "m9"], [0, "m9"]] },
  { bars: [[0, "m9"], [0, "m9"], [5, "m9"], [5, "m9"], [2, "m7b5"], [7, "7b9"], [0, "m9"], [0, "m9"]] },
  { bars: [[0, "m9"], [0, "mMaj7"], [0, "m7"], [0, "m6"], [5, "m9"], [8, "7"], [[2, "m7b5"], [7, "7b9"]], [0, "m9"]] },
  { bars: [[0, "m11"], [0, "m11"], [0, "m11"], [0, "m11"], [3, "m11"], [3, "m11"], [0, "m11"], [0, "m11"]], vamp: true },
];
const MINOR_B4: Prog[] = [
  { bars: [[3, "maj7"], [8, "maj7"], [2, "m7b5"], [7, "7b9"]] },
  { bars: [[5, "m9"], [10, "13"], [3, "maj7"], [7, "7b9"]] },
  { bars: [[8, "maj7"], [8, "maj7"], [7, "7b9"], [7, "7b9"]] },
];
const MINOR_B8: Prog[] = [
  { bars: [[5, "m9"], [10, "13"], [3, "maj7"], [8, "maj7"], [2, "m7b5"], [2, "m7b5"], [7, "7b9"], [7, "7b9"]] },
  { bars: [[8, "maj7"], [8, "maj7"], [1, "maj7"], [1, "maj7"], [2, "m7b5"], [2, "m7b5"], [7, "7b9"], [7, "7b9"]] },
  { bars: [[3, "maj7"], [3, "maj7"], [5, "m9"], [10, "13"], [8, "maj7"], [8, "maj7"], [[2, "m7b5"], [7, "7b9"]], [7, "7b9"]] },
];
const MAJOR_A4: Prog[] = [
  { bars: [[0, "maj9"], [9, "m9"], [2, "m9"], [7, "13"]], vamp: true },
  { bars: [[2, "m9"], [7, "13"], [0, "maj9"], [0, "6"]] },
  { bars: [[0, "maj9"], [5, "7"], [[4, "m7"], [9, "7b9"]], [[2, "m9"], [7, "13"]]], vamp: true },
];
const MAJOR_A8: Prog[] = [
  { bars: [[0, "maj9"], [0, "maj9"], [2, "7"], [2, "7"], [2, "m9"], [1, "7"], [0, "maj9"], [0, "6"]] },
  { bars: [[0, "maj9"], [9, "m9"], [2, "m9"], [7, "13"], [4, "m7"], [9, "7b9"], [[2, "m9"], [7, "13"]], [0, "maj9"]] },
  { bars: [[0, "maj9"], [5, "maj7"], [4, "m7"], [9, "m9"], [2, "m9"], [7, "13"], [0, "maj9"], [0, "6"]] },
];
const MAJOR_B4: Prog[] = [
  { bars: [[5, "maj9"], [5, "m6"], [[4, "m7"], [9, "7b9"]], [[2, "m9"], [7, "13"]]] },
  { bars: [[4, "m7"], [9, "7b9"], [2, "m9"], [7, "13"]] },
];
const MAJOR_B8: Prog[] = [
  { bars: [[5, "maj9"], [5, "maj9"], [5, "m6"], [5, "m6"], [4, "m7"], [9, "7b9"], [2, "m9"], [7, "13"]] },
  { bars: [[9, "m9"], [9, "m9"], [2, "7"], [2, "7"], [2, "m9"], [2, "m9"], [7, "13"], [7, "13"]] },
];

export interface Changes {
  A: Prog;
  B: Prog;
}

export function pickChanges(r: Rng, minor: boolean, aBars: 4 | 8, prefer?: (p: Prog) => boolean): Changes {
  const pool = (ps: Prog[]) => (prefer && ps.some(prefer) ? ps.filter(prefer) : ps);
  const A = r.pick(pool(minor ? (aBars === 4 ? MINOR_A4 : MINOR_A8) : aBars === 4 ? MAJOR_A4 : MAJOR_A8));
  const B = r.pick(minor ? (aBars === 4 ? MINOR_B4 : MINOR_B8) : aBars === 4 ? MAJOR_B4 : MAJOR_B8);
  return { A, B };
}

/** The tonic chord a track ends on. */
export const finalQuality = (minor: boolean): Quality => (minor ? "m9" : "6");

/**
 * Lays the changes over the form. An A that returns to A turns around on its last bar (tonic, then
 * the dominant); an A that leads to B, or ends the tune, stays home. Intros vamp the end of A;
 * endings are written by the arranger.
 */
export function layChanges(changes: Changes, sections: Section[], key: number, minor: boolean, meter: 3 | 4, ending: Ending): ChordSlot[] {
  const slots: ChordSlot[] = [];
  const root = (deg: number) => 36 + ((key + deg) % 12);
  const dominant: Chord = [7, minor ? "7b9" : "13"];
  const push = (beat: number, b: Bar) => {
    if (split(b)) {
      slots.push({ beat, dur: 2, root: root(b[0][0]), quality: b[0][1] });
      slots.push({ beat: beat + 2, dur: meter - 2, root: root(b[1][0]), quality: b[1][1] });
    } else slots.push({ beat, dur: meter, root: root(b[0]), quality: b[1] });
  };

  sections.forEach((sec, i) => {
    const prog = sec.letter === "A" ? changes.A : changes.B;
    const n = prog.bars.length;
    for (let k = 0; k < sec.bars; k++) {
      const bar = sec.startBar + k;
      const beat = bar * meter;
      if (sec.kind === "ending") {
        push(beat, endingBar(changes.A, ending, k, sec.bars, minor, dominant));
        continue;
      }
      const idx = sec.kind === "intro" ? (n - sec.bars + (k % n) + n) % n : k % n;
      let b = prog.bars[idx]!;
      const lastBar = k === sec.bars - 1;
      const next = sections[i + 1];
      const turns = lastBar && sec.letter === "A" && !prog.vamp && !sec.closes && next !== undefined && next.kind !== "ending";
      if (turns) {
        const home = split(b) ? b[1] : b;
        b = home[0] === 0 ? [home, dominant] : b;
      }
      push(beat, b);
    }
  });
  return slots;
}

/**
 * A tag plays the last two bars of A three times, turning around each time, then holds the tonic;
 * a fade and a run-out keep vamping the top of A; a fermata and a button just land on the tonic.
 */
function endingBar(A: Prog, ending: Ending, k: number, bars: number, minor: boolean, dominant: Chord): Bar {
  const tonic: Chord = [0, finalQuality(minor)];
  const n = A.bars.length;
  if (ending === "tag") {
    if (k >= bars - 2) return tonic;
    const b = A.bars[n - 2 + (k % 2)]!;
    if (k % 2 === 0) return b;
    const home = split(b) ? b[0] : b;
    return home[0] === 0 ? [home, dominant] : b;
  }
  if (ending === "fade") return A.bars[k % Math.min(4, n)]!;
  if (ending === "runout") return A.bars[k % n]!;
  return tonic;
}

export function chordAt(chords: ChordSlot[], beat: number): ChordSlot {
  let lo = 0;
  let hi = chords.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (chords[mid]!.beat <= beat + 1e-9) lo = mid;
    else hi = mid - 1;
  }
  return chords[lo]!;
}
