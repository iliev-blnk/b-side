import { generateEp } from "../band/ep.ts";
import { sideSeconds } from "../band/side.ts";
import type { Ending, Mood, Style, Track } from "../band/types.ts";
import { cast, type Cast } from "../film/cast.ts";
import type { Player } from "../film/names.ts";
import { rng, type Rng } from "../music/rng.ts";
import { type Day, recordNo } from "../record/date.ts";
import { press } from "../record/press.ts";

/**
 * A record as the label lists it: what the catalogue filters on, what the record page and the feed
 * print, and the liner notes, all from the date. Nothing here draws or plays, so the build can run
 * it in plain Node.
 */

export interface Entry {
  day: Day;
  no: number;
  title: string;
  mood: Mood;
  /** Seconds, the whole side. */
  length: number;
  band: string;
  leader: string;
  tracks: { title: string; style: Style; bpm: number; key: string; length: number }[];
  /** The night's styles and instruments, for filtering. */
  styles: Style[];
  instruments: string[];
  players: { name: string; plays: string }[];
}

export const STYLE_NAMES: Record<Style, string> = { boombap: "boom-bap", swing: "swing", ballad: "ballad", waltz: "waltz", bossa: "bossa", shuffle: "shuffle" };

const NAMES = ["C", "D-flat", "D", "E-flat", "E", "F", "F-sharp", "G", "A-flat", "A", "B-flat", "B"];
export const keyName = (t: Track) => `${NAMES[t.key]} ${t.minor ? "minor" : "major"}`;

export function entry(day: Day): Entry {
  const p = press(day);
  const ep = generateEp(day, p.mood);
  const c = cast(ep);
  return {
    day,
    no: recordNo(day),
    title: p.title,
    mood: p.mood,
    length: sideSeconds(ep),
    band: c.band.name,
    leader: c.band.players[0]!.name,
    tracks: ep.tracks.map((t) => ({ title: t.title, style: t.style, bpm: t.bpm, key: keyName(t), length: t.lengthSec })),
    styles: [...new Set(ep.tracks.map((t) => t.style))],
    instruments: [...new Set(c.band.players.map((x) => x.plays).filter((x) => x !== "drums" && x !== "double bass"))],
    players: c.band.players.map((x) => ({ name: x.name, plays: x.plays })),
  };
}

// ---- liner notes ----

const STYLE_SAYS: Record<Style, string[]> = {
  boombap: ["a boom-bap groove", "a slow head-nod of a tune", "a boom-bap number"],
  swing: ["a swinger", "a hard-swinging blowing tune", "a fast one in four"],
  ballad: ["a ballad", "a slow ballad", "a late-hour ballad"],
  waltz: ["a jazz waltz", "a waltz", "a lilting three"],
  bossa: ["a bossa", "a bossa nova", "a light bossa"],
  shuffle: ["a shuffle", "a greasy shuffle", "a shuffle with the backbeat leaned on"],
};
const ENDING_SAYS: Record<Ending, string> = {
  tag: "goes out on a tag",
  fermata: "ends on a long held chord",
  fade: "fades out on the vamp",
  runout: "lets the groove run into the run-out",
  button: "stops dead on a button",
};
const PROP_SAYS: Record<Cast["prop"], string> = {
  match: "a book of matches",
  key: "a room key",
  letter: "a letter nobody has opened",
  ticket: "a ticket for the last train",
  photo: "a photograph",
  radio: "a pocket radio",
};
const WEATHER_SAYS: Record<Cast["weather"], string[]> = {
  rain: ["It rained the whole session.", "It was raining when they set up and still raining when they left.", "The rain did not let up all night."],
  snow: ["It snowed that night.", "There was snow on the cases when they came in.", "The first snow came down while they played."],
  clear: ["It was a clear, cold night.", "The night was clear.", "It was dry and still outside."],
};

const surname = (p: Player) => p.name.split(" ").at(-1)!;
const tempo = (t: Track) => `${t.bpm}`;
const quote = (s: string) => `“${s}”`;

