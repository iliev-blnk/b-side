import { rng } from "../music/rng.ts";
import { count } from "./cues.ts";
import { longDay } from "../record/date.ts";
import type { Film, Sleeve } from "./film.ts";
import { H, type Piece, W } from "./stage.ts";

/**
 * The type laid over the film, all of it set on the music: the band's name over the first intro,
 * the title word by word on the tune, the players one by one, the hook's words punched in on the
 * last chorus of each act, the next title on the card between acts, and the end card.
 */

const out3 = (k: number) => 1 - (1 - Math.max(0, Math.min(1, k))) ** 3;
const clamp01 = (k: number) => Math.max(0, Math.min(1, k));
/** Jost at weight 800 runs about this wide per letter, in ems. */
const EM = 0.68;

/** Words on black strips: each word its own strip, laid down a moment before the word. */
function strip(id: string, text: string, x: number, y: number, size: number, k: number, align: "left" | "right" | "center" = "left", spacing = 0.04): Piece[] {
  if (k <= 0) return [];
  const w = text.length * size * (EM + spacing) + size * 0.5;
  const x0 = align === "left" ? x - size * 0.25 : align === "right" ? x - w + size * 0.25 : x - w / 2;
  const plate = out3(k * 1.6);
  const letters = out3(k * 1.6 - 0.35);
  const out: Piece[] = [{ id: `${id}/plate`, kind: "rect", ink: "near", x: align === "right" ? x0 + w * (1 - plate) : x0, y: y - size * 1.02, w: w * plate, h: size * 1.38, edge: 0.5 }];
  if (letters > 0) out.push({ id, kind: "text", ink: "type", text, x, y: y + (1 - letters) * size * 0.3, size, weight: 800, spacing, align });
  return out;
}

