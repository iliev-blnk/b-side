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
export function field(pal: Palette): string {
  const c = [pal.main, pal.second, pal.accent, pal.ground].find((p) => !DARK.includes(p) && p !== "bone") ?? "red";
  return PAPER[c];
}

/** Deep: many planes, haze in the distance, focus that racks, light that glows, paper you can feel. */
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
      brass: "#b8924a", wood: "#3a2418", water: mix(sky, "#000000", 0.35), snow: "#e8e6e0", paper: "#e4dccb",
      spot: "#f3e3b8", label: f, flame: "#ffb347",
    },
    glow: {
      beam: { blend: "screen", bloom: 26 },
      lit: { blend: "screen", bloom: 7 },
      farLit: { blend: "screen", bloom: 4 },
      neon: { blend: "lighter", bloom: 16 },
      light: { blend: "screen", bloom: 46 },
      moon: { blend: "source-over", bloom: 30 },
      spot: { blend: "screen", bloom: 40 },
      flame: { blend: "lighter", bloom: 22 },
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
