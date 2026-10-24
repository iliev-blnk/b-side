import { describe, expect, it } from "vitest";
import { generateEp } from "../src/band/ep.ts";
import { film } from "../src/film/film.ts";
import { addDays, LAUNCH, recordNo } from "../src/record/date.ts";

const DAYS = Array.from({ length: 6 }, (_, i) => addDays(LAUNCH, i * 11));
const MOODS = ["noir", "chase", "sad"] as const;

/** Every number in a frame, so a NaN anywhere in a scene shows up. */
function numbers(x: unknown, out: number[] = []): number[] {
  if (typeof x === "number") out.push(x);
  else if (Array.isArray(x)) for (const v of x) numbers(v, out);
  else if (x && typeof x === "object") for (const v of Object.values(x)) numbers(v, out);
  return out;
}

describe("film", () => {
  const films = DAYS.flatMap((day) => MOODS.map((mood) => film(generateEp(day, mood), { no: recordNo(day), day })));

  it("tiles the side with shots and ends on the record", () => {
    for (const f of films) {
      expect(f.shots.at(-1)!.end).toBeCloseTo(f.length, 6);
      for (let i = 1; i < f.shots.length; i++) expect(f.shots[i]!.start).toBe(f.shots[i - 1]!.end);
      expect(f.shots.at(-1)!.scene).toBe("record");
    }
  });

  it("draws every frame it is asked for with finite numbers", () => {
    const seen = new Set<string>();
    for (const f of films) {
      for (const s of f.shots) {
        seen.add(s.scene);
        for (const k of [0.02, 0.3, 0.6, 0.98]) {
          const fr = f.at(s.start + (s.end - s.start) * k);
          const bad = numbers([fr.view, fr.prev, fr.type]).filter((n) => !Number.isFinite(n));
          expect(bad, `${f.ep.seed} ${s.scene} at ${k}`).toEqual([]);
        }
      }
    }
    for (const scene of ["skyline", "tram", "roof", "bridge", "platform", "record"]) expect(seen).toContain(scene);
  }, 60_000);
});
