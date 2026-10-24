import { rng } from "../music/rng.ts";
import type { Mood } from "../band/types.ts";
import { type Day, LAUNCH, recordNo } from "./date.ts";
import { type Palette, palette } from "./palette.ts";
import { tracklist } from "./title.ts";

export type SleeveLayout = "block" | "circle" | "band" | "stack";

/** Everything a date decides. The visuals and the player read only this. */
export interface Pressing {
  day: Day;
  no: number;
  /** Which generator pressed it (see VERSIONS). */
  version: number;
  mood: Mood;
  title: string;
  /** Title track first. */
  tracks: [string, string, string];
  palette: Palette;
  sleeve: SleeveLayout;
}

const MOOD_LIST: Mood[] = ["noir", "chase", "sad"];
const SLEEVES: SleeveLayout[] = ["block", "circle", "band", "stack"];

function pressV1(day: Day): Pressing {
  const r = rng(`b-side/${day}`);
  const mood = r.fork("mood").pick(MOOD_LIST);
  const tracks = tracklist(r.fork("title"), mood);
  return {
    day,
    no: recordNo(day),
    version: 1,
    mood,
    title: tracks[0],
    tracks,
    palette: palette(r.fork("palette"), mood),
    sleeve: r.fork("sleeve").pick(SLEEVES),
  };
}

/**
 * Old records never change. When the generator changes after launch, add a version with the day it
 * takes over and keep the old one, so every past date still plays exactly as it was pressed.
 */
const VERSIONS: { since: Day; press: (day: Day) => Pressing }[] = [{ since: LAUNCH, press: pressV1 }];

export function press(day: Day): Pressing {
  const v = [...VERSIONS].reverse().find((x) => day >= x.since) ?? VERSIONS[0]!;
  return v.press(day);
}
