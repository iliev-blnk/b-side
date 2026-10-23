import type { Midi } from "../music/theory.ts";
import type { Quality } from "./chords.ts";

export type Mood = "noir" | "chase" | "sad";

/** How a track is played. Boom-bap is the label's sound; the others are what the band can also do. */
export type Style = "boombap" | "swing" | "ballad" | "waltz" | "bossa" | "shuffle";

export type Drum = "kick" | "snare" | "hat" | "ride" | "crash" | "tom" | "shaker" | "conga" | "bongo" | "clave" | "brush";
export type Lead = "sax" | "trumpet" | "trombone" | "flute" | "clarinet" | "vibes" | "harmonica";
export type Keys = "piano" | "keys";
export type Pitched = "bass" | Keys | Lead | "strings" | "marimba" | "glock";
export type Part = Drum | Pitched;

export const DRUMS: readonly Drum[] = ["kick", "snare", "hat", "ride", "crash", "tom", "shaker", "conga", "bongo", "clave", "brush"];
export const isDrum = (p: Part): p is Drum => (DRUMS as readonly string[]).includes(p);

/** Playable range of each pitched part (MIDI, inclusive). The sample set covers all of it. */
export const RANGES: Record<Pitched, [Midi, Midi]> = {
  bass: [28, 55],
  piano: [36, 96],
  keys: [36, 84],
  sax: [44, 77],
  trumpet: [52, 82],
  trombone: [40, 67],
  flute: [60, 93],
  clarinet: [50, 86],
  vibes: [53, 89],
  harmonica: [60, 84],
  strings: [36, 86],
  marimba: [48, 84],
  glock: [79, 108],
};

/** Where each lead is comfortable: heads sit here, solos may go a little past. */
export const TESSITURA: Record<Lead | Keys, [Midi, Midi]> = {
  sax: [50, 72],
  trumpet: [58, 77],
  trombone: [46, 64],
  flute: [67, 88],
  clarinet: [58, 79],
  vibes: [62, 84],
  harmonica: [62, 81],
  piano: [62, 84],
  keys: [60, 81],
};

export interface NoteEvent {
  part: Part;
  /** Start in beats from the top of the track (straight time; swing is applied when played). */
  beat: number;
  dur: number;
  midi?: Midi;
  /** 0..1 */
  vel: number;
  /** Which recorded hit to use for drums (see the sample manifest), e.g. snare hit/ghost/rim/tap. */
  variant?: string;
}

/**
 * How the band treats a section: everyone in, a stop-time chorus (band hits, soloist plays through),
 * a breakdown (drums out), or in two (bass in half notes, brushes).
 */
export type Treatment = "full" | "stop" | "break" | "two";

export interface Section {
  kind: "intro" | "head" | "solo" | "out" | "ending";
  /** The letter of the tune's form this section plays (intros and endings borrow A). */
  letter: "A" | "B";
  startBar: number;
  bars: number;
  /** 0..1: how hard the band is playing. */
  energy: number;
  /** Who carries the melody. */
  voice: Lead | Keys;
  treatment: Treatment;
  /** The A that leads into B ends on the tonic instead of turning around. */
  closes: boolean;
}

export interface ChordSlot {
  /** Start in beats from the top of the track. */
  beat: number;
  dur: number;
  root: Midi;
  quality: Quality;
}

export type Ending = "tag" | "fermata" | "fade" | "runout" | "button";

export interface Band {
  keys: Keys;
  lead: Lead;
  /** A second horn that joins on the last head, in harmony. */
  second: Lead | null;
  strings: boolean;
  /** Bells over the melody in the last head. */
  color: "glock" | "marimba" | null;
}

export interface Track {
  seed: string;
  mood: Mood;
  /** 0, 1 or 2: title track, change of pace, closer. */
  n: number;
  style: Style;
  bpm: number;
  /** Where the off-8th lands, as a fraction of the beat (0.5 = straight). */
  swing: number;
  meter: 3 | 4;
  /** Tonic pitch class, 0 = C. */
  key: number;
  minor: boolean;
  bars: number;
  sections: Section[];
  chords: ChordSlot[];
  events: NoteEvent[];
  /** Beats where the picture should cut, strictly increasing. */
  hits: number[];
  ending: Ending;
  band: Band;
  /** Seconds, including the ending's ring-out. */
  lengthSec: number;
  title: string;
}

/** One night's side A. */
export interface Ep {
  seed: string;
  mood: Mood;
  tracks: Track[];
  /** Everyone on the date, in credit order. */
  lineup: Part[];
}

export function sectionAt(sections: Section[], bar: number): Section {
  const s = sections.find((x) => bar >= x.startBar && bar < x.startBar + x.bars);
  if (!s) throw new Error(`no section at bar ${bar}`);
  return s;
}

/** Everything the arrangers need to know about a track before its notes exist. */
export interface Ctx {
  mood: Mood;
  n: number;
  style: Style;
  bpm: number;
  meter: 3 | 4;
  key: number;
  minor: boolean;
  bars: number;
  sections: Section[];
  chords: ChordSlot[];
  band: Band;
  ending: Ending;
  /** Sad records think in natural minor over the tonic; the others in dorian. */
  aeolian: boolean;
}

/**
 * Stop-time: the band hits 1 and the and-of-2 together and lays out, then comes back for the
 * soloist's last two bars. Returns the beats of the hits, relative to the section.
 */
export function stopHits(sec: Section, meter: 3 | 4): number[] {
  const out: number[] = [];
  for (let b = 0; b < sec.bars - 2; b++) out.push(b * meter, b * meter + 1.5);
  return out;
}

/** Is this bar inside a stop-time chorus's laid-out stretch? */
export const stopped = (sec: Section, bar: number) => sec.treatment === "stop" && bar - sec.startBar < sec.bars - 2;
