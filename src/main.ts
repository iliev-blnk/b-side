import "@fontsource-variable/jost";
import { createMaster } from "./audio/master.ts";
import { renderOffline, renderTrack } from "./audio/offline.ts";
import { type Playing, schedule } from "./audio/play.ts";
import { loadPack, type Pack } from "./audio/samples.ts";
import { type Day, isDay, isPressed, longDay, pressedDays, today } from "./record/date.ts";
import { PAPER } from "./record/palette.ts";
import { press, type Pressing } from "./record/press.ts";
import { Episode } from "./visual/episode.ts";
import { FONT, type Sheet } from "./visual/paper.ts";
import { drawSleeve } from "./visual/sleeve.ts";
import { generateEp } from "./band/ep.ts";
import type { Mood } from "./band/types.ts";
import { rng } from "./music/rng.ts";
import { palette } from "./record/palette.ts";
import { deep } from "./film/looks.ts";
import { onTwos } from "./film/stage.ts";
import { draw as drawFilm, type Film, film as makeFilm } from "./film/film.ts";
import { recordNo } from "./record/date.ts";

const BASE = `${import.meta.env.BASE_URL}samples/`;
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const now = today();

const KEYS: Record<string, string> = { piano: "piano", keys: "electric piano", sax: "tenor saxophone", vibes: "vibraphone", harmonica: "harmonica" };
const fonts = Promise.all(["800", "600", "500", "400"].map((w) => document.fonts.load(`${w} 100px ${FONT}`)));

function sleeveButton(p: Pressing, px: number): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "sleeve";
  b.setAttribute("aria-label", `Play no. ${p.no}, ${p.title}`);
  b.style.setProperty("--label", PAPER[p.palette.main]);
  const disc = document.createElement("span");
  disc.className = "disc";
  const c = document.createElement("canvas");
  const size = Math.round(px * Math.min(devicePixelRatio || 1, 2));
  c.width = size;
  c.height = size;
  b.append(disc, c);
  void fonts.then(() => drawSleeve(c.getContext("2d")!, size, p));
  b.addEventListener("click", () => void play(p));
  return b;
}

function featured(day: Day) {
  const host = $("#today");
  host.replaceChildren();
  host.className = "";
  if (!isPressed(day, now)) {
    const p = document.createElement("p");
    p.className = "missing";
    p.textContent = day < now ? "No record was pressed that night. The first one came out on 23 oct 2026." : "Not pressed yet. Come back that night.";
    host.append(p);
    return;
  }
  const p = press(day);
  host.className = "today";
  const meta = document.createElement("div");
  meta.className = "meta";
  const lead = p.score.band.lead ? ` and ${KEYS[p.score.band.lead]}` : "";
  meta.innerHTML = `<h2></h2><p></p><p class="band"></p>`;
  meta.querySelector("h2")!.textContent = p.title;
  meta.querySelectorAll("p")[0]!.textContent = `No. ${p.no}, pressed ${longDay(p.day)}${day === now ? ", tonight" : ""}.`;
  meta.querySelectorAll("p")[1]!.textContent = `${p.mood}, ${p.score.bpm} bpm, ${KEYS[p.score.band.keys]}${lead}. ${Math.round(p.score.lengthSec)} seconds.`;
  const btn = document.createElement("button");
  btn.className = "play";
  btn.textContent = "Play";
  btn.addEventListener("click", () => void play(p));
  meta.append(btn);
  host.append(sleeveButton(p, 560), meta);
}

function shelf(featuredDay: Day) {
  const days = pressedDays(now).filter((d) => d !== featuredDay);
  $("#shelf").hidden = days.length === 0;
  const grid = $("#grid");
  grid.replaceChildren();
  // sleeves are drawn when they scroll into view
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const fig = e.target as HTMLElement;
      const p = press(fig.dataset.day!);
      const cap = document.createElement("figcaption");
      cap.innerHTML = `<b><a href="#${p.day}"></a></b>`;
      cap.querySelector("a")!.textContent = p.title;
      cap.append(`no. ${p.no}, ${longDay(p.day)}`);
      fig.append(sleeveButton(p, 220), cap);
    }
  }, { rootMargin: "400px" });
  for (const d of days) {
    const fig = document.createElement("figure");
    fig.dataset.day = d;
    fig.style.minHeight = "200px";
    grid.append(fig);
    io.observe(fig);
  }
}

// ---- the player ----

let ctx: AudioContext | null = null;
let pack: Promise<Pack> | null = null;
let current: { playing: Playing | null; raf: number } | null = null;
let token = 0;
const w = window as unknown as {
  __playing: number;
  __render: typeof renderOffline;
  __renderTrack: typeof renderTrack;
  __still: (day: Day, t: number, width: number, height: number) => Promise<string>;
  __sleeve: (day: Day, size: number) => Promise<string>;
  __cuts: (day: Day) => { start: number; kind: string; comp: string }[];
  __film: (day: Day, mood: Mood, t: number, width: number, height: number) => Promise<string>;
  __filmInfo: (day: Day, mood: Mood) => unknown;
};
// __playing counts live schedules, so a test can catch two records playing at once
w.__playing = 0;
const player = $("#player");

