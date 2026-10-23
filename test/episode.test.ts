import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { swingBeat } from "../src/audio/play.ts";
import { addDays, LAUNCH } from "../src/record/date.ts";
import { press } from "../src/record/press.ts";
import { length, shots } from "../src/visual/episode.ts";

const DAYS = Array.from({ length: 60 }, (_, i) => addDays(LAUNCH, i * 3));
const MIN_BEATS = { noir: 4, chase: 4, sad: 8 };

describe("episode cut list", () => {
  it("covers the whole record, shot after shot, with no gaps", () => {
    for (const d of DAYS) {
      const p = press(d);
      const s = shots(p);
      expect(s[0]!.start).toBe(0);
      expect(s.at(-1)!.end).toBeCloseTo(length(p), 6);
      for (let i = 0; i < s.length; i++) {
        expect(s[i]!.end).toBeGreaterThan(s[i]!.start);
        if (i > 0) expect(s[i]!.start).toBe(s[i - 1]!.end);
      }
    }
  });

  it("opens cold, sets the title on the tune, cuts on hits and ends on the outro", () => {
    for (const d of DAYS) {
      const p = press(d);
      const { score } = p;
      const sec = (beat: number) => swingBeat(beat, score.swing) * (60 / score.bpm);
      const a = score.sections.find((x) => x.name === "a")!;
      const outro = score.sections.find((x) => x.name === "outro")!;
      const s = shots(p);
      expect(s.map((x) => x.kind)).toEqual(["open", "title", ...Array(s.length - 3).fill("montage"), "end"]);
      expect(s[1]!.start).toBeCloseTo(sec(a.startBar * 4), 9);
      expect(s.at(-1)!.start).toBeCloseTo(sec(outro.startBar * 4), 9);

      const titleEnd = a.startBar * 4 + 8;
      const onHit = new Set([titleEnd, ...score.hits].map((b) => sec(b).toFixed(9)));
      const starts = new Set(score.sections.map((x) => x.startBar * 4));
      const montage = s.filter((x) => x.kind === "montage");
      expect(montage.length).toBeGreaterThan(3);
      let prev = -Infinity;
      for (const m of montage) {
        expect(onHit.has(m.start.toFixed(9))).toBe(true);
        const beat = [titleEnd, ...score.hits].find((b) => sec(b).toFixed(9) === m.start.toFixed(9))!;
        // shots hold for the mood's minimum, unless a new section forces the cut
        if (!starts.has(beat)) expect(beat - prev).toBeGreaterThanOrEqual(MIN_BEATS[p.mood]);
        else expect(beat - prev).toBeGreaterThanOrEqual(2);
        prev = beat;
      }
    }
  });

  it("never shows the same composition twice in a row", () => {
    for (const d of DAYS) {
      const s = shots(press(d));
      for (let i = 1; i < s.length; i++) expect(s[i]!.comp, `${d} shot ${i}`).not.toBe(s[i - 1]!.comp);
    }
  });

  it("credits the band on the first montage shots", () => {
    for (const d of DAYS) {
      const p = press(d);
      const credits = shots(p).filter((x) => x.credit).map((x) => x.credit);
      expect(credits).toContain("bass");
      expect(credits).toContain("drums");
      expect(credits.length).toBe(p.score.band.lead ? 4 : 3);
    }
  });
});

/**
 * Old records never change. These hashes pin what the first generator pressed on a few nights;
 * if one moves, a past record would play differently. Add a new version in press.ts instead.
 */
describe("pressings stay pressed", () => {
  const PINNED: Record<string, string> = {
    "2026-10-23": "5d7575d4c6f26517",
    "2026-10-24": "7bffcedcb62817d0",
    "2026-11-30": "607b5df4c7d84f76",
    "2027-02-14": "6113b66669e4b8c6",
    "2027-10-23": "4826aa7edfa84913",
  };
  const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);

  for (const [day, want] of Object.entries(PINNED)) {
    it(day, () => {
      const p = press(day);
      expect(hash({ p, cuts: shots(p) })).toBe(want);
    });
  }
});
