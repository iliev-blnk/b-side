import "@fontsource-variable/jost";
import { renderOffline, renderTrack } from "./audio/offline.ts";
import { partsOf } from "./audio/perform.ts";
import { extendPack, loadPack, type Pack } from "./audio/samples.ts";
import { generateEp } from "./band/ep.ts";
import type { Mood } from "./band/types.ts";
import { draw as drawFilm, type Film, film as makeFilm } from "./film/film.ts";
import { deep } from "./film/looks.ts";
import { onTwos } from "./film/stage.ts";
import { rng } from "./music/rng.ts";
import { type Day, isDay, isPressed, longDay, pressedDays, recordNo, today } from "./record/date.ts";
import { PAPER, palette } from "./record/palette.ts";
import { press, type Pressing } from "./record/press.ts";
import { deck } from "./sit/deck.ts";
import { Session } from "./sit/session.ts";
import { decodeTake, emptyTake, type Take } from "./sit/take.ts";
import { Episode } from "./visual/episode.ts";
import { FONT } from "./visual/paper.ts";
import { drawSleeve } from "./visual/sleeve.ts";

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

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

function featured(day: Day, take: Take | null) {
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
  const f = filmOf(day, p.mood);
  host.className = "today";
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.innerHTML = `<h2></h2><p></p><ol class="tracks"></ol><p class="band"></p>`;
  meta.querySelector("h2")!.textContent = p.title;
  meta.querySelectorAll("p")[0]!.textContent = `No. ${p.no}, pressed ${longDay(p.day)}${day === now ? ", tonight" : ""}. Side A, ${p.mood}, ${clock(f.length)}.`;
  const ol = meta.querySelector("ol")!;
  for (const t of f.ep.tracks) {
    const li = document.createElement("li");
    const len = document.createElement("span");
    len.textContent = clock(t.lengthSec);
    li.append(t.title, len);
    ol.append(li);
  }
  meta.querySelectorAll("p")[1]!.textContent = `${f.cast.band.name}: ${f.cast.band.players.map((x) => x.plays).join(", ")}.`;
  if (take && take.notes.length) {
    const sat = document.createElement("p");
    sat.className = "sat";
    sat.textContent = `Someone sat in on this one: ${take.notes.length} note${take.notes.length === 1 ? "" : "s"}. They play back over the record.`;
    meta.append(sat);
  }
  const btn = document.createElement("button");
  btn.className = "play";
  btn.textContent = take ? "Play the take" : "Play";
  btn.addEventListener("click", () => void play(p, take ?? emptyTake()));
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
let pack: Pack | null = null;
let close: (() => void) | null = null;
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
  __side: Session | null;
};
// __playing counts live sides, so a test can catch two records playing at once
w.__playing = 0;
w.__side = null;
const player = $("#player");

function stop() {
  token++;
  if (close) {
    close();
    close = null;
    w.__playing--;
    w.__side = null;
  }
  player.classList.remove("on");
  player.querySelectorAll(":scope > :not(.close)").forEach((n) => n.remove());
  document.body.style.overflow = "";
}

const looks = (day: Day, mood: Mood) => deep(palette(rng(`b-side/${day}`).fork("palette"), mood));
const linkTo = (day: Day, take: string) => `${location.pathname}${location.search}#${day}${take ? `/take=${take}` : ""}`;

async function play(p: Pressing, take: Take = emptyTake()) {
  stop();
  const mine = token;
  player.classList.add("on");
  document.body.style.overflow = "hidden";
  const wait = document.createElement("div");
  wait.className = "wait";
  wait.textContent = "putting the needle down";
  player.append(wait);
  ctx ??= new AudioContext({ latencyHint: "interactive" });
  await ctx.resume();
  const f = filmOf(p.day, p.mood);
  const parts = [...new Set(f.ep.tracks.flatMap(partsOf))];
  if (pack) await extendPack(ctx, BASE, pack, parts);
  else pack = await loadPack(ctx, BASE, parts);
  await fonts;
  // closed, or another record was picked, while the samples loaded
  if (mine !== token) return;
  wait.remove();

  let still: HTMLCanvasElement | null = null;
  if (reduced.matches) {
    still = document.createElement("canvas");
    still.className = "still";
    still.width = still.height = 1000;
    drawSleeve(still.getContext("2d")!, 1000, p);
  }
  const session = new Session(ctx, pack, f, take, ctx.destination);
  close = deck({ host: player, session, film: f, look: looks(p.day, p.mood), still, link: (t) => linkTo(p.day, t), onEnd: () => {} });
  w.__playing++;
  w.__side = session;
  session.start(0);
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

/** `#2026-10-23`, or `#2026-10-23/take=…` for a night with someone's take on it. */
function parse(): { day: Day; take: Take | null } {
  const [d = "", rest = ""] = decodeURIComponent(location.hash.slice(1)).split("/");
  const day = isDay(d) ? d : now;
  const take = rest.startsWith("take=") ? decodeTake(rest.slice(5)) : null;
  return { day, take };
}

function route() {
  const { day, take } = parse();
  featured(day, take);
  shelf(day);
}
addEventListener("hashchange", () => {
  stop();
  route();
  scrollTo(0, 0);
});
route();
