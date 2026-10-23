import type { Rng } from "../music/rng.ts";
import { type Ctx, type Drum, type NoteEvent, type Section, stopHits, stopped } from "./types.ts";

type Hit = (part: Drum, beat: number, vel: number, variant?: string, dur?: number) => void;

/** Boom-bap kick patterns, in beats. */
const KICKS = [
  [0, 1.75, 2.5],
  [0, 0.75, 2.5],
  [0, 2.25, 2.75],
  [0, 1.5, 2.5, 3.25],
  [0, 2.5],
];

/**
 * The drummer. Each style has its own kit and time: boom-bap kick and backbeat with ghosts,
 * swing's ride and feathered kick, ballad brushes, the waltz's ride in three, bossa cross-stick
 * and the shuffle's triplets with hand drums. Every section ends with a fill or a drop, a crash
 * marks the top of the next one, and the drummer plays the stops and the ending with the band.
 */
export function writeDrums(ctx: Ctx, r: Rng): NoteEvent[] {
  const events: NoteEvent[] = [];
  const hit: Hit = (part, beat, vel, variant, dur = 0.25) => events.push({ part, beat, dur, vel: Math.max(0.05, Math.min(1, vel)), ...(variant ? { variant } : {}) });
  const meter = ctx.meter;
  const style = ctx.style;
  const kickA = r.pick(KICKS);
  const kickB = r.chance(0.5) ? kickA : r.pick(KICKS);
  const hats = r.pick(["eighths", "sixteenths", "shaker"] as const);
  const hands = style === "shuffle" || (style === "bossa" && r.chance(0.5));

  ctx.sections.forEach((sec, si) => {
    const next = ctx.sections[si + 1];
    const from = sec.startBar * meter;

    if (sec.kind === "ending") {
      endingDrums(ctx, r, sec, hit);
      return;
    }
    if (si > 0 && sec.treatment !== "break" && (sec.kind !== "head" || sec.letter === "B" || ctx.sections[si - 1]!.kind === "intro")) {
      hit("crash", from, 0.45 + 0.4 * sec.energy, "crash", 2);
    }
    if (sec.treatment === "stop") for (const h of stopHits(sec, meter)) {
      hit("kick", from + h, 0.85);
      hit(style === "boombap" ? "snare" : "crash", from + h, 0.7, style === "boombap" ? "hit" : "crash", 1);
    }

    for (let k = 0; k < sec.bars; k++) {
      const bar = sec.startBar + k;
      const t = bar * meter;
      const last = k === sec.bars - 1;
      const fill = last && next !== undefined && next.kind !== "ending" ? r.chance(0.35 + 0.5 * sec.energy) : false;
      const drop = last && !fill && style === "boombap" && next?.kind !== "ending" && r.chance(0.5);
      if (stopped(sec, bar)) continue;
      if (sec.kind === "intro" && k < sec.bars - (style === "boombap" ? 2 : 0) && style !== "bossa") {
        // the intro is piano and bass; the drums come in late, or with a quiet ride
        if (style !== "boombap" && sec.energy > 0.25) timekeeping(style, t, meter, 0.25, hit, r);
        continue;
      }
      if (sec.treatment === "break") {
        // breakdown: no kick, no snare; just hats if anything
        if (k >= sec.bars - 1) hit("snare", t + 3, 0.5, "roll", 1);
        else if (r.chance(0.5)) for (let b = 0; b < 4; b += 1) hit("hat", t + b, 0.28, "ghost");
        continue;
      }
      const e = sec.energy;
      const end = fill ? meter - (style === "ballad" ? 1 : 2) : drop ? 2 : meter;

      switch (style) {
        case "boombap": {
          const kicks = sec.letter === "B" ? kickB : kickA;
          for (const b of kicks) if (b < end) hit("kick", t + b, b === 0 ? 0.92 : 0.74);
          if (k % 4 === 3 && end === meter && r.chance(0.5)) hit("kick", t + 3.75, 0.6);
          hit("snare", t + 1, 0.82, "hit");
          if (end > 3) hit("snare", t + 3, 0.85, "hit2");
          if (e > 0.45) for (const b of [0.75, 1.75, 2.25, 3.25]) if (b < end && r.chance(0.18 + 0.3 * e)) hit("snare", t + b, 0.18, "ghost");
          hatLine(hats, t, end, e, k, hit, r);
          break;
        }
        case "swing":
        case "shuffle":
        case "waltz":
        case "ballad":
        case "bossa":
          timekeeping(style, t, meter, e, hit, r, end, sec);
          if (style === "swing" || style === "shuffle") comping(t, end, e, hit, r);
          if (hands) congas(t, end, e, hit, r, style);
          break;
      }
      if (fill) fillBar(style, t, meter, end, e, hit, r);
      if (drop) hit("snare", t + 3.75, 0.45, "ghost");
    }
  });
  return events;
}

