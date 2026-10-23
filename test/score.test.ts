import { describe, expect, it } from "vitest";
import { MOODS } from "../src/music/moods.ts";
import { generate } from "../src/music/score.ts";
import { type Mood, type PitchedPart, RANGES } from "../src/music/types.ts";

const MOOD_LIST: Mood[] = ["noir", "chase", "sad"];
const DRUMS = new Set(["kick", "snare", "hat", "shaker"]);
const LEADS = new Set(["sax", "vibes", "harmonica"]);
const seeds = Array.from({ length: 200 }, (_, i) => `seed-${i}`);

describe("generate", () => {
  it("is deterministic", () => {
    for (const mood of MOOD_LIST) expect(generate("2026-10-23", mood)).toEqual(generate("2026-10-23", mood));
  });

  it("differs between dates", () => {
    expect(generate("2026-10-23", "noir").events).not.toEqual(generate("2026-10-24", "noir").events);
  });

  for (const mood of MOOD_LIST) {
    it(`${mood}: holds its shape across 200 seeds`, () => {
      const spec = MOODS[mood];
      for (const seed of seeds) {
        const s = generate(seed, mood);
        const ctx = `${mood} ${seed}`;
        expect(s.lengthSec, ctx).toBeGreaterThanOrEqual(60);
        expect(s.lengthSec, ctx).toBeLessThanOrEqual(90);
        expect(s.bpm, ctx).toBeGreaterThanOrEqual(spec.bpm[0]);
        expect(s.bpm, ctx).toBeLessThanOrEqual(spec.bpm[1]);
        expect(s.swing, ctx).toBeGreaterThanOrEqual(spec.swing[0]);
        expect(s.swing, ctx).toBeLessThanOrEqual(spec.swing[1]);

        const outOfRange = s.events.filter((e) => {
          if (e.midi === undefined) return false;
          const [lo, hi] = RANGES[e.part as PitchedPart];
          return e.midi < lo || e.midi > hi;
        });
        expect(outOfRange, ctx).toEqual([]);
        expect(s.events.filter((e) => !(e.vel > 0 && e.vel <= 1 && e.dur > 0)), ctx).toEqual([]);
        expect(s.events.some((e, i) => i > 0 && e.beat < s.events[i - 1]!.beat), `${ctx} sorted`).toBe(false);
        const end = Math.max(...s.events.map((e) => e.beat + e.dur));
        expect(end, ctx).toBeLessThanOrEqual(s.bars * 4 + 1e-9);

        for (const sec of s.sections) {
          if (sec.name !== "a" && sec.name !== "b") continue;
          if (sec.name === "a" && spec.quietA) continue;
          for (let bar = sec.startBar; bar < sec.startBar + sec.bars; bar++) {
            const has = s.events.some((e) => DRUMS.has(e.part) && e.beat >= bar * 4 && e.beat < bar * 4 + 4);
            expect(has, `${ctx} bar ${bar} has drums`).toBe(true);
          }
        }

        const b = s.sections.find((x) => x.name === "b")!;
        const leadInB = s.events.filter((e) => LEADS.has(e.part) && e.beat >= b.startBar * 4 && e.beat < (b.startBar + b.bars) * 4);
        expect(leadInB.length, `${ctx} lead in b`).toBeGreaterThan(0);

        // the lead leaves room: bars with no lead onsets inside lead sections
        const leadBars = s.sections.filter((x) => x.name === "a" || x.name === "b").flatMap((x) => Array.from({ length: x.bars }, (_, i) => x.startBar + i));
        const onsetBars = new Set(s.events.filter((e) => LEADS.has(e.part)).map((e) => Math.floor(e.beat / 4)));
        const restShare = leadBars.filter((bar) => !onsetBars.has(bar)).length / leadBars.length;
        expect(restShare, `${ctx} rests`).toBeGreaterThanOrEqual(spec.density === "low" ? 0.4 : 0.2);

        expect(s.hits.some((h, i) => i > 0 && h <= s.hits[i - 1]!), `${ctx} hits increase`).toBe(false);
        for (const sec of s.sections) expect(s.hits, ctx).toContain(sec.startBar * 4);
      }
    });
  }
});
