import { addDays, type Day, LAUNCH, longDay, today } from "../record/date.ts";
import { type Entry, longDate, STYLE_NAMES } from "./record.ts";

/**
 * The label's static surfaces, built once a night: a page per record and the podcast feed. Media
 * live on the record's GitHub Release; a night that hasn't been pressed to a release yet still gets
 * its page, just without the film and the downloads.
 */

export const SITE = "https://iliev-blnk.github.io/b-side";
export const REPO = "iliev-blnk/b-side";

export interface Asset {
  url: string;
  size: number;
}
export interface Media {
  mp3?: Asset;
  mp4?: Asset;
  png?: Asset;
}

/** What a night's release is called, and its files. */
export const releaseTag = (day: Day) => `r-${day}`;
export const assetName = (day: Day, kind: keyof Media) => (kind === "png" ? `b-side-${day}-sleeve.png` : `b-side-${day}.${kind}`);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const mb = (n: number) => `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0)} MB`;

export function recordPage(e: Entry, notes: string, media: Media, now: Day): string {
  const url = `${SITE}/r/${e.day}/`;
  const title = `No. ${e.no}, ${e.title}`;
  const first = notes.split(/(?<=\.) /)[0]!;
  const prev = e.day > LAUNCH ? addDays(e.day, -1) : null;
  const next = e.day < now ? addDays(e.day, 1) : null;
  const og = [
    ["og:type", media.mp4 ? "video.other" : "music.album"],
    ["og:title", title],
    ["og:description", first],
    ["og:url", url],
    ["og:image", `${url}sleeve.jpg`],
    ["og:image:width", "1200"],
    ["og:image:height", "1200"],
    ["og:image:alt", `The sleeve of no. ${e.no}, ${e.title}`],
    ...(media.mp4
      ? [
          ["og:video", media.mp4.url],
          ["og:video:secure_url", media.mp4.url],
          ["og:video:type", "video/mp4"],
          ["og:video:width", "1280"],
          ["og:video:height", "720"],
        ]
      : []),
  ];
  const downloads = (
    [
      ["mp3", "The side", "MP3"],
      ["mp4", "The film", "MP4, 720p"],
      ["png", "The sleeve for print", "PNG, 3000 px"],
    ] as const
  )
    .filter(([k]) => media[k])
    .map(([k, label, kind]) => `<li><a href="${esc(media[k]!.url)}" download>${label}</a> <span>${kind}, ${mb(media[k]!.size)}</span></li>`)
    .join("");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)} · b-side</title>
    <meta name="description" content="${esc(first)}" />
${og.map(([k, v]) => `    <meta property="${k}" content="${esc(v!)}" />`).join("\n")}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="theme-color" content="#0e0d0c" />
    <link rel="canonical" href="${url}" />
    <link rel="alternate" type="application/rss+xml" title="b-side" href="${SITE}/feed.xml" />
    <link rel="icon" href="../../favicon.svg" />
    <link rel="stylesheet" href="../record.css" />
  </head>
  <body>
    <main>
      <nav><a class="home" href="../../">b-side</a>${prev ? `<a href="../${prev}/">← no. ${e.no - 1}</a>` : "<span></span>"}${next ? `<a href="../${next}/">no. ${e.no + 1} →</a>` : "<span></span>"}</nav>
      <section class="head">
        <img class="sleeve" src="sleeve.jpg" width="1200" height="1200" alt="The sleeve of no. ${e.no}, ${esc(e.title)}" />
        <div>
          <h1>${esc(e.title)}</h1>
          <p class="sub">No. ${e.no}, pressed ${longDay(e.day)}${e.day === now ? ", tonight" : ""}. Side A, ${e.mood}, ${clock(e.length)}. ${esc(e.band)}.</p>
          <a class="play" href="../../#${e.day}">Play it and sit in</a>
          ${downloads ? `<ul class="downloads">${downloads}</ul>` : `<p class="wait">The film and the downloads are still being pressed.</p>`}
        </div>
      </section>
      ${media.mp4 ? `<video controls preload="none" playsinline poster="poster.jpg" width="1280" height="720"><source src="${esc(media.mp4.url)}" type="video/mp4" /></video>` : ""}
      <section class="cols">
        <div>
          <h2>Side A</h2>
          <ol class="tracks">
${e.tracks.map((t) => `            <li><b>${esc(t.title)}</b><span>${STYLE_NAMES[t.style]}, ${t.bpm} bpm, ${t.key}</span><span class="len">${clock(t.length)}</span></li>`).join("\n")}
          </ol>
          <h2>Personnel</h2>
          <ul class="credits">
${e.players.map((p) => `            <li>${esc(p.name)}<span>${esc(p.plays)}</span></li>`).join("\n")}
          </ul>
        </div>
        <div>
          <h2>Notes</h2>
          <p class="notes">${esc(notes)}</p>
          <p class="small">Pressed at midnight in Chișinău on ${longDate(e.day)}, from the date and nothing else.</p>
        </div>
      </section>
      <footer><a href="../../">All records</a> · <a href="${SITE}/feed.xml">Subscribe in a podcast app</a> · <a href="https://github.com/${REPO}">Source</a></footer>
    </main>
  </body>
</html>
`;
}

/** Midnight in Chișinău at the start of `day`, which is when it was pressed. */
export function pressedAt(day: Day): Date {
  for (const off of ["+03:00", "+02:00"]) {
    const t = new Date(`${day}T00:00:00${off}`);
    if (today(t) === day && today(new Date(t.getTime() - 1)) !== day) return t;
  }
  return new Date(`${day}T00:00:00+02:00`);
}

/** The podcast feed: one episode per record whose side has been pressed to a release, newest first. */
export function feed(records: { entry: Entry; notes: string; media: Media }[]): string {
  const items = records
    .filter((r) => r.media.mp3)
    .map(({ entry: e, notes, media }) => {
      const url = `${SITE}/r/${e.day}/`;
      return `    <item>
      <title>${esc(`No. ${e.no}, ${e.title}`)}</title>
      <link>${url}</link>
      <guid isPermaLink="false">${releaseTag(e.day)}</guid>
      <pubDate>${pressedAt(e.day).toUTCString()}</pubDate>
      <description>${esc(notes)}</description>
      <enclosure url="${esc(media.mp3!.url)}" length="${media.mp3!.size}" type="audio/mpeg" />
      <itunes:duration>${Math.round(e.length)}</itunes:duration>
      <itunes:episode>${e.no}</itunes:episode>
      <itunes:image href="${url}sleeve.jpg" />
      <itunes:explicit>false</itunes:explicit>
    </item>`;
    });
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>b-side</title>
    <link>${SITE}/</link>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml" />
    <description>One record pressed every night in Chișinău: a side of three jazz tunes, made from the date.</description>
    <language>en</language>
    <itunes:author>b-side</itunes:author>
    <itunes:type>episodic</itunes:type>
    <itunes:image href="${SITE}/feed.jpg" />
    <itunes:category text="Music" />
    <itunes:explicit>false</itunes:explicit>
${items.join("\n")}
  </channel>
</rss>
`;
}
