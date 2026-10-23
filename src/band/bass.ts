import type { Midi } from "../music/theory.ts";
import type { Rng } from "../music/rng.ts";
import { chordAt, chordPcs, scalePcs } from "./chords.ts";
import type { StyleSpec } from "./styles.ts";
import { type ChordSlot, type Ctx, type NoteEvent, RANGES, type Section, stopHits, stopped } from "./types.ts";

const [LO, HI] = RANGES.bass;
const pc = (m: Midi) => ((m % 12) + 12) % 12;

/** Root in A1..G#2, the warm middle of an upright. */
const low = (root: Midi) => 33 + ((pc(root) - 9 + 12) % 12);

function fit(n: Midi): Midi {
  while (n > HI) n -= 12;
  while (n < LO) n += 12;
  return n;
}

/** The pitch class nearest `target`, in the bass's range. */
function near(pcs: number[], target: Midi, not?: Midi): Midi {
  let best = target;
  let cost = Infinity;
  for (let m = LO; m <= HI; m++) {
    if (!pcs.includes(pc(m)) || m === not) continue;
    if (Math.abs(m - target) < cost) [best, cost] = [m, Math.abs(m - target)];
  }
  return best;
}

type Role = "R" | "5" | "O" | "7" | "A";
type Pattern = [beat: number, dur: number, role: Role, vel: number][];

/** Boom-bap: the root, an octave or fifth answering it, and a push into the next bar. */
const POCKETS: Pattern[] = [
  [[0, 1.5, "R", 1], [1.5, 0.5, "R", 0.6], [2.5, 0.5, "5", 0.8], [3, 0.5, "O", 0.7], [3.5, 0.5, "A", 0.7]],
  [[0, 2, "R", 1], [2.5, 1, "5", 0.85], [3.5, 0.5, "A", 0.7]],
  [[0, 0.75, "R", 1], [0.75, 0.75, "R", 0.55], [2, 1, "7", 0.8], [3, 1, "5", 0.75]],
  [[0, 1, "R", 1], [1.75, 0.75, "O", 0.7], [2.5, 1, "R", 0.85], [3.5, 0.5, "A", 0.65]],
];
const SPARSE: Pattern = [[0, 3, "R", 0.95], [3.5, 0.5, "A", 0.6]];
const BOSSA: Pattern = [[0, 1.5, "R", 1], [1.5, 0.5, "5", 0.7], [2, 1.5, "5", 0.85], [3.5, 0.5, "A", 0.65]];

/**
 * The bass: a pocket under boom-bap, a walking line in swing, halves in a ballad's two-feel,
 * the bossa's root-fifth with its push, a waltz's one. It plays the stops with the band.
 */