/** The time itself, for everything but boom-bap. */
function timekeeping(style: Ctx["style"], t: number, meter: number, e: number, hit: Hit, r: Rng, end = meter, sec?: Section) {
  const two = sec?.treatment === "two";
  if (style === "ballad" || (two && style !== "waltz")) {
    // brushes: a sweep through every beat, the snare tapped on 2 and 4
    for (let b = 0; b < end; b++) {
      hit("brush", t + b, 0.36 + 0.2 * e, "sweep", 1);
      if (b % 2 === 1) hit("brush", t + b, 0.3 + 0.25 * e, "tap");
      if (r.chance(0.3 * e)) hit("brush", t + b + 0.5, 0.2, "tap");
    }
    if (style !== "ballad") for (let b = 1; b < end; b += 2) hit("hat", t + b, 0.3, "ghost");
    if (e > 0.5) hit("kick", t, 0.25);
    return;
  }
  if (style === "bossa") {
    // cross-stick in the two-bar clave, kick on 1 and 3 with the push, closed hat eighths
    const bar = Math.round(t / meter);
    const clave = bar % 2 === 0 ? [0, 1.5, 3] : [1, 2.5];
    for (const b of clave) if (b < end) hit("snare", t + b, 0.48 + 0.15 * e, "rim");
    for (const b of [0, 1.5, 2, 3.5]) if (b < end) hit("kick", t + b, b % 2 === 0 ? 0.6 : 0.45);
    for (let b = 0; b < end; b += 0.5) hit(e > 0.55 ? "ride" : "hat", t + b, (b % 1 === 0 ? 0.32 : 0.22) + 0.15 * e, e > 0.55 ? "soft" : b % 1 === 0 ? "closed" : "ghost", e > 0.55 ? 1 : 0.25);
    return;
  }
  // ride: spang-a-lang; the waltz plays ding, ding-a, ding
  // (beats on thirds are triplets and are played as written, not swung)
  for (let b = 0; b < end; b++) {
    hit("ride", t + b, (b % 2 === 1 ? 0.5 : 0.42) + 0.25 * e, e > 0.8 && b === 0 && r.chance(0.3) ? "bell" : "ride", 1.5);
    const skip = style === "shuffle" || (meter === 3 ? b === 1 : b % 2 === 1);
    if (skip) hit("ride", t + b + 2 / 3, 0.32 + 0.2 * e, "soft", 1);
  }
  // hat on 2 and 4 (in three, on 2 and 3), feathered kick on every beat
  for (let b = 1; b < end; b += meter === 3 ? 1 : 2) hit("hat", t + b, 0.45 + 0.15 * e, "closed");
  for (let b = 0; b < end; b++) hit("kick", t + b, 0.16 + 0.1 * e);
}

/** Snare comping under a swing solo: dropped bombs and chatter on the triplet. */
function comping(t: number, end: number, e: number, hit: Hit, r: Rng) {
  for (let b = 0; b < end; b++) {
    if (r.chance(0.12 + 0.25 * e)) hit("snare", t + b + 2 / 3, 0.22 + 0.25 * e, r.chance(0.7) ? "ghost" : "hit");
    if (e > 0.7 && r.chance(0.08)) hit("kick", t + b + 2 / 3, 0.6);
  }
}

function congas(t: number, end: number, e: number, hit: Hit, r: Rng, style: Ctx["style"]) {
  if (style === "bossa") {
    for (const [b, v] of [[0, "mute"], [1, "open"], [1.5, "open"], [2.5, "mute"], [3, "high"], [3.5, "open"]] as const) if (b < end) hit("conga", t + b, 0.3 + 0.2 * e, v);
    return;
  }
  // shuffle: bongos on the triplet, a conga answering on 2 and 4
  for (let b = 0; b < end; b++) {
    hit("bongo", t + b, 0.32 + 0.15 * e, b % 2 === 0 ? "high" : "mute");
    if (r.chance(0.5)) hit("bongo", t + b + 2 / 3, 0.25, "low");
    if (b % 2 === 1) hit("conga", t + b, 0.4 + 0.2 * e, "open");
  }
}

