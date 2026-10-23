import type { Quality } from "./theory.ts";
import type { Mood, PitchedPart } from "./types.ts";

/** One chord per bar: semitones above the tonic and quality. */
export type Progression = [number, Quality][];

export interface MoodSpec {
  bpm: [number, number];
  swing: [number, number];
  keys: PitchedPart[];
  leads: PitchedPart[];
  /** Tonic pitch classes that sit well for the lead instruments. */
  tonics: number[];
  progressions: Progression[];
  /** Scale for lead lines, semitones above the tonic. */
  leadScale: number[];
  comp: "held" | "stabs" | "broken";
  bass: "pocket" | "walk" | "sparse";
  /** Kick patterns, beats within a bar. */
  kicks: number[][];
  hats: "eighths" | "sixteenths" | "shaker";
  density: "low" | "high";
  /** Section a comes back after b (keeps fast themes long enough). */
  returnA: boolean;
  /** Section a has no drums and no lead; they arrive in b. */
  quietA: boolean;
}

const MINOR_BLUE = [0, 2, 3, 5, 7, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];

export const MOODS: Record<Mood, MoodSpec> = {
  noir: {
    bpm: [66, 74],
    swing: [0.58, 0.62],
    keys: ["piano", "keys"],
    leads: ["sax"],
    tonics: [9, 2, 4, 0, 5, 7],
    progressions: [
      [[0, "m9"], [0, "m9"], [5, "m9"], [7, "7b9"]],
      [[0, "m9"], [8, "maj7"], [2, "m7b5"], [7, "7b9"]],
      [[0, "m11"], [5, "m9"], [0, "m11"], [5, "m9"]],
      [[0, "m9"], [10, "7"], [8, "maj7"], [7, "7b9"]],
    ],
    leadScale: MINOR_BLUE,
    comp: "held",
    bass: "pocket",
    kicks: [[0, 2.5], [0, 0.75, 2.5], [0, 2.5, 2.75]],
    hats: "eighths",
    density: "low",
    returnA: false,
    quietA: false,
  },
  chase: {
    bpm: [92, 100],
    swing: [0.54, 0.58],
    keys: ["keys"],
    leads: ["sax", "vibes"],
    tonics: [4, 2, 9, 7, 0],
    progressions: [
      [[0, "m7"], [8, "maj7"], [0, "m7"], [8, "maj7"]],
      [[0, "m9"], [5, "m7"], [10, "7"], [7, "7b9"]],
      [[0, "m7"], [10, "7"], [8, "maj7"], [7, "7b9"]],
      [[0, "m9"], [3, "maj7"], [5, "m9"], [7, "7b9"]],
    ],
    leadScale: DORIAN,
    comp: "stabs",
    bass: "walk",
    kicks: [[0, 0.75, 1.5, 2.5, 3.25], [0, 0.75, 2.25, 2.5], [0, 1.75, 2.5, 3.5]],
    hats: "sixteenths",
    density: "high",
    returnA: true,
    quietA: false,
  },
  sad: {
    bpm: [62, 70],
    swing: [0.6, 0.64],
    keys: ["piano"],
    leads: ["vibes", "harmonica"],
    tonics: [9, 4, 2, 7, 0, 5],
    progressions: [
      [[0, "m9"], [8, "maj7"], [3, "maj7"], [10, "7"]],
      [[0, "m7"], [5, "m9"], [10, "7"], [3, "maj7"]],
      [[8, "maj7"], [7, "m7"], [0, "m9"], [0, "m9"]],
      [[0, "m9"], [3, "maj7"], [8, "maj7"], [7, "m7"]],
    ],
    leadScale: AEOLIAN,
    comp: "broken",
    bass: "sparse",
    kicks: [[0, 2.5], [0, 1.75, 2.5]],
    hats: "shaker",
    density: "low",
    returnA: false,
    quietA: true,
  },
};
