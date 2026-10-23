import { renderOffline } from "./audio/offline.ts";
import { createMaster } from "./audio/master.ts";
import { type Playing, schedule } from "./audio/play.ts";
import { loadPack, type Pack } from "./audio/samples.ts";
import { generate } from "./music/score.ts";
import { noteName } from "./music/theory.ts";
import type { Mood } from "./music/types.ts";

const BASE = `${import.meta.env.BASE_URL}samples/`;
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const seedInput = $<HTMLInputElement>("#seed");
const info = $<HTMLParagraphElement>("#info");

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Chisinau" }).format(new Date());
seedInput.value = today();

let ctx: AudioContext | null = null;
let pack: Promise<Pack> | null = null;
let current: Playing | null = null;
let token = 0;
// __playing counts live schedules, so a test can catch two plays stacking up
const w = window as unknown as { __playing: number; __render: typeof renderOffline };
w.__playing = 0;
w.__render = renderOffline;

function stop() {
  if (current) {
    current.stop();
    current = null;
    w.__playing--;
  }
  document.querySelectorAll("button[data-mood]").forEach((b) => b.removeAttribute("aria-pressed"));
}

async function play(mood: Mood, button: HTMLElement) {
  const mine = ++token;
  stop();
  ctx ??= new AudioContext();
  await ctx.resume();
  pack ??= loadPack(ctx, BASE);
  info.textContent = "loading samples…";
  const p = await pack;
  // a newer click won while we were loading
  if (mine !== token) return;
  const score = generate(seedInput.value.trim() || today(), mood);
  const master = createMaster(ctx, mood);
  master.output.connect(ctx.destination);
  current = schedule(ctx, p, score, ctx.currentTime + 0.1, master);
  w.__playing++;
  button.setAttribute("aria-pressed", "true");
  const key = noteName(score.key + 60).replace(/-?\d+$/, "");
  info.textContent = `${mood} · ${score.bpm} bpm · ${key} minor · ${score.band.keys} + ${score.band.lead ?? "no lead"} · ${Math.round(score.lengthSec)} s`;
}

document.querySelectorAll<HTMLButtonElement>("button[data-mood]").forEach((b) => {
  b.addEventListener("click", () => void play(b.dataset.mood as Mood, b));
});
$("#stop").addEventListener("click", () => {
  token++;
  stop();
  info.textContent = "";
});
$("#next").addEventListener("click", () => {
  const d = new Date(`${seedInput.value}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return;
  d.setUTCDate(d.getUTCDate() + 1);
  seedInput.value = d.toISOString().slice(0, 10);
});