function hatLine(kind: "eighths" | "sixteenths" | "shaker", t: number, end: number, e: number, k: number, hit: Hit, r: Rng) {
  if (kind === "eighths") {
    for (let b = 0; b < end; b += 0.5) {
      const open = b === 3.5 && k % 4 === 3 && r.chance(0.6);
      hit("hat", t + b, (b % 1 === 0 ? 0.5 : 0.34) + 0.1 * e, open ? "open" : b % 1 === 0 ? "closed" : r.chance(0.5) ? "closed2" : "ghost");
    }
  } else if (kind === "sixteenths") {
    const vel = [0.5, 0.2, 0.36, 0.22];
    for (let i = 0; i < end * 4; i++) {
      if (i % 4 === 1 && r.chance(0.3)) continue;
      hit("hat", t + i / 4, vel[i % 4]! + 0.08 * e, i % 4 === 0 ? "closed" : i % 2 === 0 ? "closed2" : "ghost");
    }
  } else {
    for (let b = 0; b < end; b += 0.5) hit("shaker", t + b, (b % 1 === 0 ? 0.34 : 0.24) + 0.1 * e, b % 1 === 0 ? "down" : "up");
  }
}

/** The last beats of a section: around the toms, a snare build, or a roll into the crash. */
function fillBar(style: Ctx["style"], t: number, meter: number, from: number, e: number, hit: Hit, r: Rng) {
  const kind = style === "ballad" ? "brush" : r.pick(e > 0.6 ? (["toms", "snare", "toms"] as const) : (["snare", "roll", "toms"] as const));
  if (kind === "brush") {
    hit("brush", t + from, 0.4, "sweep", 1);
    hit("brush", t + from + 0.5, 0.35, "tap");
    hit("crash", t + from + 0.75, 0.2, "swell", 1);
    return;
  }
  if (kind === "roll") {
    hit("snare", t + from, 0.5 + 0.2 * e, "roll", meter - from);
    return;
  }
  const grid = style === "shuffle" || style === "swing" || style === "waltz" ? 1 / 3 : 0.25;
  const n = Math.round((meter - from) / grid);
  for (let i = 0; i < n; i++) {
    const b = from + i * grid;
    const v = 0.45 + 0.35 * e * (i / n) + (i % 3 === 0 ? 0.08 : 0);
    if (kind === "snare") hit("snare", t + b, v, i % 2 === 0 ? "hit" : "hit2");
    else hit(i < n / 3 ? "snare" : "tom", t + b, v, i < n / 3 ? "hit" : i < (2 * n) / 3 ? "high" : "low");
    if (i === n - 1) hit("kick", t + b, 0.7);
  }
}

function endingDrums(ctx: Ctx, r: Rng, sec: Section, hit: Hit) {
  const meter = ctx.meter;
  const from = sec.startBar * meter;
  const to = from + sec.bars * meter;
  switch (ctx.ending) {
    case "button":
      hit("kick", from, 0.95);
      hit(ctx.style === "boombap" ? "snare" : "crash", from, 0.85, ctx.style === "boombap" ? "hit" : "crash", 2);
      return;
    case "fermata":
      // a cymbal swell into the last chord, then let it ring
      hit("crash", from - 1.5, 0.35, "swell", 2);
      hit("crash", from, 0.4, "crash", 4);
      hit("kick", from, 0.5);
      if (ctx.style === "ballad") hit("brush", from, 0.3, "sweep", 2);
      return;
    case "tag":
      for (let b = from; b < to - 2 * meter; b += meter) {
        if (ctx.style === "boombap") {
          hit("kick", b, 0.9);
          hit("snare", b + 1, 0.8, "hit");
          hit("snare", b + 3, 0.8, "hit2");
          for (let x = 0; x < meter; x += 0.5) hit("hat", b + x, 0.4, "closed");
        } else timekeeping(ctx.style, b, meter, sec.energy, hit, r);
      }
      // a roll on the held chord, cut by the last hit
      hit("snare", to - 2 * meter, 0.45, "roll", meter * 2 - 0.5);
      hit("crash", to - 2 * meter, 0.6, "crash", 4);
      hit("kick", to - 0.5, 0.9);
      hit("crash", to - 0.5, 0.7, "crash", 3);
      return;
    case "fade":
    case "runout":
      for (let b = from; b < to; b += meter) {
        if (ctx.style === "boombap") {
          for (const k of [0, 1.75, 2.5]) hit("kick", b + k, 0.85);
          hit("snare", b + 1, 0.8, "hit");
          hit("snare", b + 3, 0.82, "hit2");
          for (let x = 0; x < meter; x += 0.5) hit("hat", b + x, x % 1 === 0 ? 0.45 : 0.3, "closed");
        } else timekeeping(ctx.style, b, meter, sec.energy, hit, r);
      }
      return;
  }
}
