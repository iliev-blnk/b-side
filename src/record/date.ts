/** Dates are plain "yyyy-mm-dd" strings in Europe/Chisinau, the label's home. */
export type Day = string;

/** The night record no. 1 was pressed. */
export const LAUNCH: Day = "2026-10-23";

const DAY_MS = 86_400_000;
const ms = (d: Day) => Date.parse(`${d}T00:00:00Z`);

export function isDay(s: string): s is Day {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(ms(s)) && new Date(ms(s)).toISOString().startsWith(s);
}

/** Today in Chișinău. The only place the clock is read. */
export function today(now: Date = new Date()): Day {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Chisinau" }).format(now);
}

export function addDays(d: Day, n: number): Day {
  return new Date(ms(d) + n * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(a: Day, b: Day): number {
  return Math.round((ms(b) - ms(a)) / DAY_MS);
}

export function recordNo(d: Day): number {
  return daysBetween(LAUNCH, d) + 1;
}

export function isPressed(d: Day, now: Day): boolean {
  return isDay(d) && d >= LAUNCH && d <= now;
}

/** Every pressed record up to `now`, newest first. */
export function pressedDays(now: Day): Day[] {
  const n = Math.max(0, daysBetween(LAUNCH, now) + 1);
  return Array.from({ length: n }, (_, i) => addDays(now, -i));
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "23 oct 2026" */
export function longDay(d: Day): string {
  const [y, m, day] = d.split("-");
  return `${Number(day)} ${MONTHS[Number(m) - 1]} ${y}`;
}

/** "23.10.2026" */
export function dottedDay(d: Day): string {
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
}
