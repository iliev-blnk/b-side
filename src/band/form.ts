import type { Rng } from "../music/rng.ts";
import type { StyleSpec } from "./styles.ts";
import type { Ending, Keys, Lead, Section, Style, Treatment } from "./types.ts";

export interface FormPlan {
  sections: Section[];
  ending: Ending;
  bars: number;
}

/** Bars each ending adds after the last A. */
const ENDING_BARS: Record<Ending, number> = { tag: 8, fermata: 2, fade: 8, runout: 2, button: 1 };

interface Draft {
  kind: Section["kind"];
  letter: "A" | "B";
  bars: number;
  energy: number;
  voice: Lead | Keys;
  treatment: Treatment;
}

/**
 * Song form: an intro, the head (A A B A), a solo chorus, the head out and an ending. Slow tracks
 * take half a chorus to solo and come back in at the bridge, so every track lands at two to three
 * minutes. Energy rises through the solo and peaks on the way out; the closer plays hardest.
 */
export function planForm(r: Rng, style: Style, spec: StyleSpec, bpm: number, n: number, lead: Lead, keys: Keys, soloists: (Lead | Keys)[]): FormPlan {
  const a = spec.aBars;
  const barSec = (spec.meter * 60) / bpm;
  const ending = r.pick(spec.endings);
  const lift = n === 2 ? 0.1 : n === 1 ? -0.08 : 0;
  const e = (x: number) => Math.max(0.15, Math.min(1, x + lift));
  const head = (treat: (letter: "A" | "B", i: number) => Treatment): Draft[] =>
    (["A", "A", "B", "A"] as const).map((letter, i) => ({ kind: "head", letter, bars: a, energy: e([0.45, 0.5, 0.6, 0.55][i]!), voice: lead, treatment: treat(letter, i) }));

  const introBars = style === "ballad" ? r.pick([2, 4]) : 4;
  const drafts: Draft[] = [{ kind: "intro", letter: "A", bars: introBars, energy: e(0.32), voice: keys, treatment: "full" }];

  // swing and ballads state the tune in two; the walk starts at the bridge
  const inTwo = style === "swing" || style === "ballad" || (style === "waltz" && r.chance(0.5));
  drafts.push(...head((letter) => (inTwo && letter === "A" ? "two" : "full")));

  // the solo chorus: the first soloist takes the A A, the second the bridge and last A
  const half = barSec * a * 4 > 60;
  const [s1, s2] = [soloists[0]!, soloists[1] ?? soloists[0]!];
  const stopTime = (style === "swing" || style === "shuffle") && r.chance(0.45);
  const solo: Draft[] = (half ? (["A", "A"] as const) : (["A", "A", "B", "A"] as const)).map((letter, i, all) => ({
    kind: "solo",
    letter,
    bars: a,
    energy: e(0.6 + (0.25 * i) / Math.max(1, all.length - 1)),
    voice: half ? (i === 0 ? s1 : s2) : i < 2 ? s1 : s2,
    treatment: i === 0 && stopTime ? "stop" : "full",
  }));
  drafts.push(...solo);

  // the head out: from the bridge when time is short, and a breakdown on the bridge in boom-bap
  const fromBridge = barSec * a * 4 > 36 || r.chance(0.3);
  const breakdown = style === "boombap" && r.chance(0.55);
  const out: Draft[] = (fromBridge ? (["B", "A"] as const) : (["A", "A", "B", "A"] as const)).map((letter, i, all) => ({
    kind: "out",
    letter,
    bars: a,
    energy: e(i === all.length - 1 ? 0.72 : letter === "B" ? 0.8 : 0.7),
    voice: lead,
    treatment: letter === "B" && breakdown ? "break" : "full",
  }));
  drafts.push(...out);
  drafts.push({ kind: "ending", letter: "A", bars: ENDING_BARS[ending], energy: e(ending === "fermata" ? 0.45 : 0.62), voice: lead, treatment: "full" });

  let bar = 0;
  const sections: Section[] = drafts.map((d, i) => {
    const next = drafts[i + 1];
    const s: Section = { ...d, startBar: bar, closes: d.letter === "A" && (next === undefined || next.letter === "B" || next.kind === "ending") };
    bar += d.bars;
    return s;
  });
  return { sections, ending, bars: bar };
}
