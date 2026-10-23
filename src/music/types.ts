import type { Midi, Quality } from "./theory.ts";

export type Mood = "noir" | "chase" | "sad";
export type Part = "kick" | "snare" | "hat" | "shaker" | "bass" | "keys" | "piano" | "sax" | "vibes" | "harmonica";
export type PitchedPart = "bass" | "keys" | "piano" | "sax" | "vibes" | "harmonica";

export interface NoteEvent {
  part: Part;
  /** Start in beats from the top of the theme (straight time; swing is applied when played). */
  beat: number;
  dur: number;
  midi?: Midi;
  /** 0..1 */
  vel: number;
  /** Which recorded hit to use for drums: hat closed/closed2/ghost/open, snare hit/hit2/ghost/rim, shaker down/up. */
  variant?: string;
}

export interface Section {
  name: "intro" | "a" | "b" | "outro";
  startBar: number;
  bars: number;
}

export interface Score {
  seed: string;
  mood: Mood;
  bpm: number;
  /** Where the off-8th lands, as a fraction of the beat (0.5 = straight). */
  swing: number;
  /** Tonic pitch class, 0 = C. */
  key: number;
  bars: number;
  sections: Section[];
  events: NoteEvent[];
  /** Beats where the visuals should cut, strictly increasing. */
  hits: number[];
  lengthSec: number;
  /** Instrument choices, for display. */
  band: { keys: PitchedPart; lead: PitchedPart | null };
}

/** Playable range of each pitched part (MIDI, inclusive). The sampler covers all of it. */
export const RANGES: Record<PitchedPart, [Midi, Midi]> = {
  keys: [36, 84],
  piano: [36, 84],
  bass: [28, 55],
  sax: [45, 76],
  vibes: [53, 89],
  harmonica: [60, 84],
};

export interface ChordSlot {
  bar: number;
  root: Midi;
  quality: Quality;
  /** Rootless voicing for keys/piano. */
  voicing: Midi[];
}

export interface Ctx {
  mood: Mood;
  key: number;
  sections: Section[];
  bars: number;
  chords: ChordSlot[];
  keysPart: PitchedPart;
  leadPart: PitchedPart | null;
}

export function sectionAt(sections: Section[], bar: number): Section {
  const s = sections.find((x) => bar >= x.startBar && bar < x.startBar + x.bars);
  if (!s) throw new Error(`no section at bar ${bar}`);
  return s;
}
