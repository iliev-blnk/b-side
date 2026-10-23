import { MOODS } from "./moods.ts";
import type { Rng } from "./rng.ts";
import { type Ctx, type NoteEvent, sectionAt } from "./types.ts";

/** Boom-bap: kick, a crunchy backbeat, ghost notes, and hats or a shaker. Straight 16th grid; swing is applied at playback. */
export function drums(r: Rng, ctx: Ctx): NoteEvent[] {
  const spec = MOODS[ctx.mood];
  const events: NoteEvent[] = [];
  const hit = (part: NoteEvent["part"], beat: number, vel: number, variant?: string) =>
    events.push({ part, beat, dur: 0.25, vel: Math.min(1, vel), ...(variant ? { variant } : {}) });

  const kickA = r.pick(spec.kicks);
  const kickB = r.chance(0.5) ? kickA : r.pick(spec.kicks);
  const ghosts = r.chance(spec.density === "high" ? 0.9 : 0.6);
  const last = ctx.bars - 1;

  for (let bar = 0; bar < ctx.bars; bar++) {
    const sec = sectionAt(ctx.sections, bar);
    const t = bar * 4;
    const inSec = bar - sec.startBar;
    const lastOfSec = inSec === sec.bars - 1;

    if (bar === last) {
      if (ctx.mood !== "sad") hit("kick", t, 0.85);
      continue;
    }
    if (sec.name === "intro") {
      // the band counts in: hats only, in the last two intro bars
      if (spec.quietA || inSec < sec.bars - 2) continue;
      for (let b = 0; b < 4; b += 0.5) hit("hat", t + b, b % 1 === 0 ? 0.32 : 0.2, "ghost");
      continue;
    }
    if (sec.name === "a" && spec.quietA) continue;

    // the last bar before a new section drops out after beat 3 (a classic breath), half the time
    const drop = lastOfSec && sec.name !== "outro" && r.chance(0.5);
    const kicks = sec.name === "b" ? kickB : kickA;
    for (const b of kicks) if (!drop || b < 2) hit("kick", t + b, b === 0 ? 0.92 : 0.74);
    if (inSec % 4 === 3 && !drop && r.chance(0.5)) hit("kick", t + 3.75, 0.6);

    const backbeat = spec.hats === "shaker" ? "rim" : null;
    hit("snare", t + 1, backbeat ? 0.6 : 0.82, backbeat ?? "hit");
    if (!drop) hit("snare", t + 3, backbeat ? 0.6 : 0.85, backbeat ?? "hit2");
    else hit("snare", t + 3.75, 0.5, "ghost");

    if (ghosts && !backbeat) {
      const spots = spec.density === "high" ? [0.75, 2.25, 3.75] : [1.75, 3.25];
      for (const b of spots) if (r.chance(0.4) && !(drop && b > 2)) hit("snare", t + b, 0.2, "ghost");
    }

    if (spec.hats === "eighths") {
      for (let b = 0; b < 4; b += 0.5) {
        if (drop && b >= 2.5) break;
        const open = b === 3.5 && inSec % 4 === 3 && r.chance(0.6);
        hit("hat", t + b, b % 1 === 0 ? 0.5 : 0.34, open ? "open" : b % 1 === 0 ? "closed" : r.chance(0.5) ? "closed2" : "ghost");
      }
    } else if (spec.hats === "sixteenths") {
      const vel = [0.5, 0.2, 0.36, 0.22];
      for (let i = 0; i < 16; i++) {
        const b = i / 4;
        if (drop && b >= 2.5) break;
        if (i % 4 === 1 && r.chance(0.3)) continue;
        hit("hat", t + b, vel[i % 4]!, i % 4 === 0 ? "closed" : i % 2 === 0 ? "closed2" : "ghost");
      }
    } else {
      for (let b = 0; b < 4; b += 0.5) {
        if (drop && b >= 2.5) break;
        hit("shaker", t + b, b % 1 === 0 ? 0.34 : 0.24, b % 1 === 0 ? "down" : "up");
      }
    }
  }
  return events;
}
