import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { indexPack, nearestSample, type Manifest } from "../src/audio/samples.ts";
import { type Pitched, RANGES } from "../src/band/types.ts";
import { swingBeat } from "../src/band/time.ts";

const manifest: Manifest = JSON.parse(readFileSync(new URL("../public/samples/manifest.json", import.meta.url), "utf8"));
const index = indexPack(manifest);

describe("nearestSample", () => {
  for (const part of Object.keys(RANGES) as Pitched[]) {
    it(`${part} covers its whole range within 4 semitones`, () => {
      const [lo, hi] = RANGES[part];
      for (let m = lo; m <= hi; m++) {
        const s = nearestSample(index, part, m);
        expect(Math.abs(s.distance), `${part} ${m}`).toBeLessThanOrEqual(4);
        expect(s.rate).toBeCloseTo(2 ** (s.distance / 12), 10);
      }
    });
  }

  it("plays a sample at its own pitch at rate 1", () => {
    const s = nearestSample(index, "keys", 60);
    expect(s.distance).toBe(0);
    expect(s.rate).toBe(1);
    expect(s.file).toBe("keys-C4.mp3");
  });

  it("finds drum variants by name", () => {
    expect(nearestSample(index, "hat", "open").file).toBe("hat-open.mp3");
    expect(nearestSample(index, "snare", "rim").file).toBe("snare-rim.mp3");
  });
});

describe("swingBeat", () => {
  it("leaves downbeats alone and pushes off-8ths to the swing point", () => {
    expect(swingBeat(3, 0.6)).toBe(3);
    expect(swingBeat(3.5, 0.6)).toBeCloseTo(3.6);
    expect(swingBeat(3.25, 0.6)).toBeCloseTo(3.3);
    expect(swingBeat(3.75, 0.6)).toBeCloseTo(3.8);
    expect(swingBeat(2.5, 0.5)).toBe(2.5);
  });
});
