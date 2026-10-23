import type { Rng } from "../music/rng.ts";
import { writeBass } from "./bass.ts";
import { layChanges, pickChanges } from "./chords.ts";
import { writeComp } from "./comp.ts";
import { writeDrums } from "./drums.ts";
import { planForm } from "./form.ts";
import { writeMelody, writeTune } from "./melody.ts";
import { STYLES } from "./styles.ts";
import { secondsAt } from "./time.ts";
import type { Band, Ctx, Ending, Keys, Lead, Mood, Style, Track } from "./types.ts";

/** Seconds each ending rings after its last written beat. */
export const RING: Record<Ending, number> = { tag: 3, fermata: 4.5, fade: 0.5, runout: 2.5, button: 1.6 };

export interface TrackPlan {
  seed: string;
  mood: Mood;
  n: number;
  style: Style;
  key: number;
  minor: boolean;
  band: Band;
  /** Who takes the solo chorus, in order. */
  soloists: (Lead | Keys)[];
  title: string;
}

/** One track from its plan. Same plan, same track. */
export function generateTrack(r: Rng, plan: TrackPlan): Track {
  const { mood, n, style, key, minor, band } = plan;
  const spec = STYLES[style];
  const bpm = r.int(spec.bpm[0], spec.bpm[1]);
  const swing = Math.round(r.range(spec.swing[0], spec.swing[1]) * 1000) / 1000;
  const form = planForm(r.fork("form"), style, spec, bpm, n, band.lead, band.keys, plan.soloists);
  // boom-bap lives on vamps; the others like a tune that goes somewhere
  const changes = pickChanges(r.fork("changes"), minor, spec.aBars, style === "boombap" ? (p) => !!p.vamp : (p) => !p.vamp);
  const chords = layChanges(changes, form.sections, key, minor, spec.meter, form.ending);
  const ctx: Ctx = { mood, n, style, bpm, meter: spec.meter, key, minor, bars: form.bars, sections: form.sections, chords, band, ending: form.ending, aeolian: mood === "sad" };

  const tune = writeTune(r.fork("tune"), spec.meter, spec.aBars);
  const melody = writeMelody(ctx, r.fork("melody"), tune);
  const events = [
    ...writeComp(ctx, r.fork("comp"), spec),
    ...writeBass(ctx, r.fork("bass"), spec),
    ...writeDrums(ctx, r.fork("drums")),
    ...melody.events,
  ].sort((a, b) => a.beat - b.beat || a.part.localeCompare(b.part));

  const hits = new Set<number>(form.sections.map((s) => s.startBar * spec.meter));
  for (const p of melody.phrases) hits.add(p);
  const beats = form.bars * spec.meter;
  const clock = { bpm, swing, meter: spec.meter, ending: form.ending, sections: form.sections };
  return {
    seed: plan.seed,
    mood,
    n,
    style,
    bpm,
    swing,
    meter: spec.meter,
    key,
    minor,
    bars: form.bars,
    sections: form.sections,
    chords,
    events,
    hits: [...hits].filter((h) => h < beats).sort((a, b) => a - b),
    ending: form.ending,
    band,
    lengthSec: secondsAt(clock, beats, false) + RING[form.ending],
    title: plan.title,
  };
}
