import type { Rng } from "../music/rng.ts";
import type { Mood } from "../music/types.ts";

/**
 * Titles in the register of jazz standards and late-night films. Each mood has its own words; the
 * templates are shared. Every slot is a plain list so the whole space can be checked in a test.
 */
interface Words {
  adj: string[];
  noun: string[];
  place: string[];
  time: string[];
  gerund: string[];
}

const WORDS: Record<Mood, Words> = {
  noir: {
    adj: ["Blue", "Borrowed", "Crooked", "Quiet", "Velvet", "Smoked", "Second-Hand", "Low", "Wet", "Cold", "Lonely", "Dead"],
    noun: ["Alibi", "Matches", "Rain", "Neon", "Cigarette", "Trench Coat", "Key", "Ledger", "Hotel", "Saxophone", "Witness", "Favour"],
    place: ["Dock Street", "Room 9", "the Harbour", "the Pier", "the Back Room", "the Station", "Fifth Avenue", "the Old Bridge"],
    time: ["Midnight", "Closing Time", "Half Past Two", "the Last Call", "Low Tide", "the Night Shift"],
    gerund: ["Counting", "Burning", "Keeping", "Losing", "Waiting for", "Following"],
  },
  chase: {
    adj: ["Fast", "Loose", "Late", "Wrong", "Hot", "Stolen", "Express", "Double", "Open", "Running", "Sharp", "Lucky"],
    noun: ["Getaway", "Wire", "Fare", "Crossing", "Detour", "Overtime", "Headlights", "Ticket", "Engine", "Signal", "Junction", "Sirens"],
    place: ["the Freeway", "Route 9", "the Tunnel", "the Rooftops", "the Border", "Platform Four", "the Ring Road", "Canal Street"],
    time: ["Rush Hour", "Five to Six", "the Green Light", "the Final Whistle", "Sundown", "Last Orders"],
    gerund: ["Chasing", "Outrunning", "Catching", "Missing", "Beating", "Running from"],
  },
  sad: {
    adj: ["Last", "Empty", "Paper", "Faded", "Unsent", "Small", "Pale", "Slow", "Grey", "Far", "Gentle", "Spare"],
    noun: ["Letters", "Snow", "Rooms", "Light", "Photographs", "Postcards", "Lamps", "Window", "Coat", "Promise", "Radio", "Umbrella"],
    place: ["the Old House", "the Shore", "Platform Two", "the Attic", "the Orchard", "the Courtyard", "the Kitchen", "the Far Room"],
    time: ["First Frost", "Late November", "the Small Hours", "Sunday Evening", "Early Spring", "After the Rain"],
    gerund: ["Leaving", "Folding", "Remembering", "Forgetting", "Keeping", "Writing"],
  },
};

type Template = (w: Words, r: Rng) => string;

const TEMPLATES: Template[] = [
  (w, r) => `${r.pick(w.adj)} ${r.pick(w.noun)}`,
  (w, r) => `${r.pick(w.noun)} at ${r.pick(w.time)}`,
  (w, r) => `${r.pick(w.place)} after ${r.pick(w.time)}`,
  (w, r) => `Last ${r.pick(w.noun)} to ${r.pick(w.place)}`,
  (w, r) => `${r.pick(w.gerund)} the ${r.pick(w.noun)}`,
  (w, r) => `No ${r.pick(w.noun)} for ${r.pick(w.place)}`,
  (w, r) => `The ${r.pick(w.adj)} ${r.pick(w.noun)}`,
  (w, r) => `${r.pick(w.time)}, ${r.pick(w.place)}`,
  (w, r) => `The ${r.pick(w.adj)} Side of ${r.pick(w.place)}`,
];

const MAX = 28;

/** One title. Tries again (from the same stream) until it fits on a sleeve. */
export function title(r: Rng, mood: Mood): string {
  for (;;) {
    const t = r.pick(TEMPLATES)(WORDS[mood], r).replace(/^(\w)/, (c) => c.toUpperCase());
    if (t.length <= MAX) return t;
  }
}

/** The title track plus two more for the back of the sleeve, all different. */
export function tracklist(r: Rng, mood: Mood): [string, string, string] {
  const out: string[] = [];
  while (out.length < 3) {
    const t = title(r, mood);
    if (!out.includes(t)) out.push(t);
  }
  return out as [string, string, string];
}

/** Every title the generator can produce for a mood (for tests). */
export function allTitles(mood: Mood): Set<string> {
  const w = WORDS[mood];
  const out = new Set<string>();
  const cap = (s: string) => s.replace(/^(\w)/, (c) => c.toUpperCase());
  for (const a of w.adj) for (const n of w.noun) out.add(`${a} ${n}`).add(`The ${a} ${n}`);
  for (const n of w.noun) {
    for (const t of w.time) out.add(`${n} at ${t}`);
    for (const p of w.place) out.add(`Last ${n} to ${p}`).add(`No ${n} for ${p}`);
    for (const g of w.gerund) out.add(`${g} the ${n}`);
  }
  for (const p of w.place) {
    for (const t of w.time) out.add(cap(`${p} after ${t}`)).add(cap(`${t}, ${p}`));
    for (const a of w.adj) out.add(`The ${a} Side of ${p}`);
  }
  return new Set([...out].filter((t) => t.length <= MAX));
}
