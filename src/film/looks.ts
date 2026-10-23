import { PAPER, type Palette, type Paper } from "../record/palette.ts";
import type { Look } from "./stage.ts";

/** Mixes two hex colours. */
export function mix(a: string, b: string, k: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i]! - v) * k).toString(16).padStart(2, "0")).join("")}`;
}

const DARK: Paper[] = ["ink", "night"];
/** The record's loudest colour: its field. */
function field(pal: Palette): string {
  const c = [pal.main, pal.second, pal.accent, pal.ground].find((p) => !DARK.includes(p) && p !== "bone") ?? "red";
  return PAPER[c];
}
function second(pal: Palette, not: string): string {
  const c = [pal.second, pal.accent, pal.main].find((p) => !DARK.includes(p) && PAPER[p] !== not) ?? "bone";
  return PAPER[c];
}

/** A: flat and graphic. One field of colour, black cut-outs, no depth but the parallax. */
export function flat(pal: Palette): Look {
  const f = field(pal);
  const s = second(pal, f);
  const { ink, bone } = PAPER;
  return {
    name: "flat",
    inks: {
      sky: f, cloud: mix(f, ink, 0.22), moon: bone, beam: bone, far: mix(f, ink, 0.45), farLit: mix(f, bone, 0.35),
      mid: mix(ink, f, 0.12), near: ink, street: ink, lit: s, neon: bone,
      figure: ink, back: mix(ink, f, 0.3), trim: s, light: s, shade: mix(f, ink, 0.75),
      smoke: bone, rain: bone, type: bone,
    },
    glow: {},
    haze: 0,
    blur: 0,
    shadow: { alpha: 0, blur: 0, offset: 0 },
    edge: 0.4,
    wobble: 0.7,
    grain: 0.12,
    texture: 0,
    vignette: 0,
  };
}

/** B: deep. Many planes, haze in the distance, focus that racks, light that glows, paper you can feel. */
export function deep(pal: Palette): Look {
  const f = field(pal);
  const sky = mix(PAPER.night, f, 0.1);
  const warm = "#f2c46a";
  return {
    name: "deep",
    inks: {
      sky, cloud: mix(sky, PAPER.bone, 0.1), moon: "#efe6cf", beam: "#e9dcb6", far: mix(sky, PAPER.bone, 0.14), farLit: mix(warm, sky, 0.35),
      mid: "#1b1e27", near: "#0d0e12", street: "#17181d", lit: warm, neon: mix(f, "#ffffff", 0.15),
      figure: "#121215", back: "#22232a", trim: f, light: "#f6d58c", shade: "rgba(0,0,0,0.55)",
      smoke: "#d8d3c6", rain: "#c9d2de", type: PAPER.bone,
    },
    glow: {
      beam: { blend: "screen", bloom: 26 },
      lit: { blend: "screen", bloom: 7 },
      farLit: { blend: "screen", bloom: 4 },
      neon: { blend: "lighter", bloom: 16 },
      light: { blend: "screen", bloom: 46 },
      moon: { blend: "source-over", bloom: 30 },
    },
    haze: 0.6,
    blur: 11,
    shadow: { alpha: 0.5, blur: 14, offset: 6 },
    edge: 1,
    wobble: 1.1,
    grain: 0.28,
    texture: 0.2,
    vignette: 0.45,
  };
}

/** C: hard light. Black and bone, one colour, light with a hard edge, deep focus. */
export function hard(pal: Palette): Look {
  const f = field(pal);
  const { bone } = PAPER;
  return {
    name: "hard",
    inks: {
      sky: "#0a0a0a", cloud: "#141414", moon: bone, beam: bone, far: "#1b1b1b", farLit: "#4d4a45",
      mid: "#121212", near: "#030303", street: "#101010", lit: bone, neon: f,
      figure: "#030303", back: "#121212", trim: f, light: bone, shade: "#030303",
      smoke: bone, rain: bone, type: bone,
    },
    glow: {},
    haze: 0,
    blur: 0,
    shadow: { alpha: 0.95, blur: 0, offset: 14 },
    edge: 0.7,
    wobble: 0.8,
    grain: 0.2,
    texture: 0,
    vignette: 0.7,
  };
}

export const LOOKS = { flat, deep, hard } as const;
export type LookName = keyof typeof LOOKS;
