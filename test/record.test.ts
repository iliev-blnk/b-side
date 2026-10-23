import { describe, expect, it } from "vitest";
import { rng } from "../src/music/rng.ts";
import { addDays, isDay, isPressed, LAUNCH, longDay, pressedDays, recordNo, today } from "../src/record/date.ts";
import { press } from "../src/record/press.ts";
import { allTitles, tracklist } from "../src/record/title.ts";

// Titles that must never come out of the generator, normalized and hashed so the list itself is not in the repo.
const NEVER = new Set(["419aef2d","e7b57eca","8f74bbaa","08bc41b2","443af48c","b1aebe16","a037ae7f","ca80ef5d","2419a539","e7748093","bbde9245","278b0a7f","f06c7cde","b4cc0c39","a0d55a5d","eda1f17f","14837d81","73f5845f","7b17a8a9","91ea25db","0d9c3788","d580268f","b300cc1d","009d75f7","0d0dc37e","eb376237","70a0be64","0c285a89","0470634a"]);
const fnv = (s: string) => {
  let x = 0x811c9dc5;
  for (const c of s) x = Math.imul(x ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return x.toString(16).padStart(8, "0");
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

describe("dates", () => {
  it("reads today in Chișinău, not UTC", () => {
    // 22:30 UTC on the 22nd is already the 23rd in Chișinău (UTC+3 in October)
    expect(today(new Date("2026-10-22T22:30:00Z"))).toBe("2026-10-23");
    expect(today(new Date("2026-10-22T20:30:00Z"))).toBe("2026-10-22");
  });
  it("numbers records from launch", () => {
    expect(recordNo(LAUNCH)).toBe(1);
    expect(recordNo(addDays(LAUNCH, 30))).toBe(31);
    // across the end of daylight saving time and a leap day
    expect(recordNo("2026-10-26")).toBe(4);
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("shelves launch to today, newest first", () => {
    expect(pressedDays("2026-10-22")).toEqual([]);
    expect(pressedDays(LAUNCH)).toEqual([LAUNCH]);
    expect(pressedDays("2026-10-25")).toEqual(["2026-10-25", "2026-10-24", "2026-10-23"]);
    expect(isPressed("2026-10-26", "2026-10-25")).toBe(false);
    expect(isPressed("2026-10-22", "2026-10-25")).toBe(false);
    expect(isPressed("2026-02-30", "2027-01-01")).toBe(false);
  });
  it("validates and formats days", () => {
    expect(isDay("2026-10-23")).toBe(true);
    expect(isDay("2026-13-01")).toBe(false);
    expect(isDay("23.10.2026")).toBe(false);
    expect(longDay("2026-10-03")).toBe("3 oct 2026");
  });
});

describe("titles", () => {
  it("never produce a title from the show", () => {
    for (const mood of ["noir", "chase", "sad"] as const) {
      const all = allTitles(mood);
      expect(all.size).toBeGreaterThan(300);
      for (const t of all) expect(NEVER.has(fnv(norm(t))), t).toBe(false);
    }
  });
  it("are covered by allTitles and fit a sleeve", () => {
    for (const mood of ["noir", "chase", "sad"] as const) {
      const all = allTitles(mood);
      for (let i = 0; i < 300; i++) {
        for (const t of tracklist(rng(`t${i}`), mood)) {
          expect(all.has(t), t).toBe(true);
          expect(t.length).toBeLessThanOrEqual(28);
        }
      }
    }
  });
});

describe("pressing", () => {
  it("is the same every time", () => {
    expect(JSON.stringify(press("2026-11-02"))).toBe(JSON.stringify(press("2026-11-02")));
  });
  it("varies over a year", () => {
    const year = Array.from({ length: 365 }, (_, i) => press(addDays(LAUNCH, i)));
    const moods = new Map<string, number>();
    for (const p of year) moods.set(p.mood, (moods.get(p.mood) ?? 0) + 1);
    for (const n of moods.values()) expect(n).toBeGreaterThan(80);
    expect(new Set(year.map((p) => p.title)).size).toBeGreaterThan(300);
    expect(new Set(year.map((p) => p.sleeve)).size).toBe(4);
    expect(new Set(year.map((p) => JSON.stringify(p.palette))).size).toBe(15);
  });
});
