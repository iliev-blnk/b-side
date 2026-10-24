import type { Mood, Style } from "../band/types.ts";
import { type Day, longDay, pressedDays } from "../record/date.ts";
import { type Entry, entry, type Filter, matches, STYLE_NAMES } from "./record.ts";

/**
 * The catalogue: every record on one wall, or a month at a time on a calendar, narrowed by mood,
 * style, instrument and a search. The list comes from catalogue.json, built nightly; any night
 * newer than the build is worked out here from its date.
 */

export interface CatalogueOptions {
  host: HTMLElement;
  now: Day;
  /** A sleeve that plays its record when pressed, drawn at `px` css pixels. */
  sleeve: (day: Day, px: number) => HTMLElement;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MOODS: Mood[] = ["noir", "chase", "sad"];

async function entries(now: Day): Promise<Entry[]> {
  let built: Entry[] = [];
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}catalogue.json`);
    if (res.ok) built = (await res.json()).records;
  } catch {
    // no build to read in development; work them all out
  }
  const have = new Map(built.map((e) => [e.day, e]));
  return pressedDays(now).map((d) => have.get(d) ?? entry(d));
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function select(label: string, options: [string, string][], onChange: (v: string) => void): HTMLLabelElement {
  const wrap = el("label", "pick");
  const s = el("select");
  s.setAttribute("aria-label", label);
  for (const [value, text] of [["", label] as [string, string], ...options]) {
    const o = el("option", "", text);
    o.value = value;
    s.append(o);
  }
  s.addEventListener("change", () => onChange(s.value));
  wrap.append(s);
  return wrap;
}

export async function catalogue(o: CatalogueOptions): Promise<void> {
  const { host, now } = o;
  const all = await entries(now);
  host.hidden = all.length === 0;
  if (!all.length) return;

  const filter: Filter = { q: "", mood: "", style: "", instrument: "" };
  let view: "wall" | "month" = "wall";
  let month = now.slice(0, 7);

  // ---- the controls ----
  const head = el("div", "cat-head");
  const count = el("h3");
  const search = el("input", "search");
  search.type = "search";
  search.placeholder = "Search titles, bands, players";
  search.setAttribute("aria-label", "Search the catalogue");
  search.addEventListener("input", () => {
    filter.q = search.value;
    show();
  });

  const moods = el("div", "chips");
  moods.setAttribute("role", "group");
  moods.setAttribute("aria-label", "Mood");
  const chip = (value: Mood | "", text: string) => {
    const b = el("button", "chip", text);
    b.type = "button";
    b.setAttribute("aria-pressed", String(filter.mood === value));
    b.addEventListener("click", () => {
      filter.mood = value;
      for (const c of moods.children) c.setAttribute("aria-pressed", String(c === b));
      show();
    });
    return b;
  };
  moods.append(chip("", "All"), ...MOODS.map((m) => chip(m, m)));

  const styles = [...new Set(all.flatMap((e) => e.styles))].sort();
  const instruments = [...new Set(all.flatMap((e) => e.instruments))].sort();
  const styleSel = select("Any style", styles.map((s) => [s, STYLE_NAMES[s]]), (v) => {
    filter.style = v as Style | "";
    show();
  });
  const instSel = select("Any instrument", instruments.map((i) => [i, i]), (v) => {
    filter.instrument = v;
    show();
  });

  const views = el("div", "chips views");
  views.setAttribute("role", "group");
  views.setAttribute("aria-label", "View");
  for (const [v, text] of [["wall", "Wall"], ["month", "By month"]] as const) {
    const b = el("button", "chip", text);
    b.type = "button";
    b.setAttribute("aria-pressed", String(view === v));
    b.addEventListener("click", () => {
      view = v;
      for (const c of views.children) c.setAttribute("aria-pressed", String(c === b));
      show();
    });
    views.append(b);
  }

  const controls = el("div", "controls");
  controls.append(search, moods, styleSel, instSel, views);
  head.append(count, controls);
  const body = el("div", "cat-body");
  host.replaceChildren(head, body);

  // ---- the wall: figures are made once and their sleeves drawn when they scroll into view ----
  const figures = new Map<Day, HTMLElement>();
  const io = new IntersectionObserver(
    (seen) => {
      for (const s of seen) {
        if (!s.isIntersecting) continue;
        io.unobserve(s.target);
        const fig = s.target as HTMLElement;
        const e = all.find((x) => x.day === fig.dataset.day)!;
        const cap = el("figcaption");
        const b = el("b");
        const a = el("a", "", e.title);
        a.href = `#${e.day}`;
        b.append(a);
        cap.append(b, `no. ${e.no}, ${longDay(e.day)}`);
        fig.append(o.sleeve(e.day, 220), cap);
      }
    },
    { rootMargin: "400px" },
  );
  const figure = (e: Entry) => {
    let fig = figures.get(e.day);
    if (!fig) {
      fig = el("figure");
      fig.dataset.day = e.day;
      fig.style.minHeight = "200px";
      figures.set(e.day, fig);
      io.observe(fig);
    }
    return fig;
  };

  const wall = (list: Entry[]) => {
    const grid = el("div", "grid");
    grid.id = "grid";
    grid.append(...list.map(figure));
    return grid;
  };

  // ---- the month: a calendar, Monday first, with each night's sleeve on its date ----
  const cells = new Map<Day, HTMLElement>();
  const calendar = (list: Entry[]) => {
    const months = [...new Set(all.map((e) => e.day.slice(0, 7)))].sort();
    if (!months.includes(month)) month = months.at(-1)!;
    const [y, m] = month.split("-").map(Number) as [number, number];
    const wrap = el("div", "month");
    const nav = el("div", "month-nav");
    const step = (d: number) => {
      const b = el("button", "step", d < 0 ? "←" : "→");
      b.type = "button";
      const to = months[months.indexOf(month) + d];
      b.disabled = !to;
      b.setAttribute("aria-label", d < 0 ? "Earlier month" : "Later month");
      b.addEventListener("click", () => {
        if (to) month = to;
        show();
      });
      return b;
    };
    nav.append(step(-1), el("h4", "", `${MONTHS[m - 1]} ${y}`), step(1));
    const grid = el("div", "cal");
    for (const w of WEEKDAYS) grid.append(el("span", "wd", w));
    const first = new Date(Date.UTC(y, m - 1, 1));
    const lead = (first.getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let i = 0; i < lead; i++) grid.append(el("span", "blank"));
    const shown = new Set(list.map((e) => e.day));
    for (let d = 1; d <= days; d++) {
      const day = `${month}-${String(d).padStart(2, "0")}`;
      const e = all.find((x) => x.day === day);
      let cell = cells.get(day);
      if (!cell) {
        cell = el("div", "day");
        cell.append(el("span", "date", String(d)));
        if (e) {
          cell.append(o.sleeve(day, 120));
          cell.title = `No. ${e.no}, ${e.title}`;
        }
        cells.set(day, cell);
      }
      cell.classList.toggle("empty", !e);
      cell.classList.toggle("out", !!e && !shown.has(day));
      grid.append(cell);
    }
    wrap.append(nav, grid);
    return wrap;
  };

  function show() {
    const list = all.filter((e) => matches(e, filter));
    const n = list.length;
    count.textContent = n === all.length ? `The catalogue, ${n} record${n === 1 ? "" : "s"}` : `${n} of ${all.length} records`;
    if (view === "wall") body.replaceChildren(n ? wall(list) : el("p", "none", "Nothing pressed like that yet."));
    else body.replaceChildren(calendar(list));
  }
  show();
}
