import { rng } from "../music/rng.ts";
import { tracklist } from "../record/title.ts";
import { MOODS, STYLES, hire } from "./styles.ts";
import { generateTrack, type TrackPlan } from "./track.ts";
import type { Band, Ep, Keys, Lead, Mood, Part, Style } from "./types.ts";

/**
 * One night's side A: the title track, a change of pace, and a closer. The same band plays all
 * three; the second horn sits in on the closer, and the keys move to related keys.
 */
export function generateEp(seed: string, mood: Mood): Ep {
  const r = rng(`${seed}/ep/${mood}`);
  const plan = MOODS[mood];
  const lineup = hire(r.fork("hire"), mood);
  // the titles the sleeve prints: the same stream the pressing draws them from
  const titles = tracklist(rng(`b-side/${seed}`).fork("title"), mood);
  const kr = r.fork("keys");
  const styles = plan.tracks.map((choices, i) => r.fork(`style${i}`).pick(choices)) as [Style, Style, Style];
  const minors = styles.map((s, i) => r.fork(`minor${i}`).chance(STYLES[s].minor));

  // related keys: the change of pace goes to the relative key or up a fourth; the closer comes home or up a step
  const home = kr.pick(plan.keys);
  const relative = (k: number, from: boolean, to: boolean) => (from === to ? k : from ? k + 3 : k + 9) % 12;
  const keys = [
    home,
    minors[1] === minors[0] ? (home + 5) % 12 : relative(home, minors[0]!, minors[1]!),
    minors[2] === minors[0] ? (home + kr.pick([0, 2])) % 12 : relative(home, minors[0]!, minors[2]!),
  ];

  const [first, second] = lineup.leads;
  const tracks = styles.map((style, n) => {
    const tr = r.fork(`track${n}`);
    const keysPart: Keys = tr.pick(STYLES[style].keys);
    const lead: Lead = n === 1 ? second : first;
    const band: Band = {
      keys: keysPart,
      lead,
      second: n === 2 ? second : n === 0 && tr.chance(0.4) ? second : null,
      strings: lineup.strings || (style === "ballad" && tr.chance(0.6)),
      color: tr.chance(n === 1 ? 0.5 : 0.25) ? (mood === "chase" || style === "bossa" ? "marimba" : "glock") : null,
    };
    const soloists: (Lead | Keys)[] = n === 0 ? [lead, keysPart] : n === 1 ? [tr.chance(0.5) ? keysPart : lead] : [first, second];
    const p: TrackPlan = { seed, mood, n, style, key: keys[n]!, minor: minors[n]!, band, soloists, title: titles[n]! };
    return generateTrack(tr, p);
  });

  const order: Part[] = [first, second];
  for (const t of tracks) for (const e of t.events) if (!order.includes(e.part)) order.push(e.part);
  return { seed, mood, tracks, lineup: order };
}
