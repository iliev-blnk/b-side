import type { Ep } from "../band/types.ts";
import { rng } from "../music/rng.ts";
import { band, type Band } from "./names.ts";
import type { Hat } from "./rig.ts";

/**
 * What recurs across the night's three films: the same figure in the same scarf, the same city,
 * the same sign over the same street, the weather, and one small thing from the titles that
 * keeps turning up in their hand.
 */

export type Prop = "match" | "key" | "letter" | "ticket" | "photo" | "radio";
export type Weather = "rain" | "snow" | "clear";

export interface Cast {
  seed: string;
  prop: Prop;
  weather: Weather;
  hat: Hat;
  /** The neon over the street. */
  sign: string;
  band: Band;
}

const WORDS: [RegExp, Prop][] = [
  [/match/i, "match"],
  [/radio|wireless|signal/i, "radio"],
  [/photo|picture|portrait|snapshot/i, "photo"],
  [/letter|postcard|ledger|alibi|witness|note|telegram/i, "letter"],
  [/ticket|fare|platform|station|junction|train|crossing|freeway|tunnel|tram|line|terminal/i, "ticket"],
  [/key|room|house|door|hotel|window|lock/i, "key"],
];
const SIGNS = ["HOTEL", "ROOMS", "BAR", "DINER", "RADIO", "DANCE", "TAXI", "CAFE", "CLUB"];

export function cast(ep: Ep): Cast {
  const r = rng(`${ep.seed}/film/cast/${ep.mood}`);
  // the first title that names a thing decides what they carry
  let prop: Prop | null = null;
  for (const t of ep.tracks) {
    prop ??= WORDS.find(([re]) => re.test(t.title))?.[1] ?? null;
  }
  prop ??= r.pick(ep.mood === "sad" ? ["photo", "letter", "radio"] : ep.mood === "chase" ? ["ticket", "key", "match"] : ["match", "key", "letter"]);
  const weather: Weather =
    ep.mood === "noir" ? (r.chance(0.8) ? "rain" : "clear") : ep.mood === "sad" ? (r.chance(0.6) ? "snow" : "rain") : r.chance(0.6) ? "clear" : "rain";
  return {
    seed: `${ep.seed}/${ep.mood}`,
    prop,
    weather,
    hat: r.pick(["fedora", "fedora", "fedora", "cap", "beret"] as const),
    sign: r.pick(SIGNS),
    band: band(r.fork("band"), ep),
  };
}
