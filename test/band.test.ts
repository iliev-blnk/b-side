import { describe, expect, it } from "vitest";
import { chordAt, chordPcs } from "../src/band/chords.ts";
import { generateEp } from "../src/band/ep.ts";
import { type Ep, isDrum, type Mood, RANGES } from "../src/band/types.ts";

const days = Array.from({ length: 10 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);
const eps: Ep[] = days.flatMap((d) => (["noir", "chase", "sad"] as Mood[]).map((m) => generateEp(d, m)));

describe("generateEp", () => {
  it("is deterministic", () => {
    expect(JSON.stringify(generateEp("2026-10-23", "noir"))).toBe(JSON.stringify(generateEp("2026-10-23", "noir")));
  });

  it("differs between nights", () => {
    expect(generateEp("2026-10-23", "noir").tracks[0]!.title).not.toBe(generateEp("2026-10-24", "noir").tracks[0]!.title);
  });

  it("presses three tracks in six to nine minutes", () => {
    for (const ep of eps) {
      expect(ep.tracks).toHaveLength(3);
      const total = ep.tracks.reduce((s, t) => s + t.lengthSec, 0);
      expect(total).toBeGreaterThan(330);
      expect(total).toBeLessThan(540);
    }
  });

  it("writes every note inside its instrument's range", () => {
    for (const ep of eps)
      for (const t of ep.tracks)
        for (const e of t.events) {
          expect(Number.isFinite(e.beat) && e.dur > 0 && e.vel > 0 && e.vel <= 1).toBe(true);
          if (isDrum(e.part)) continue;
          const [lo, hi] = RANGES[e.part];
          expect(e.midi).toBeGreaterThanOrEqual(lo);
          expect(e.midi).toBeLessThanOrEqual(hi);
        }
  });

  it("lays out the form bar after bar, with the solo between the heads", () => {
    for (const ep of eps)
      for (const t of ep.tracks) {
        let bar = 0;
        for (const s of t.sections) {
          expect(s.startBar).toBe(bar);
          bar += s.bars;
        }
        const kinds = t.sections.map((s) => s.kind);
        expect(kinds[0]).toBe("intro");
        expect(kinds.at(-1)).toBe("ending");
        expect(kinds.indexOf("solo")).toBeGreaterThan(kinds.lastIndexOf("head"));
        expect(kinds.indexOf("out")).toBeGreaterThan(kinds.lastIndexOf("solo"));
      }
  });

  it("lands the head's strong beats on chord tones", () => {
    let strong = 0;
    let inside = 0;
    for (const ep of eps)
      for (const t of ep.tracks) {
        const heads = t.sections.filter((s) => s.kind === "head");
        for (const e of t.events) {
          if (e.part !== t.band.lead || e.beat % t.meter !== 0) continue;
          if (!heads.some((s) => e.beat >= s.startBar * t.meter && e.beat < (s.startBar + s.bars) * t.meter)) continue;
          const c = chordAt(t.chords, e.beat);
          strong++;
          if (chordPcs(c).includes(e.midi! % 12)) inside++;
        }
      }
    expect(inside / strong).toBeGreaterThan(0.85);
  });

  it("keeps the chords covering the whole track", () => {
    for (const ep of eps)
      for (const t of ep.tracks) {
        let beat = 0;
        for (const c of t.chords) {
          expect(c.beat).toBeCloseTo(beat, 6);
          beat += c.dur;
        }
        expect(beat).toBeCloseTo(t.sections.reduce((s, x) => s + x.bars, 0) * t.meter, 6);
      }
  });
});
