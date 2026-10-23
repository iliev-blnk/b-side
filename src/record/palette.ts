import type { Rng } from "../music/rng.ts";
import type { Mood } from "../music/types.ts";

/** The paper stock. Flat colours only; grain and light are added when drawn. */
export const PAPER = {
  ink: "#0e0d0c",
  night: "#121a2e",
  bone: "#e9e3d6",
  red: "#c8321f",
  orange: "#dc6a26",
  yellow: "#efb417",
  blue: "#1d4a9c",
  green: "#22594a",
} as const;

export type Paper = keyof typeof PAPER;

export interface Palette {
  /** The sheet everything sits on. */
  ground: Paper;
  /** The big shapes. */
  main: Paper;
  /** Second shape colour. */
  second: Paper;
  /** One small spot of colour. */
  accent: Paper;
  /** Title type. */
  type: Paper;
}

const SETS: Record<Mood, Palette[]> = {
  noir: [
    { ground: "ink", main: "red", second: "yellow", accent: "bone", type: "bone" },
    { ground: "ink", main: "yellow", second: "bone", accent: "red", type: "bone" },
    { ground: "night", main: "bone", second: "red", accent: "yellow", type: "bone" },
    { ground: "ink", main: "blue", second: "bone", accent: "orange", type: "bone" },
    { ground: "red", main: "ink", second: "yellow", accent: "bone", type: "bone" },
  ],
  chase: [
    { ground: "yellow", main: "ink", second: "red", accent: "blue", type: "ink" },
    { ground: "red", main: "bone", second: "ink", accent: "blue", type: "bone" },
    { ground: "orange", main: "ink", second: "blue", accent: "bone", type: "ink" },
    { ground: "bone", main: "red", second: "ink", accent: "yellow", type: "ink" },
    { ground: "blue", main: "yellow", second: "ink", accent: "red", type: "bone" },
  ],
  sad: [
    { ground: "blue", main: "bone", second: "ink", accent: "yellow", type: "bone" },
    { ground: "night", main: "blue", second: "bone", accent: "yellow", type: "bone" },
    { ground: "green", main: "bone", second: "ink", accent: "orange", type: "bone" },
    { ground: "bone", main: "blue", second: "ink", accent: "red", type: "ink" },
    { ground: "ink", main: "green", second: "bone", accent: "yellow", type: "bone" },
  ],
};

export function palette(r: Rng, mood: Mood): Palette {
  return r.pick(SETS[mood]);
}

const lum = (c: Paper) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(PAPER[c].slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};

/** WCAG contrast ratio between two papers, 1 to 21. */
export function contrast(a: Paper, b: Paper): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