function stop() {
  token++;
  if (current) {
    cancelAnimationFrame(current.raf);
    if (current.playing) {
      current.playing.stop();
      w.__playing--;
    }
    current = null;
  }
  player.classList.remove("on");
  player.querySelectorAll(":scope > :not(.close)").forEach((n) => n.remove());
  document.body.style.overflow = "";
}

async function play(p: Pressing) {
  stop();
  const mine = token;
  player.classList.add("on");
  document.body.style.overflow = "hidden";
  const wait = document.createElement("div");
  wait.className = "wait";
  wait.textContent = "putting the needle down";
  player.append(wait);
  current = { playing: null, raf: 0 };
  ctx ??= new AudioContext();
  await ctx.resume();
  pack ??= loadPack(ctx, BASE);
  const [loaded] = await Promise.all([pack, fonts]);
  // closed, or another record was picked, while the samples loaded
  if (mine !== token) return;
  wait.remove();

  const master = createMaster(ctx, p.mood);
  master.output.connect(ctx.destination);
  const at = ctx.currentTime + 0.15;
  current.playing = schedule(ctx, loaded, p.score, at, master);
  w.__playing++;
  const ep = new Episode(p);

  if (reduced.matches) {
    const still = document.createElement("div");
    still.className = "still";
    const c = document.createElement("canvas");
    c.width = c.height = 1000;
    drawSleeve(c.getContext("2d")!, 1000, p);
    still.append(c);
    player.append(still);
  } else {
    const c = document.createElement("canvas");
    player.append(c);
    const g = c.getContext("2d")!;
    let last = "";
    const loop = () => {
      if (mine !== token) return;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const W = Math.round(c.clientWidth * dpr);
      const H = Math.round(c.clientHeight * dpr);
      if (c.width !== W || c.height !== H) {
        c.width = W;
        c.height = H;
      }
      const t = Math.max(0, ctx!.currentTime - at - (ctx!.outputLatency || 0));
      // paper moves on twos: only redraw when the frame or the shot changes
      const key = `${Math.floor(t * 12)}/${ep.shotAt(t).start}/${W}x${H}`;
      if (key !== last) {
        last = key;
        const sheet: Sheet = { ctx: g, w: W, h: H, u: Math.min(W, H) };
        ep.draw(sheet, Math.min(t, ep.length - 0.001));
      }
      current!.raf = requestAnimationFrame(loop);
    };
    current.raf = requestAnimationFrame(loop);
  }
  const ends = (ep.length + 0.2) * 1000;
  setTimeout(() => {
    if (mine === token) stop();
  }, ends);
}

$("#close").addEventListener("click", stop);
addEventListener("keydown", (e) => {
  if (e.key === "Escape") stop();
});

// ---- hooks for scripts (stills, renders, smoke test) ----

w.__render = renderOffline;
w.__renderTrack = renderTrack;
w.__still = async (day, t, width, height) => {
  await fonts;
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  new Episode(press(day)).draw({ ctx: c.getContext("2d")!, w: width, h: height, u: Math.min(width, height) }, t);
  return c.toDataURL("image/png");
};
w.__sleeve = async (day, size) => {
  await fonts;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  drawSleeve(c.getContext("2d")!, size, press(day));
  return c.toDataURL("image/png");
};
w.__cuts = (day) => new Episode(press(day)).cuts.map(({ start, kind, comp }) => ({ start, kind, comp }));

const films = new Map<string, Film>();
function filmOf(day: Day, mood: Mood): Film {
  const key = `${day}/${mood}`;
  if (!films.has(key)) films.set(key, makeFilm(generateEp(day, mood), { no: recordNo(day), day }));
  return films.get(key)!;
}
let filmCanvas: HTMLCanvasElement | null = null;
w.__film = async (day, mood, t, width, height) => {
  await fonts;
  filmCanvas ??= document.createElement("canvas");
  const c = filmCanvas;
  c.width = width;
  c.height = height;
  const f = filmOf(day, mood);
  const pal = palette(rng(`b-side/${day}`).fork("palette"), mood);
  drawFilm(c.getContext("2d")!, f.at(onTwos(t)), deep(pal), Math.floor(onTwos(t) * 12));
  return c.toDataURL("image/jpeg", 0.9);
};
w.__filmInfo = (day, mood) => {
  const f = filmOf(day, mood);
  return {
    length: f.length,
    titles: f.ep.tracks.map((t) => t.title),
    band: f.cast.band,
    prop: f.cast.prop,
    weather: f.cast.weather,
    shots: f.shots.map(({ scene, variant, into, n, start, end }) => ({ scene, variant, into, n, start, end })),
  };
};

function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  const day = isDay(h) ? h : now;
  featured(day);
  shelf(day);
}
addEventListener("hashchange", () => {
  stop();
  route();
  scrollTo(0, 0);
});
route();
