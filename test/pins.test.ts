import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateEp } from "../src/band/ep.ts";
import { film } from "../src/film/film.ts";
import { linerNotes } from "../src/label/record.ts";
import { recordNo } from "../src/record/date.ts";
import { press } from "../src/record/press.ts";

/**
 * Old records never change. These hashes pin what was pressed on a few nights: the sleeve, every
 * note of the side, the film's cut list and the liner notes. If one moves, a past record would look,
 * play or read differently. Add a new version in press.ts instead.
 */
const PINNED: Record<string, Record<"sleeve" | "side" | "film" | "notes", string>> = {
  "2026-10-23": { sleeve: "d500380cb63eb581", side: "a71de51381dae237", film: "d681992222c37dd5", notes: "973acc2c889813c5" },
  "2026-10-24": { sleeve: "7f9c9283948b766a", side: "2f992f7b51c0941d", film: "b37919d796e9756b", notes: "9c45ee74620ce37d" },
  "2026-11-30": { sleeve: "45cdb8358ef874fc", side: "e68e783b60274c39", film: "666453de154e52ed", notes: "d9552b56eac1f38f" },
  "2027-02-14": { sleeve: "5b86b4ff2ec9af81", side: "f8c994d3b2913006", film: "1f4733c512b42daf", notes: "d98006c3fea6fd22" },
  "2027-10-23": { sleeve: "a18562ff1a249d5e", side: "b0a579d6354844a7", film: "fc944e2fd0b9e9bd", notes: "4b904508a7882697" },
};

const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);

function pressing(day: string) {
  const p = press(day);
  const ep = generateEp(day, p.mood);
  const f = film(ep, { no: recordNo(day), day });
  return {
    sleeve: hash(p),
    side: hash(ep),
    film: hash({ cast: f.cast, shots: f.shots.map(({ scene, variant, into, n, start, end }) => ({ scene, variant, into, n, start, end })) }),
    notes: hash(linerNotes(day)),
  };
}

describe("pressings stay pressed", () => {
  for (const [day, want] of Object.entries(PINNED)) {
    it(day, () => expect(pressing(day)).toEqual(want));
  }
});
