export type Midi = number;

export type Quality = "m7" | "m9" | "m11" | "maj7" | "maj9" | "7" | "7b9" | "m7b5";

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function noteName(m: Midi): string {
  return `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

export function parseNote(s: string): Midi {
  const match = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(s.trim());
  if (!match) throw new Error(`bad note: ${s}`);
  const [, letter, acc, oct] = match;
  const pc = LETTER[letter!.toUpperCase()]! + (acc === "#" ? 1 : acc === "b" ? -1 : 0);
  return (Number(oct) + 1) * 12 + pc;
}

const INTERVALS: Record<Quality, number[]> = {
  m7: [0, 3, 7, 10],
  m9: [0, 3, 7, 10, 14],
  m11: [0, 3, 7, 10, 14, 17],
  maj7: [0, 4, 7, 11],
  maj9: [0, 4, 7, 11, 14],
  "7": [0, 4, 7, 10],
  "7b9": [0, 4, 7, 10, 13],
  m7b5: [0, 3, 6, 10],
};

export function chord(root: Midi, quality: Quality): Midi[] {
  return INTERVALS[quality].map((i) => root + i);
}

/** Total semitone movement between two voicings, matching each new note to its nearest old one. */
function movement(prev: Midi[], next: Midi[]): number {
  const a = [...prev].sort((x, y) => x - y);
  const b = [...next].sort((x, y) => x - y);
  if (a.length === b.length) return a.reduce((s, n, i) => s + Math.abs(n - b[i]!), 0);
  return b.reduce((s, n) => s + Math.min(...a.map((p) => Math.abs(p - n))), 0);
}

/**
 * Picks the closed-position inversion of `next` (in any octave) that fits `range`
 * and moves least from `prev`. Without `prev`, the one centred in the range.
 */
export function voiceLead(prev: Midi[] | null, next: Midi[], range: [Midi, Midi]): Midi[] {
  const pcs = next.map((n) => ((n % 12) + 12) % 12);
  const [lo, hi] = range;
  const centre = (lo + hi) / 2;
  let best: Midi[] | null = null;
  let bestCost = Infinity;
  for (let rot = 0; rot < pcs.length; rot++) {
    const order = [...pcs.slice(rot), ...pcs.slice(0, rot)];
    for (let base = lo - 12; base <= hi; base++) {
      if (((base % 12) + 12) % 12 !== order[0]) continue;
      const v: Midi[] = [base];
      for (const pc of order.slice(1)) {
        let n = v[v.length - 1]! + 1;
        while (((n % 12) + 12) % 12 !== pc) n++;
        v.push(n);
      }
      if (v[0]! < lo || v[v.length - 1]! > hi) continue;
      const mean = v.reduce((s, n) => s + n, 0) / v.length;
      const cost = prev ? movement(prev, v) + Math.abs(mean - centre) * 0.1 : Math.abs(mean - centre);
      if (cost < bestCost) {
        bestCost = cost;
        best = v;
      }
    }
  }
  if (!best) throw new Error(`cannot voice ${next.join(",")} in ${lo}-${hi}`);
  return best;
}
