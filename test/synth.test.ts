import { describe, expect, it } from "vitest";
import { bassBuffer, crackleBuffer, kickBuffer } from "../src/audio/synth.ts";

/** Just enough of BaseAudioContext for offline buffer synthesis. */
function fakeCtx(sampleRate = 44100) {
  return {
    sampleRate,
    createBuffer(channels: number, length: number, sr: number) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { length, sampleRate: sr, numberOfChannels: channels, duration: length / sr, getChannelData: (i: number) => data[i]! };
    },
  } as unknown as BaseAudioContext;
}

function check(buf: AudioBuffer) {
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    for (const v of buf.getChannelData(c)) {
      expect(Number.isFinite(v)).toBe(true);
      peak = Math.max(peak, Math.abs(v));
    }
  }
  expect(peak).toBeLessThanOrEqual(1);
  expect(peak).toBeGreaterThan(0.05);
}

describe("synth", () => {
  it("makes a clean kick", () => check(kickBuffer(fakeCtx())));

  it("makes bass notes across the range, the same for the same seed", () => {
    const ctx = fakeCtx();
    for (const m of [28, 33, 40, 48, 55]) check(bassBuffer(ctx, m, 1.2, 7));
    expect(bassBuffer(ctx, 40, 1, 3).getChannelData(0)).toEqual(bassBuffer(ctx, 40, 1, 3).getChannelData(0));
  });

  it("makes crackle", () => {
    const buf = crackleBuffer(fakeCtx(), 3, 1);
    check(buf);
    expect(buf.duration).toBeCloseTo(3);
  });
});
