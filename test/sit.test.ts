import { describe, expect, it } from "vitest";
import { chordAt, scalePcs } from "../src/band/chords.ts";
import { generateEp } from "../src/band/ep.ts";
import { RANGES } from "../src/band/types.ts";
import { rng } from "../src/music/rng.ts";
import { addDays, LAUNCH } from "../src/record/date.ts";
import { roomFor, trimFor } from "../src/sit/mix.ts";
import { nearestStep, PADS, padPitch, stepsOf, stepTime, tuning } from "../src/sit/pads.ts";
import { decodeTake, encodeTake, knobAt, type Take } from "../src/sit/take.ts";

const EPS = Array.from({ length: 5 }, (_, i) => addDays(LAUNCH, i * 13)).flatMap((d) => (["noir", "chase", "sad"] as const).map((m) => generateEp(d, m)));
const TRACKS = EPS.flatMap((ep) => ep.tracks);

describe("takes", () => {
  it("survive the link", () => {
    const r = rng("takes");
    for (let k = 0; k < 50; k++) {
      const take: Take = { notes: [], moves: [] };
      for (let i = r.int(0, 300); i > 0; i--) take.notes.push({ n: r.int(0, 2), step: r.int(0, 2000), pad: r.int(0, 8), len: r.int(1, 64) });
      for (let i = r.int(0, 40); i > 0; i--) take.moves.push({ t: r.int(0, 60000), knob: r.next() < 0.5 ? "intensity" : "room", value: r.int(0, 20) });
      const back = decodeTake(encodeTake(take))!;
      const key = (x: Take["notes"][number]) => `${x.n}/${x.step}/${x.pad}/${x.len}`;
      expect(back.notes.map(key).sort()).toEqual(take.notes.map(key).sort());
      expect(back.moves.map((m) => m.t)).toEqual(take.moves.map((m) => m.t).sort((a, b) => a - b));
    }
  });

  it("stay short enough for a link", () => {
    const take: Take = { notes: Array.from({ length: 200 }, (_, i) => ({ n: Math.floor(i / 70), step: (i % 70) * 6, pad: i % 9, len: 2 })), moves: [] };
    expect(encodeTake(take).length).toBeLessThan(1000);
  });

  it("turn anything else away", () => {
    for (const s of ["", "AQ", "not a take", "Ag", "AQE", "////", "AQ!!"]) expect(decodeTake(s)).toBeNull();
    expect(decodeTake(encodeTake({ notes: [], moves: [] }))).toEqual({ notes: [], moves: [] });
  });

  it("know where the knobs were", () => {
    const take: Take = { notes: [], moves: [{ t: 100, knob: "room", value: 3 }, { t: 500, knob: "room", value: 18 }] };
    expect(knobAt(take, "room", 50)).toBe(10);
    expect(knobAt(take, "room", 200)).toBe(3);
    expect(knobAt(take, "room", 900)).toBe(18);
    expect(knobAt(take, "intensity", 900)).toBe(10);
  });
});

describe("pads", () => {
  it("are tuned low to high", () => {
    for (const t of TRACKS) {
      const ps = tuning(t);
      expect(ps).toHaveLength(PADS);
      for (let i = 1; i < ps.length; i++) expect(ps[i]!).toBeGreaterThan(ps[i - 1]!);
    }
  });

  it("only ever play notes of the chord's scale, in the horn's reach", () => {
    for (const t of TRACKS) {
      const [lo, hi] = RANGES[t.band.lead];
      for (const c of t.chords) {
        const scale = scalePcs(chordAt(t.chords, c.beat), t.mood === "sad");
        for (let p = 0; p < PADS; p++) {
          const m = padPitch(t, p, c.beat);
          expect(scale).toContain(m % 12);
          expect(m).toBeGreaterThanOrEqual(lo);
          expect(m).toBeLessThanOrEqual(hi);
        }
      }
    }
  });

  it("put notes on the nearest step of the swung grid", () => {
    for (const t of TRACKS.slice(0, 9)) {
      for (const x of [0, 0.01, 1.234, 7.77, t.lengthSec / 2]) {
        const s = nearestStep(t, x);
        const d = Math.abs(stepTime(t, s) - x);
        if (s > 0) expect(d).toBeLessThanOrEqual(Math.abs(stepTime(t, s - 1) - x) + 1e-9);
        if (s < stepsOf(t)) expect(d).toBeLessThanOrEqual(Math.abs(stepTime(t, s + 1) - x) + 1e-9);
      }
    }
  });
});

describe("knobs", () => {
  it("leave the record as written in the middle", () => {
    for (const t of TRACKS) for (const e of t.events) expect(trimFor(t, e.part, 0.5)).toBe(1);
    expect(roomFor({ wet: 0.2, cutoff: 5000 }, 0.5)).toEqual({ wet: 0.2, cutoff: 5000 });
  });

  it("thin the band to the tune, the bass and the backbeat", () => {
    for (const t of TRACKS) {
      for (const p of ["hat", "ride", "shaker", "conga"] as const) expect(trimFor(t, p, 0)).toBe(0);
      for (const p of ["bass", "kick", "snare", t.band.lead] as const) expect(trimFor(t, p, 0)).toBeGreaterThan(0.9);
    }
    const dry = roomFor({ wet: 0.2, cutoff: 5000 }, 0);
    const wet = roomFor({ wet: 0.2, cutoff: 5000 }, 1);
    expect(dry.wet).toBe(0);
    expect(wet.wet).toBeGreaterThan(0.5);
    expect(wet.cutoff).toBeLessThan(dry.cutoff);
  });
});
