import type { Mood, Track } from "../band/types.ts";

/**
 * The story grammar. Each track is an act and each section of the tune a scene: the city is set up,
 * the figure is met, something they carry is seen up close, the band plays, then the search or the
 * chase or the quiet, a last look, and the night closes on the record. The same roles fall to
 * different scenes by mood and act, and no scene follows itself.
 */

export type SceneName = "skyline" | "lamp" | "walk" | "insert" | "tram" | "club" | "window" | "roof" | "bridge" | "platform" | "record" | "card";
export type Transition = "cut" | "iris" | "wipe" | "slide" | "tear";

export interface Beat {
  scene: SceneName;
  variant: string;
  into: Transition;
}

type Role = "intro" | "h1" | "h2" | "hB" | "h3" | "solo" | "oB" | "oA" | "end";
type Pick = [SceneName, string?];
type Plan = Record<Exclude<Role, "solo">, Pick> & { solo: Pick[] };

const ACTS: Record<Mood, [Plan, Plan, Plan]> = {
  noir: [
    { intro: ["skyline", "down"], h1: ["lamp"], h2: ["walk"], hB: ["insert"], h3: ["window"], solo: [["club"], ["club", "bar"]], oB: ["roof"], oA: ["walk"], end: ["skyline", "up"] },
    // the search
    { intro: ["window"], h1: ["walk"], h2: ["insert"], hB: ["bridge"], h3: ["tram"], solo: [["club", "bar"], ["club"]], oB: ["roof"], oA: ["walk"], end: ["skyline", "up"] },
    { intro: ["skyline", "down"], h1: ["platform"], h2: ["walk"], hB: ["insert"], h3: ["bridge"], solo: [["club"], ["club", "bar"]], oB: ["roof"], oA: ["walk", "away"], end: ["record"] },
  ],
  chase: [
    { intro: ["skyline", "down"], h1: ["lamp"], h2: ["walk"], hB: ["insert"], h3: ["tram"], solo: [["club"], ["club", "bar"]], oB: ["roof"], oA: ["walk", "run"], end: ["skyline", "up"] },
    // the chase
    { intro: ["skyline", "down"], h1: ["walk", "run"], h2: ["tram"], hB: ["insert"], h3: ["roof", "run"], solo: [["club"], ["club", "bar"]], oB: ["walk", "run"], oA: ["tram"], end: ["skyline", "up"] },
    { intro: ["skyline", "down"], h1: ["platform"], h2: ["walk", "run"], hB: ["insert"], h3: ["roof", "run"], solo: [["club"], ["club", "bar"]], oB: ["bridge"], oA: ["walk", "away"], end: ["record"] },
  ],
  sad: [
    { intro: ["skyline", "down"], h1: ["lamp"], h2: ["walk"], hB: ["insert"], h3: ["window"], solo: [["club"], ["club", "bar"]], oB: ["bridge"], oA: ["walk"], end: ["skyline", "up"] },
    // the quiet
    { intro: ["window"], h1: ["walk"], h2: ["platform"], hB: ["insert"], h3: ["bridge"], solo: [["club", "bar"], ["club"]], oB: ["window"], oA: ["walk"], end: ["skyline", "up"] },
    { intro: ["skyline", "down"], h1: ["platform"], h2: ["walk"], hB: ["insert"], h3: ["bridge"], solo: [["club"], ["club", "bar"]], oB: ["roof"], oA: ["walk", "away"], end: ["record"] },
  ],
};

/** Each section's role in its act: which head, which solo, which out. */
function roles(track: Track): Role[] {
  let heads = 0;
  return track.sections.map((s) => {
    if (s.kind === "intro") return "intro";
    if (s.kind === "head") {
      if (s.letter === "B") return "hB";
      heads++;
      return heads === 1 ? "h1" : heads === 2 ? "h2" : "h3";
    }
    if (s.kind === "solo") return "solo";
    if (s.kind === "out") return s.letter === "B" ? "oB" : "oA";
    return "end";
  });
}

/** How one section hands over to the next: cuts inside an act, paper at the turns of the form. */
function into(prev: Role | null, role: Role, mood: Mood, i: number): Transition {
  if (prev === null) return "iris";
  if (role === "solo" && prev !== "solo") return "wipe";
  if (role === "oB") return "tear";
  if (role === "end") return mood === "sad" ? "slide" : "cut";
  if (mood === "chase" && i % 3 === 1) return "wipe";
  return "cut";
}

export function story(track: Track, mood: Mood, act: number): Beat[] {
  const plan = ACTS[mood][act]!;
  let solos = 0;
  const rs = roles(track);
  const out = rs.map((role, i): Beat => {
    const [scene, variant = ""] = role === "solo" ? plan.solo[solos++ % plan.solo.length]! : plan[role];
    return { scene, variant, into: into(rs[i - 1] ?? null, role, mood, i) };
  });
  // the camera never cuts from a scene to the same scene and variant
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1]!;
    const b = out[i]!;
    if (a.scene === b.scene && a.variant === b.variant) b.variant = b.variant ? "" : "alt";
  }
  return out;
}
