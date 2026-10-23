import type { Rng } from "../music/rng.ts";
import type { Ending, Keys, Lead, Mood, Style } from "./types.ts";

export interface StyleSpec {
  meter: 3 | 4;
  bpm: [number, number];
  swing: [number, number];
  /** Bars in each letter of the tune; slow styles use short sections so a track stays under three minutes. */
  aBars: 4 | 8;
  bass: "pocket" | "walk" | "two" | "bossa" | "waltz";
  comp: "stabs" | "charleston" | "ballad" | "waltz" | "bossa" | "shuffle";
  keys: Keys[];
  endings: Ending[];
  /** Minor key odds. */
  minor: number;
  /** Seconds of room: how long the reverb tail rings and how much of it comes through. */
  room: { seconds: number; wet: number };
}

export const STYLES: Record<Style, StyleSpec> = {
  boombap: { meter: 4, bpm: [66, 80], swing: [0.56, 0.6], aBars: 4, bass: "pocket", comp: "stabs", keys: ["keys", "piano"], endings: ["runout", "fade"], minor: 0.85, room: { seconds: 1.1, wet: 0.14 } },
  swing: { meter: 4, bpm: [132, 176], swing: [0.6, 0.64], aBars: 8, bass: "walk", comp: "charleston", keys: ["piano"], endings: ["tag", "button"], minor: 0.6, room: { seconds: 1.8, wet: 0.2 } },
  ballad: { meter: 4, bpm: [56, 66], swing: [0.6, 0.64], aBars: 4, bass: "two", comp: "ballad", keys: ["piano"], endings: ["fermata"], minor: 0.45, room: { seconds: 2.6, wet: 0.3 } },
  waltz: { meter: 3, bpm: [120, 150], swing: [0.6, 0.64], aBars: 8, bass: "waltz", comp: "waltz", keys: ["piano"], endings: ["fermata", "tag"], minor: 0.55, room: { seconds: 2.2, wet: 0.24 } },
  bossa: { meter: 4, bpm: [118, 138], swing: [0.5, 0.52], aBars: 8, bass: "bossa", comp: "bossa", keys: ["piano", "keys"], endings: ["fade", "tag"], minor: 0.4, room: { seconds: 1.6, wet: 0.2 } },
  shuffle: { meter: 4, bpm: [104, 120], swing: [0.64, 0.67], aBars: 8, bass: "walk", comp: "shuffle", keys: ["keys", "piano"], endings: ["button", "tag"], minor: 0.8, room: { seconds: 1.3, wet: 0.16 } },
};

interface MoodPlan {
  /** Styles for the title track, the change of pace and the closer. */
  tracks: [Style[], Style[], Style[]];
  /** Lead horns this mood hires, most likely first. */
  leads: Lead[];
  /** Odds the strings are on the date. */
  strings: number;
  /** Tonic pitch classes. */
  keys: number[];
}

export const MOODS: Record<Mood, MoodPlan> = {
  noir: { tracks: [["boombap"], ["ballad", "waltz"], ["swing", "boombap"]], leads: ["trumpet", "sax", "trombone", "clarinet"], strings: 0.35, keys: [0, 2, 5, 7, 9] },
  chase: { tracks: [["shuffle", "boombap"], ["bossa"], ["swing", "shuffle"]], leads: ["sax", "flute", "trumpet", "vibes"], strings: 0.15, keys: [2, 4, 7, 9, 10] },
  sad: { tracks: [["boombap"], ["ballad"], ["waltz", "bossa"]], leads: ["flute", "clarinet", "trumpet", "harmonica", "vibes"], strings: 0.8, keys: [1, 3, 5, 8, 10] },
};

/** The band on a night: who plays lead on which track, and who answers. */
export interface Lineup {
  leads: [Lead, Lead];
  strings: boolean;
}

export function hire(r: Rng, mood: Mood): Lineup {
  const plan = MOODS[mood];
  const first = r.pick(plan.leads.slice(0, 3));
  const rest = plan.leads.filter((l) => l !== first);
  return { leads: [first, r.pick(rest)], strings: r.chance(plan.strings) };
}
