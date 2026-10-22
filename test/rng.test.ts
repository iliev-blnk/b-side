import { describe, expect, it } from "vitest";
import { rng } from "../src/music/rng.ts";

describe("rng", () => {
  it("gives the same stream for the same seed", () => {
    const a = rng("2026-10-23");
    const b = rng("2026-10-23");
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
  });

  it("gives different streams for different seeds", () => {
    expect(rng("2026-10-23").next()).not.toBe(rng("2026-10-24").next());
  });

  it("forks independent streams by label", () => {
    const r = rng("2026-10-23");
    const bass = r.fork("bass").next();
    const drums = r.fork("drums").next();
    expect(bass).not.toBe(drums);
    expect(rng("2026-10-23").fork("bass").next()).toBe(bass);
  });

  it("forking does not advance the parent", () => {
    const a = rng("x");
    const b = rng("x");
    a.fork("lead");
    expect(a.next()).toBe(b.next());
  });

  it("keeps int, pick and chance in range", () => {
    const r = rng("range");
    for (let i = 0; i < 1000; i++) {
      const n = r.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
      expect(["a", "b"]).toContain(r.pick(["a", "b"]));
    }
    expect(r.chance(0)).toBe(false);
    expect(r.chance(1)).toBe(true);
  });
});
