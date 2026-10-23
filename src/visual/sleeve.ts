import { dottedDay } from "../record/date.ts";
import { contrast, type Paper } from "../record/palette.ts";
import type { Pressing } from "../record/press.ts";
import { draw, finish, type Frame, ground, measure, type Shape, type Sheet } from "./paper.ts";

const LIGHT: Paper[] = ["bone", "yellow", "orange"];
/** Ink on light paper, bone on dark. */
const on = (bg: Paper): Paper => (LIGHT.includes(bg) ? "ink" : "bone");
const DARK = (c: Paper) => c === "ink" || c === "night";

/** The small print: label, number, tracklist, pressing date. */
function smallPrint(p: Pressing, x: number, y: number, size: number, color: Paper, id: string): Shape[] {
  const rows = ["side a", ...p.tracks.map((t) => t.toLowerCase()), "", `pressed ${dottedDay(p.day)}`];
  return rows.map((text, i): Shape => ({ id: `${id}${i}`, kind: "text", color, text, x, y: y + i * size * 1.3, size, weight: i === 0 ? 600 : 400, flat: true }));
}

function mark(p: Pressing, S: number, color: Paper): Shape[] {
  return [
    { id: "mark", kind: "text", color, text: "b-side", x: S * 0.06, y: S * 0.09, size: S * 0.034, weight: 700, flat: true },
    { id: "markno", kind: "text", color, text: `no. ${p.no}`, x: S * 0.94, y: S * 0.09, size: S * 0.034, weight: 500, align: "right", flat: true },
  ];
}

const words = (p: Pressing) => p.title.toUpperCase().split(" ");

/** Top half dark with the first word cropped at the edge; bottom block with the small print and the last word cut off. */
function block(sheet: Sheet, p: Pressing): Shape[] {
  const S = sheet.w;
  const pal = p.palette;
  const top: Paper = DARK(pal.ground) ? pal.ground : "ink";
  const bottom: Paper = pal.second !== top ? pal.second : pal.main;
  const ws = words(p);
  const first = ws[0]!;
  const lastWord = ws.length > 1 ? ws[ws.length - 1]! : first;
  const bigColor: Paper = on(top);
  const lowColor: Paper = pal.accent !== bottom ? pal.accent : pal.main !== bottom ? pal.main : on(bottom);
  // first word large enough to run off the right edge
  const size = Math.max(S * 0.3, Math.min(S * 0.42, ((S * 1.05) / measure(sheet.ctx, first, 100)) * 100));
  return [
    { id: "top", kind: "rect", color: top, x: -4, y: -4, w: S + 8, h: S * 0.52 + 4, flat: true },
    { id: "bottom", kind: "rect", color: bottom, x: -4, y: S * 0.5, w: S + 8, h: S * 0.54 },
    ...mark(p, S, on(top)),
    { id: "first", kind: "text", color: bigColor, text: first, x: S * 0.06, y: S * 0.47, size },
    ...smallPrint(p, S * 0.06, S * 0.6, S * 0.032, on(bottom), "sp"),
    { id: "last", kind: "text", color: lowColor, text: lastWord, x: S * 0.22, y: S * 1.08, size: S * 0.32 },
  ];
}

/** A big disc with the title stacked over it. */
function circle(sheet: Sheet, p: Pressing): Shape[] {
  const S = sheet.w;
  const pal = p.palette;
  const disc: Paper = pal.main;
  const ws = words(p);
  const size = Math.min(S * 0.2, (S * 0.6) / (ws.length * 0.9), ...ws.map((w) => ((S * 0.88) / measure(sheet.ctx, w, 100)) * 100));
  const typeColor: Paper = on(pal.ground) !== disc ? on(pal.ground) : pal.accent;
  // centred a little high so a long stack still clears the label at the bottom
  const top = S * 0.46 - ((ws.length - 1) * size * 0.9) / 2 + size * 0.36;
  return [
    { id: "disc", kind: "circle", color: disc, x: S * 0.62, y: S * 0.44, r: S * 0.36 },
    { id: "dot", kind: "circle", color: pal.accent, x: S * 0.2, y: S * 0.8, r: S * 0.05 },
    ...mark(p, S, on(pal.ground)),
    ...ws.map((w, i): Shape => ({ id: `w${i}`, kind: "text", color: typeColor, text: w, x: S * 0.06, y: top + i * size * 0.9, size })),
    { id: "label", kind: "rect", color: pal.second, x: S * 0.56, y: S * 0.84, w: S * 0.44, h: S * 0.2 },
    { id: "pressed", kind: "text", color: on(pal.second), text: `pressed ${dottedDay(p.day)}`, x: S * 0.6, y: S * 0.93, size: S * 0.03, weight: 500, flat: true },
  ];
}