export function writeBass(ctx: Ctx, r: Rng, spec: StyleSpec): NoteEvent[] {
  const events: NoteEvent[] = [];
  const meter = ctx.meter;
  const note = (beat: number, dur: number, midi: Midi, vel: number) => events.push({ part: "bass", beat, dur, midi: fit(midi), vel: Math.min(1, vel) });
  const nextRoot = (c: ChordSlot) => chordAt(ctx.chords, c.beat + c.dur + 0.01);
  let cur = low(ctx.chords[0]!.root);

  const role = (c: ChordSlot, rl: Role, root: Midi): Midi => {
    const pcs = chordPcs(c);
    switch (rl) {
      case "R": return root;
      case "5": return near([pcs[2]!], root + 7);
      case "O": return root + 12 <= HI ? root + 12 : root;
      case "7": return near([pcs[3]!], root + 10);
      case "A": {
        const n = low(nextRoot(c).root);
        return n + r.pick([-1, 1, -5, 2]);
      }
    }
  };

  const walk = (c: ChordSlot, sec: Section) => {
    const n = nextRoot(c);
    const root = near([pc(c.root)], cur);
    const target = near([pc(n.root)], root + r.pick([-2, 3, 5]));
    const steps = Math.round(c.dur);
    let m = root;
    for (let k = 0; k < steps; k++) {
      const beat = c.beat + k;
      if (k === 0) m = r.chance(0.12) && k + 1 < steps ? near([chordPcs(c)[1]!], root) : root;
      else if (k === steps - 1) m = r.chance(0.6) ? target + (target > m ? -1 : 1) : near(scalePcs(c), target + (target > m ? -2 : 2), target);
      else {
        const dir = Math.sign(target - m) || (r.chance(0.5) ? 1 : -1);
        const pool = k === 2 ? chordPcs(c) : scalePcs(c);
        m = near(pool, m + dir * r.pick([2, 3, 4]), m);
      }
      if (m > HI - 2 || m < LO) m = fit(m - 12 * Math.sign(m - 40));
      note(beat, 0.9, m, 0.62 + 0.25 * sec.energy + (k === 0 ? 0.08 : 0));
      // a skip: the triplet ghost into the next beat
      if (k > 0 && k < steps - 1 && r.chance(0.08 + 0.15 * sec.energy)) note(beat + 2 / 3, 0.3, m, 0.35);
    }
    cur = m;
  };

  const halves = (c: ChordSlot, sec: Section) => {
    const root = low(c.root);
    if (meter === 3) {
      note(c.beat, Math.min(c.dur, 3) * 0.95, root, 0.72 + 0.2 * sec.energy);
      return;
    }
    note(c.beat, Math.min(2, c.dur) * 0.95, root, 0.72 + 0.2 * sec.energy);
    if (c.dur >= 4) note(c.beat + 2, 1.9, role(c, "5", root), 0.62 + 0.2 * sec.energy);
    if (c.dur >= 4 && r.chance(0.25)) note(c.beat + 3.5, 0.45, role(c, "A", root), 0.45);
  };

  const pattern = (c: ChordSlot, p: Pattern, sec: Section) => {
    const root = low(c.root);
    for (const [b, d, rl, v] of p) {
      if (b >= c.dur) continue;
      note(c.beat + b, Math.min(d, c.dur - b) * 0.92, role(c, rl, root), v * (0.75 + 0.3 * sec.energy));
    }
  };

  const waltz = (c: ChordSlot, sec: Section) => {
    const root = low(c.root);
    note(c.beat, 1.9, root, 0.75 + 0.2 * sec.energy);
    if (c.dur >= 3) note(c.beat + 2, 0.9, role(c, r.chance(0.5) ? "5" : "A", root), 0.6 + 0.2 * sec.energy);
  };

  const pockets = new Map<Section, Pattern>();
  const pocketFor = (sec: Section) => {
    if (!pockets.has(sec)) pockets.set(sec, sec.energy < 0.4 || sec.treatment === "break" ? SPARSE : r.pick(POCKETS));
    return pockets.get(sec)!;
  };

  const sections = ctx.sections;
  const last = sections.at(-1)!;
  for (const sec of sections) {
    const from = sec.startBar * meter;
    const to = from + sec.bars * meter;
    if (sec.kind === "intro" && spec.bass !== "pocket" && sec.energy < 0.35 && ctx.style === "ballad") continue;

    if (sec.kind === "ending" && ctx.ending !== "fade" && ctx.ending !== "runout") {
      const tonic = chordAt(ctx.chords, to - 0.01);
      if (ctx.ending === "button") note(from, 0.35, low(tonic.root), 0.95);
      else if (ctx.ending === "fermata") note(from, sec.bars * meter, low(tonic.root) - (low(tonic.root) - 12 >= LO ? 12 : 0), 0.8);
      else {
        // tag: keep playing until the last two bars, then hold home
        for (const c of ctx.chords) if (c.beat >= from && c.beat < to - 2 * meter) walk(c, sec);
        note(to - 2 * meter, 2 * meter, low(tonic.root), 0.8);
      }
      continue;
    }

    for (const c of ctx.chords) {
      if (c.beat < from || c.beat >= to) continue;
      const bar = Math.floor(c.beat / meter);
      if (stopped(sec, bar)) continue;
      if (spec.bass === "pocket") pattern(c, pocketFor(sec), sec);
      else if (spec.bass === "bossa") pattern(c, BOSSA, sec);
      else if (spec.bass === "waltz") (sec.treatment === "two" || sec.energy < 0.5 ? waltz : walk)(c, sec);
      else if (sec.treatment === "two" || (spec.bass === "two" && sec.energy < 0.6) || sec.kind === "intro") halves(c, sec);
      else walk(c, sec);
    }
    if (sec.treatment === "stop") for (const h of stopHits(sec, meter)) note(from + h, 0.4, low(chordAt(ctx.chords, from + h).root), 0.9);
  }

  // nothing rings past a button
  if (ctx.ending === "button") {
    const end = last.startBar * meter + 0.35;
    return events.filter((e) => e.beat <= last.startBar * meter).map((e) => (e.beat + e.dur > end ? { ...e, dur: Math.max(0.1, end - e.beat) } : e));
  }
  return events;
}
