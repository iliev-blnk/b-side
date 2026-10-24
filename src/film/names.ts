import type { Ep, Part } from "../band/types.ts";
import type { Rng } from "../music/rng.ts";

/**
 * The band on the date: a made-up player for every chair, credited the way a sleeve would.
 * Names are drawn from plain stock so none of them reads as anyone real.
 */

const FIRST = [
  "Ada", "Bruno", "Cass", "Dora", "Emil", "Fern", "Gus", "Hal", "Ines", "Jules", "Kit", "Lena", "Mae", "Nico", "Otto",
  "Pearl", "Quinn", "Ruth", "Sol", "Tess", "Ugo", "Vera", "Wes", "Yara", "Zeke", "Ida", "Milo", "Rosa", "Teo", "Lida",
  "Abel", "Nell", "Oren", "Bea", "Cyril", "Edie", "Floyd", "Greta", "Hugo", "Iris",
];
const LAST = [
  "Varga", "Holloway", "Okafor", "Linde", "Castell", "Pryor", "Quist", "Morrow", "Sandoval", "Kettering", "Ferro",
  "Delmont", "Rook", "Strand", "Orlov", "Bellweather", "Dunmore", "Albescu", "Mireles", "Tallis", "Venn", "Harrow",
  "Lisle", "Okonjo", "Brannigan", "Szabo", "Coyle", "Ferreira", "Lund", "Marchetti", "Pell", "Radu", "Sorensen",
  "Thorne", "Vasquez", "Wexler", "Yoshida", "Achebe", "Pashkov", "Hristov",
];

/** The chairs, in credit order, and what the sleeve calls each one. */
export type Chair = "lead" | "second" | "keys" | "vibes" | "bass" | "drums" | "percussion" | "strings" | "bells";

export interface Player {
  name: string;
  chair: Chair;
  /** What they play, as the credits set it. */
  plays: string;
  /** The part the band plays, for the stage: who stands where and with what. */
  part: Part;
}

const PLAYS: Partial<Record<Part, string>> = {
  sax: "tenor saxophone", trumpet: "trumpet", trombone: "trombone", flute: "flute", clarinet: "clarinet",
  vibes: "vibraphone", harmonica: "harmonica", piano: "piano", keys: "electric piano", bass: "double bass",
  strings: "strings", glock: "glockenspiel", marimba: "marimba",
};
const KIT: Part[] = ["kick", "snare", "hat", "ride", "crash", "tom", "brush"];
const HAND: Part[] = ["shaker", "conga", "bongo", "clave"];

export interface Band {
  name: string;
  players: Player[];
}

export function band(r: Rng, ep: Ep): Band {
  const firsts = [...FIRST];
  const lasts = [...LAST];
  const take = (pool: string[]) => pool.splice(Math.floor(r.next() * pool.length), 1)[0]!;
  const players: Player[] = [];
  const hire = (chair: Chair, part: Part, plays: string) => players.push({ name: `${take(firsts)} ${take(lasts)}`, chair, plays, part });

  const [first, second] = ep.lineup;
  hire("lead", first!, PLAYS[first!]!);
  if (second && PLAYS[second]) hire(second === "vibes" ? "vibes" : "second", second, PLAYS[second]!);
  // one player covers both keyboards when the date uses two
  const keys = ep.lineup.filter((p): p is "piano" | "keys" => p === "piano" || p === "keys");
  if (keys.length) hire("keys", keys[0]!, keys.map((k) => PLAYS[k]).join(" and "));
  if (ep.lineup.includes("bass")) hire("bass", "bass", "double bass");
  if (ep.lineup.some((p) => KIT.includes(p))) hire("drums", "snare", "drums");
  if (ep.lineup.some((p) => HAND.includes(p))) hire("percussion", "conga", "percussion");
  const bells = ep.lineup.filter((p) => p === "glock" || p === "marimba");
  if (bells.length) hire("bells", bells[0]!, bells.map((b) => PLAYS[b]).join(" and "));
  if (ep.lineup.includes("strings")) {
    players.push({ name: `the ${take(lasts)} strings`, chair: "strings", plays: "strings", part: "strings" });
  }

  // the date goes out under the leader's name, counted by who is on the stand
  const size = players.filter((p) => p.chair !== "strings").length;
  const SIZES = ["", "", "Duo", "Trio", "Quartet", "Quintet", "Sextet", "Septet", "Octet"];
  const leader = players[0]!.name.split(" ")[1];
  return { name: `The ${leader} ${SIZES[size] ?? "Orchestra"}`, players };
}
