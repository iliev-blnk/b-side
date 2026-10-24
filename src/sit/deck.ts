import { cutSeconds, LEAD } from "../band/side.ts";
import { draw as drawFilm, type Film } from "../film/film.ts";
import type { Look } from "../film/stage.ts";
import { onTwos, twos } from "../film/stage.ts";
import { KEYS, PADS } from "./pads.ts";
import type { Session } from "./session.ts";
import { encodeTake, type Knob, KNOB_HOME } from "./take.ts";

/**
 * The player's face: the film, and under it the deck. A timeline of the three acts to pick the
 * side up anywhere, nine pads (or A to L) to sit in with the band, two knobs, and the take.
 */

export interface DeckOptions {
  host: HTMLElement;
  session: Session;
  film: Film;
  look: Look;
  /** A still for people who'd rather not have motion, in place of the film. */
  still: HTMLCanvasElement | null;
  /** The link the take is shared on, given the take's text. */
  link: (take: string) => string;
  onEnd: () => void;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function deck(o: DeckOptions): () => void {
  const { host, session, film } = o;
  const ctx = session.ctx;
  const length = film.length;
  let alive = true;
  let paused = false;
  let ended = false;
  let scrub: number | null = null;

  // the picture
  const screen = el("div", "screen");
  let canvas: HTMLCanvasElement | null = null;
  if (o.still) screen.append(o.still);
  else {
    canvas = el("canvas", "film");
    canvas.setAttribute("aria-hidden", "true");
    screen.append(canvas);
  }

  // the timeline: three acts, as long as their cuts on the side
  const bar = el("div", "timeline");
  bar.tabIndex = 0;
  bar.setAttribute("role", "slider");
  bar.setAttribute("aria-label", "Where the needle is on the side");
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", String(Math.round(length)));
  film.ep.tracks.forEach((t, n) => {
    const act = el("div", "act");
    act.style.flexGrow = String(cutSeconds(t));
    act.append(el("span", "n", String(n + 1)), el("span", "title", t.title));
    bar.append(act);
  });
  const head = el("div", "head");
  bar.append(head);
  const time = el("span", "time", "0:00");

  // play, pause, again
  const toggle = el("button", "toggle");
  toggle.type = "button";

  // the pads
  const pads = el("div", "pads");
  pads.setAttribute("role", "group");
  pads.setAttribute("aria-label", "Sit in with the band: keys A to L");
  const buttons = Array.from({ length: PADS }, (_, i) => {
    const b = el("button", "pad");
    b.type = "button";
    b.setAttribute("aria-label", `Note ${i + 1} of ${PADS}`);
    b.append(el("kbd", "", KEYS[i]!.toUpperCase()));
    pads.append(b);
    return b;
  });

  // the knobs
  const knobs = el("div", "knobs");
  const inputs = {} as Record<Knob, HTMLInputElement>;
  const dials = {} as Record<Knob, HTMLElement>;
  function showKnob(knob: Knob) {
    const v = session.knobs[knob];
    inputs[knob].value = String(v);
    dials[knob].style.setProperty("--v", String(v / 20));
  }
  for (const [knob, label] of [["intensity", "band"], ["room", "room"]] as [Knob, string][]) {
    const wrap = el("label", "knob");
    const dial = el("span", "dial");
    const input = el("input");
    input.type = "range";
    input.min = "0";
    input.max = "20";
    input.value = String(session.knobs[knob]);
    input.setAttribute("aria-label", knob === "intensity" ? "Band: thinner to fuller" : "Room: dry to smoky");
    input.addEventListener("input", () => {
      session.set(knob, Number(input.value));
      showKnob(knob);
      takeChanged();
    });
    wrap.append(dial, input, el("span", "name", label));
    knobs.append(wrap);
    inputs[knob] = input;
    dials[knob] = dial;
    showKnob(knob);
  }
  session.onKnob = showKnob;

  // the take
  const take = el("div", "take");
  const count = el("span", "count");
  const copy = el("button", "copy", "Copy link");
  copy.type = "button";
  const clear = el("button", "clear", "Clear");
  clear.type = "button";
  take.append(count, copy, clear);
  const takeChanged = () => {
    const n = session.take.notes.length;
    count.textContent = n ? `Your take: ${n} note${n === 1 ? "" : "s"}` : "Sit in: A to L, or the pads";
    copy.hidden = clear.hidden = n === 0 && session.take.moves.length === 0;
    copy.textContent = "Copy link";
  };
  takeChanged();
  copy.addEventListener("click", async () => {
    const url = o.link(encodeTake(session.take));
    history.replaceState(null, "", url);
    try {
      await navigator.clipboard.writeText(url);
      copy.textContent = "Copied";
    } catch {
      copy.textContent = "Link in the address bar";
    }
  });
  clear.addEventListener("click", () => {
    session.clear();
    for (const k of Object.keys(inputs) as Knob[]) {
      session.set(k, KNOB_HOME, false);
      showKnob(k);
    }
    history.replaceState(null, "", o.link(""));
    takeChanged();
  });

  const row = el("div", "row");
  row.append(toggle, pads, knobs);
  const top = el("div", "top");
  top.append(bar, time);
  const deckEl = el("div", "deck");
  deckEl.append(top, row, take);
  host.append(screen, deckEl);

  // ---- playing ----

  const showToggle = () => {
    toggle.textContent = ended ? "Again" : paused ? "Play" : "Pause";
    toggle.dataset.state = ended ? "ended" : paused ? "paused" : "playing";
  };
  showToggle();
  const go = (t: number) => {
    ended = false;
    session.start(t);
    showToggle();
  };
  toggle.addEventListener("click", async () => {
    if (ended) {
      if (paused) await ctx.resume();
      paused = false;
      go(0);
    } else if (paused) {
      await ctx.resume();
      paused = false;
    } else {
      await ctx.suspend();
      paused = true;
    }
    showToggle();
  });

  // scrubbing: drag along the acts, the picture follows; the band picks up where it's let go
  const timeAt = (x: number) => {
    const r = bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (x - r.left) / r.width)) * length;
  };
  bar.addEventListener("pointerdown", (e) => {
    bar.setPointerCapture(e.pointerId);
    scrub = timeAt(e.clientX);
  });
  bar.addEventListener("pointermove", (e) => {
    if (scrub !== null) scrub = timeAt(e.clientX);
  });
  const letGo = () => {
    if (scrub === null) return;
    const t = scrub;
    scrub = null;
    go(t);
  };
  bar.addEventListener("pointerup", letGo);
  bar.addEventListener("pointercancel", letGo);
  bar.addEventListener("keydown", (e) => {
    const t = session.time();
    const to = e.key === "ArrowRight" ? t + 5 : e.key === "ArrowLeft" ? t - 5 : e.key === "Home" ? 0 : e.key === "End" ? length - 8 : null;
    if (to === null) return;
    e.preventDefault();
    go(Math.max(0, to));
  });

  // sitting in
  const held = new Map<number, { release(at: number): void } | null>();
  const down = (i: number) => {
    if (held.has(i) || paused || ended) return;
    const s = session.press(i);
    held.set(i, s);
    buttons[i]!.classList.add(s ? "on" : "miss");
    if (s) takeChanged();
  };
  const up = (i: number) => {
    const s = held.get(i);
    held.delete(i);
    s?.release(0);
    buttons[i]!.classList.remove("on", "miss");
  };
  buttons.forEach((b, i) => {
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      down(i);
    });
    b.addEventListener("pointerup", () => up(i));
    b.addEventListener("pointercancel", () => up(i));
    b.addEventListener("lostpointercapture", () => up(i));
  });
  const keydown = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const i = KEYS.indexOf(e.key.toLowerCase());
    if (i >= 0) {
      e.preventDefault();
      if (!e.repeat) down(i);
    } else if (e.key === " " && document.activeElement?.tagName !== "BUTTON") {
      e.preventDefault();
      toggle.click();
    }
  };
  const keyup = (e: KeyboardEvent) => {
    const i = KEYS.indexOf(e.key.toLowerCase());
    if (i >= 0) up(i);
  };
  addEventListener("keydown", keydown);
  addEventListener("keyup", keyup);
  const blur = () => [...held.keys()].forEach(up);
  addEventListener("blur", blur);

  // the band is scheduled on a timer, so it keeps going when the tab is in the background
  const timer = setInterval(() => {
    if (!alive || paused || ended) return;
    session.tick();
    if (session.time() >= length) {
      ended = true;
      showToggle();
      o.onEnd();
    }
  }, 100);

  // the picture moves on twos: only redraw when the frame changes
  let raf = 0;
  let last = "";
  const g = canvas?.getContext("2d") ?? null;
  const loop = () => {
    if (!alive) return;
    const t = Math.max(0, Math.min(length - 0.001, scrub ?? session.time()));
    const pct = `${(t / length) * 100}%`;
    head.style.left = pct;
    const text = clock(t);
    if (time.textContent !== text) {
      time.textContent = text;
      const n = film.starts.filter((s) => s - LEAD <= t).length - 1;
      bar.setAttribute("aria-valuenow", String(Math.round(t)));
      bar.setAttribute("aria-valuetext", `${text}, ${film.ep.tracks[Math.max(0, n)]!.title}`);
    }
    if (canvas && g) {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = Math.min(1600, Math.round(Math.min(r.width, (r.height * 16) / 9) * dpr));
      const h = Math.round((w * 9) / 16);
      const key = `${twos(t)}/${w}`;
      if (key !== last) {
        last = key;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        drawFilm(g, film.at(onTwos(t)), o.look, twos(t));
      }
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    clearInterval(timer);
    removeEventListener("keydown", keydown);
    removeEventListener("keyup", keyup);
    removeEventListener("blur", blur);
    if (paused) void ctx.resume();
    session.stop();
    screen.remove();
    deckEl.remove();
  };
}
