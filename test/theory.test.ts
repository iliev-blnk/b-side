import { describe, expect, it } from "vitest";
import { chord, noteName, parseNote, voiceLead } from "../src/music/theory.ts";

describe("theory", () => {
  it("names and parses notes", () => {
    expect(noteName(60)).toBe("C4");
    expect(noteName(58)).toBe("A#3");
    expect(parseNote("A#3")).toBe(58);
    expect(parseNote("C4")).toBe(60);
    expect(parseNote("Bb3")).toBe(58);
    for (let m = 21; m < 109; m++) expect(parseNote(noteName(m))).toBe(m);
  });

  it("builds chords", () => {
    expect(chord(57, "m9")).toEqual([57, 60, 64, 67, 71]);
    expect(chord(60, "maj7")).toEqual([60, 64, 67, 71]);
    expect(chord(55, "7b9")).toEqual([55, 59, 62, 65, 68]);
  });

  it("voice-leads with small movement inside the range", () => {
    const v = voiceLead([60, 64, 67, 71], chord(62, "m7"), [52, 76]);
    const moved = v.reduce((s, n, i) => s + Math.abs(n - [60, 64, 67, 71][i]!), 0);
    expect(moved).toBeLessThanOrEqual(6);
    for (const n of v) {
      expect(n).toBeGreaterThanOrEqual(52);
      expect(n).toBeLessThanOrEqual(76);
    }
    expect(v.map((n) => n % 12).sort()).toEqual([62, 65, 69, 72].map((n) => n % 12).sort());
  });

  it("voices the first chord near the middle of the range", () => {
    const v = voiceLead(null, chord(45, "m9"), [48, 72]);
    for (const n of v) {
      expect(n).toBeGreaterThanOrEqual(48);
      expect(n).toBeLessThanOrEqual(72);
    }
  });
});