const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function trackLine(r: Rng, t: Track, lead: Player | undefined, keys: Player | undefined, n: number): string {
  const style = r.pick(STYLE_SAYS[t.style]);
  const who = lead ? `${surname(lead)} on ${lead.plays}` : "the piano";
  if (n === 0) {
    const under = keys && keys !== lead ? ` over ${keys.name}'s ${keys.plays}` : "";
    return `${quote(t.title)} opens the side: ${style} at ${tempo(t)}, in ${keyName(t)}, with ${who} carrying the melody${under}.`;
  }
  if (n === 1) {
    const turn = r.pick(["changes the pace", "turns things around", "comes next"]);
    return `${quote(t.title)} ${turn}, ${style} in ${keyName(t)} at ${tempo(t)}, and the melody goes to ${who}.`;
  }
  return `${quote(t.title)} closes it, ${style} at ${tempo(t)}, and ${ENDING_SAYS[t.ending]}.`;
}

/** A paragraph in a label's register: who's on the date, the tempos and keys, and what happens. */
export function linerNotes(day: Day): string {
  const p = press(day);
  const ep = generateEp(day, p.mood);
  const c = cast(ep);
  const r = rng(`b-side/${day}`).fork("notes");
  const players = c.band.players;
  const by = (part: string | null) => players.find((x) => x.part === part);
  const leader = players[0]!;
  const keys = players.find((x) => x.chair === "keys");
  const bass = players.find((x) => x.chair === "bass");
  const drums = players.find((x) => x.chair === "drums");
  const strings = players.find((x) => x.chair === "strings");
  const titles = (f: (t: Track) => boolean) => ep.tracks.filter(f).map((t) => quote(t.title));

  const out: string[] = [];
  const size = players.filter((x) => x.chair !== "strings").length;
  const group = ["a trio", "a quartet", "a quintet", "a sextet", "a septet", "an octet"][size - 3] ?? "the band";
  out.push(
    r.pick([
      `${leader.name} brought ${group} in on the night of ${longDate(day)} with three tunes to get down.`,
      `This is ${c.band.name}, cut on the night of ${longDate(day)}: three tunes, one side.`,
      `${c.band.name} came in on ${longDate(day)} and cut a side in one sitting.`,
    ]),
  );
  out.push(r.pick(WEATHER_SAYS[c.weather]));
  ep.tracks.forEach((t, n) => out.push(trackLine(r, t, by(t.band.lead), keys, n)));
  const rhythm = [bass && `${bass.name} on bass`, drums && `${drums.name} on drums`].filter(Boolean) as string[];
  if (rhythm.length) out.push(`${list(rhythm)} hold it down throughout.`);
  for (const second of new Set(ep.tracks.map((t) => by(t.band.second)))) {
    const on = titles((t) => by(t.band.second) === second);
    if (second) out.push(`${second.name} comes in on ${second.plays} for the last head of ${list(on)}, a third below the melody.`);
  }
  const strung = titles((t) => t.band.strings);
  if (strings && strung.length) out.push(`${cap(strings.name)} play on ${list(strung)}.`);
  for (const part of ["glock", "marimba"] as const) {
    const who = by(part);
    const on = titles((t) => t.band.color === part);
    if (who && on.length) out.push(`${who.name} adds ${who.plays} over the melody near the end of ${list(on)}.`);
  }
  out.push(
    r.pick([
      `The film follows ${PROP_SAYS[c.prop]} from the street under the ${c.sign} sign to the club and out again.`,
      `In the film someone carries ${PROP_SAYS[c.prop]} across town, past the ${c.sign} sign, to where the band is playing.`,
    ]),
  );
  return out.join(" ");
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "23 October 2026" */
export function longDate(d: Day): string {
  const [y, m, day] = d.split("-");
  return `${Number(day)} ${MONTHS[Number(m) - 1]} ${y}`;
}

export interface Filter {
  q: string;
  mood: Mood | "";
  style: Style | "";
  instrument: string;
}

/** Whether a record is in what the catalogue's filters and search ask for. */
export function matches(e: Entry, f: Filter): boolean {
  if (f.mood && e.mood !== f.mood) return false;
  if (f.style && !e.styles.includes(f.style)) return false;
  if (f.instrument && !e.instruments.includes(f.instrument)) return false;
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [e.title, e.band, `no. ${e.no}`, e.day, ...e.tracks.map((t) => t.title), ...e.players.map((p) => `${p.name} ${p.plays}`)].join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}
