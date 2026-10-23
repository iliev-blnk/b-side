import { bass } from "./bass.ts";
import { drums } from "./drums.ts";
import { buildChords, comp } from "./harmony.ts";
import { lead } from "./lead.ts";
import { MOODS } from "./moods.ts";
import { rng } from "./rng.ts";
import type { Ctx, Mood, Score, Section } from "./types.ts";

const MIN_SEC = 60;
const MAX_SEC = 90;

function layout(bodyBars: number[], outro: number): Section[] {
  const names: Section["name"][] = ["intro", "a", "b", "a"];
  const sections: Section[] = [];
  let bar = 0;
  bodyBars.forEach((bars, i) => {
    sections.push({ name: names[i]!, startBar: bar, bars });
    bar += bars;
  });
  sections.push({ name: "outro", startBar: bar, bars: outro });
  return sections;
}

/** A theme for one date and mood. Same input, same theme, always. */
export function generate(seed: string, mood: Mood): Score {
  const spec = MOODS[mood];
  const r = rng(`${seed}/${mood}`);
  const bpm = r.int(spec.bpm[0], spec.bpm[1]);
  const swing = Math.round(r.range(spec.swing[0], spec.swing[1]) * 1000) / 1000;
  const key = r.pick(spec.tonics);
  const prog = r.pick(spec.progressions);
  const keysPart = r.pick(spec.keys);
  const leadPart = r.pick(spec.leads);

  const barSec = (4 * 60) / bpm;
  const body = spec.returnA ? [4, 8, 8, 8] : [4, 8, 8];
  const bodyBars = body.reduce((s, n) => s + n, 0);
  const outros = [2, 3, 4].filter((o) => {
    const sec = (bodyBars + o) * barSec;
    return sec >= MIN_SEC && sec <= MAX_SEC;
  });
  if (!outros.length) throw new Error(`${mood} at ${bpm} bpm cannot fit ${MIN_SEC}-${MAX_SEC} s`);
  const outro = r.pick(outros);
  const sections = layout(body, outro);
  const bars = bodyBars + outro;

  const ctx: Ctx = { mood, key, sections, bars, chords: buildChords(prog, key, bars), keysPart, leadPart };
  const events = [
    ...comp(r.fork("keys"), ctx),
    ...bass(r.fork("bass"), ctx),
    ...drums(r.fork("drums"), ctx),
    ...lead(r.fork("lead"), ctx),
  ].sort((a, b) => a.beat - b.beat);

  const hits = new Set<number>(sections.map((s) => s.startBar * 4));
  for (const s of sections) {
    if (s.name !== "a" && s.name !== "b") continue;
    for (let bar = s.startBar + 1; bar < s.startBar + s.bars; bar++) {
      if (ctx.chords[bar]!.root !== ctx.chords[bar - 1]!.root) hits.add(bar * 4);
    }
  }
  // lead phrase starts: a lead note after at least a beat of silence
  let lastEnd = -Infinity;
  for (const e of events) {
    if (e.part !== leadPart) continue;
    if (e.beat - lastEnd >= 1) hits.add(e.beat);
    lastEnd = Math.max(lastEnd, e.beat + e.dur);
  }

  return {
    seed,
    mood,
    bpm,
    swing,
    key,
    bars,
    sections,
    events,
    hits: [...hits].sort((a, b) => a - b),
    lengthSec: bars * barSec,
    band: { keys: keysPart, lead: leadPart },
  };
}