export function credits(film: Film, sleeve: Sleeve, t: number): Piece[] {
  const i = film.shotAt(t);
  const shot = film.shots[i]!;
  const n = shot.n;
  const c = film.cues[n]!;
  const track = film.ep.tracks[n]!;
  const local = t - film.starts[n]!;
  const band = film.cast.band;
  const sec = c.sections.find((s) => local >= s.t && local < s.end);
  const out: Piece[] = [];

  // the band's name over the first intro, one letter on each note of the tune or each beat
  if (n === 0 && sec?.kind === "intro") {
    const name = band.name.toUpperCase();
    const from = sec.t + 60 / c.bpm;
    const step = Math.min(0.12, (sec.end - sec.t) / 3 / name.length);
    const shown = Math.floor((local - from) / step) + 1;
    const fade = clamp01((sec.end - 0.4 - local) / 0.5);
    if (shown > 0 && fade > 0) {
      const size = name.length > 20 ? 64 : 80;
      out.push({ id: "band/plate", kind: "rect", ink: "near", alpha: fade, x: W / 2 - (name.length * size * 0.8) / 2 - 40, y: H * 0.5 - size - 10, w: name.length * size * 0.8 + 80, h: size * 1.5, edge: 0.5 });
      out.push({ id: "band", kind: "text", ink: "type", alpha: fade, text: name.slice(0, shown), x: W / 2 - (name.length * size * 0.8) / 2 + 4, y: H * 0.5 + size * 0.2, size, weight: 800, spacing: 0.12 });
    }
  }

  // the title, word by word on the first notes of the tune
  const heads = c.sections.filter((s) => s.kind === "head");
  const h1 = heads[0];
  if (h1 && local >= h1.t && local < h1.end && shot.scene !== "card") {
    const words = track.title.toUpperCase().split(" ");
    const notes = c.lead.filter((x) => x.t >= h1.t && x.t < h1.end);
    const at = words.map((_, j) => notes[Math.min(notes.length - 1, j * 2)]?.t ?? h1.t + j * 0.5);
    const off = clamp01((h1.end - 0.3 - local) / 0.4);
    const size = n === 0 ? 92 : 76;
    words.forEach((w, j) => {
      const k = Math.min(off, (local - at[j]!) / 0.35);
      out.push(...strip(`title/${j}`, w, 1150, 640 + j * size * 1.13 - (words.length - 1) * size * 0.4, size, k));
    });
  }

  // the players, one at a time, through the next head and the bridge
  if (n === 0 && heads[1] && heads[2]) {
    const from = heads[1].t;
    const to = heads[2].end;
    const each = (to - from) / band.players.length;
    const j = Math.floor((local - from) / each);
    const p = band.players[j];
    if (p && local >= from && local < to) {
      const k = (local - from - j * each) / each;
      const life = Math.min(out3(k * 6), clamp01((1 - k) * 6));
      out.push(...strip(`player/${j}/name`, p.name, 120, H - 190, 52, life));
      out.push(...strip(`player/${j}/plays`, p.plays, 120, H - 120, 30, life - 0.1));
    }
  }

  // the hook: on the last chorus, the title's words punched in on the tune
  const last = c.sections.filter((s) => s.kind === "out" && s.letter === "A").at(-1);
  if (last && local >= last.t && local < last.end) {
    const words = track.title.toUpperCase().split(" ").filter((w) => w.length > 2 || /^[0-9]/.test(w));
    const notes = c.lead.filter((x) => x.t >= last.t && x.t < last.end);
    // a new word on each note that follows a breath
    const phrases = notes.filter((x, j) => j === 0 || x.t - (notes[j - 1]!.t + notes[j - 1]!.dur) > 0.18);
    const slots: [number, number, "left" | "right" | "center"][] = [[110, 250, "left"], [W - 110, 250, "right"], [110, H - 130, "left"], [W - 110, H - 130, "right"], [W / 2, 220, "center"]];
    const j = count(phrases.map((x) => x.t), local) - 1;
    for (const q of [j - 1, j]) {
      if (q < 0) continue;
      const note = phrases[q]!;
      const word = words[q % words.length]!;
      const slot = slots[Math.floor(rng(`${track.seed}/hook/${q}`).next() * slots.length)]!;
      const size = 110 + 70 * note.vel;
      const k = (local - note.t) / 0.28;
      const fade = q === j ? 1 : clamp01(1 - (local - phrases[j]!.t) / 0.25);
      out.push(...strip(`hook/${q}`, word, slot[0], slot[1], size, Math.min(k, fade), slot[2], 0.02));
    }
  }

  // between the acts: the next title, on the card
  if (shot.scene === "card") {
    const next = film.ep.tracks[n + 1]!;
    const k = (t - shot.start) / 0.6;
    const words = next.title;
    const size = words.length > 24 ? 74 : 96;
    out.push({ id: "card/title", kind: "text", ink: "near", alpha: out3(k), text: words, x: W / 2, y: H / 2 + size * 0.3 + (1 - out3(k)) * 20, size, weight: 800, align: "center", spacing: 0.01 });
    out.push({ id: "card/band", kind: "text", ink: "near", alpha: out3(k - 0.6), text: band.name, x: W / 2, y: H / 2 + size * 0.3 + 90, size: 34, weight: 500, align: "center", spacing: 0.06 });
  }

  // the end card, after the moon has turned into the record
  if (shot.scene === "record") {
    const cutAt = film.starts[2]! + film.ep.tracks[2]!.lengthSec;
    const k = (t - cutAt - 1.2) / 0.8;
    if (k > 0) {
      const title = film.ep.tracks[0]!.title;
      out.push(...strip("end/title", title, 120, H - 250, 76, k));
      out.push(...strip("end/band", band.name, 120, H - 160, 40, k - 0.4));
      out.push(...strip("end/no", `No. ${sleeve.no}, pressed ${longDay(sleeve.day)}`, 120, H - 96, 30, k - 0.8));
    }
  }
  return out;
}