/** A slanted band of colour carrying the title, on one line or two. */
function band(sheet: Sheet, p: Pressing): Shape[] {
  const S = sheet.w;
  const pal = p.palette;
  const tilt = -0.32;
  const bh = S * 0.32;
  const ws = words(p);
  const lines = ws.length > 2 && p.title.length > 14 ? [ws.slice(0, Math.ceil(ws.length / 2)).join(" "), ws.slice(Math.ceil(ws.length / 2)).join(" ")] : [ws.join(" ")];
  const widest = Math.max(...lines.map((l) => measure(sheet.ctx, l, 100)));
  const size = Math.min((bh * 0.62) / lines.length / 0.8, ((S * 0.86) / widest) * 100);
  const cy = S * 0.46;
  const dy = Math.tan(-tilt) * S;
  const lead = size * 0.9;
  const along = (k: number): [number, number] => [S * 0.5 - Math.sin(tilt) * k, cy + Math.cos(tilt) * k];
  return [
    { id: "band", kind: "poly", color: pal.main, pts: [[-10, cy + dy / 2 - bh / 2], [S + 10, cy - dy / 2 - bh / 2], [S + 10, cy - dy / 2 + bh / 2], [-10, cy + dy / 2 + bh / 2]] },
    { id: "thin", kind: "poly", color: pal.accent, pts: [[-10, cy + dy / 2 + bh / 2 + S * 0.03], [S + 10, cy - dy / 2 + bh / 2 + S * 0.03], [S + 10, cy - dy / 2 + bh / 2 + S * 0.05], [-10, cy + dy / 2 + bh / 2 + S * 0.05]] },
    ...mark(p, S, on(pal.ground)),
    ...lines.map((l, i): Shape => {
      const [x, y] = along((i - (lines.length - 1) / 2) * lead + size * 0.34);
      return { id: `title${i}`, kind: "text", color: on(pal.main), text: l, x, y, size, align: "center", rot: tilt };
    }),
    ...smallPrint(p, S * 0.06, S * 0.885, S * 0.028, on(pal.ground), "sp").slice(1, 4),
    { id: "pressed", kind: "text", color: on(pal.ground), text: `pressed ${dottedDay(p.day)}`, x: S * 0.94, y: S * 0.94, size: S * 0.028, weight: 500, align: "right", flat: true },
  ];
}

/** Every word on its own line, each cropped by the right edge. */
function stack(sheet: Sheet, p: Pressing): Shape[] {
  const S = sheet.w;
  const pal = p.palette;
  const ws = words(p);
  // only colours that read against the ground; dark green on ink is a shadow, not a word
  const readable = [pal.type, pal.main, pal.accent, pal.second].filter((c) => contrast(c, pal.ground) >= 2.5);
  const colors: Paper[] = readable.length ? readable : [on(pal.ground)];
  const size = Math.min(S * 0.3, (S * 0.66) / Math.max(ws.length, 2) / 0.86, ...ws.map((w, i) => ((S * (0.88 - (i % 2) * 0.12)) / measure(sheet.ctx, w, 100)) * 100));
  const top = S * 0.14 + size * 0.78;
  return [
    ...mark(p, S, on(pal.ground)),
    ...ws.map((w, i): Shape => ({ id: `w${i}`, kind: "text", color: colors[i % colors.length]!, text: w, x: S * (0.06 + (i % 2) * 0.12), y: top + i * size * 0.86, size })),
    { id: "label", kind: "rect", color: pal.second !== pal.ground ? pal.second : pal.main, x: S * 0.06, y: S * 0.84, w: S * 0.5, h: S * 0.1 },
    { id: "pressed", kind: "text", color: on(pal.second !== pal.ground ? pal.second : pal.main), text: `pressed ${dottedDay(p.day)}`, x: S * 0.09, y: S * 0.9, size: S * 0.03, weight: 500, flat: true },
  ];
}

const LAYOUTS = { block, circle, band, stack };

/** Draws a record's sleeve on a square canvas. */
export function drawSleeve(ctx: CanvasRenderingContext2D, size: number, p: Pressing) {
  const sheet: Sheet = { ctx, w: size, h: size, u: size };
  const frame: Frame = { twos: 0, light: -1 };
  ground(sheet, p.palette.ground);
  draw(sheet, LAYOUTS[p.sleeve](sheet, p), frame);
  finish(sheet, frame, 0.8);
}
