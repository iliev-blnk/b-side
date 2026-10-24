import { describe, expect, it } from "vitest";
import { feed, pressedAt, recordPage } from "../src/label/page.ts";
import { entry, linerNotes, matches } from "../src/label/record.ts";
import { addDays, LAUNCH } from "../src/record/date.ts";

const DAYS = Array.from({ length: 40 }, (_, i) => addDays(LAUNCH, i * 5));
const NONE = { q: "", mood: "", style: "", instrument: "" } as const;
const asset = (n: number) => ({ url: `https://example.com/${n}`, size: n });

describe("the label's listing", () => {
  it("is the same every time it's worked out, and complete", () => {
    for (const d of DAYS) {
      const e = entry(d);
      expect(entry(d)).toEqual(e);
      expect(linerNotes(d)).toBe(linerNotes(d));
      expect(e.tracks).toHaveLength(3);
      expect(e.styles.length).toBeGreaterThan(0);
      expect(e.instruments).not.toContain("drums");
      expect(e.instruments).not.toContain("double bass");
      expect(JSON.stringify(e)).not.toMatch(/undefined|NaN/);
      expect(linerNotes(d)).not.toMatch(/undefined|NaN|\s{2}|\.\./);
    }
  });

  it("names every track in the notes", () => {
    for (const d of DAYS) {
      const notes = linerNotes(d);
      for (const t of entry(d).tracks) expect(notes).toContain(`“${t.title}”`);
    }
  });

  it("filters by mood, style, instrument and words", () => {
    const all = DAYS.map(entry);
    const e = all[0]!;
    expect(all.every((x) => matches(x, NONE))).toBe(true);
    expect(all.filter((x) => matches(x, { ...NONE, mood: e.mood })).every((x) => x.mood === e.mood)).toBe(true);
    expect(matches(e, { ...NONE, style: e.styles[0]! })).toBe(true);
    expect(matches(e, { ...NONE, instrument: e.instruments[0]! })).toBe(true);
    expect(matches(e, { ...NONE, instrument: "theremin" })).toBe(false);
    expect(matches(e, { ...NONE, q: e.title.toUpperCase() })).toBe(true);
    expect(matches(e, { ...NONE, q: `${e.players[0]!.name.split(" ").at(-1)} no. ${e.no}` })).toBe(true);
    expect(matches(e, { ...NONE, q: "zzzz" })).toBe(false);
  });
});

describe("record pages", () => {
  const e = { ...entry(LAUNCH), title: `<script>"x"&` };

  it("escapes what it prints and carries the sleeve as its card", () => {
    const html = recordPage(e, "One. Two.", {}, LAUNCH);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;&quot;x&quot;&amp;");
    expect(html).toContain(`property="og:image" content="https://iliev-blnk.github.io/b-side/r/${LAUNCH}/sleeve.jpg"`);
    expect(html).toContain('property="og:description" content="One."');
    expect(html).not.toContain("og:video");
    expect(html).toContain("still being pressed");
    expect(html).not.toContain("← no.");
  });

  it("adds the film and the downloads once they're released", () => {
    const html = recordPage(e, "One.", { mp3: asset(5e6), mp4: asset(4e7), png: asset(3e6) }, addDays(LAUNCH, 1));
    expect(html).toContain('property="og:video" content="https://example.com/40000000"');
    expect(html).toContain("<video");
    expect(html).toContain("MP3, 5.0 MB");
    expect(html).toContain("MP4, 720p, 40 MB");
    expect(html).toContain("no. 2 →");
  });
});

describe("the feed", () => {
  it("has only the records that have a side to download", () => {
    const records = [LAUNCH, addDays(LAUNCH, 1)].map((d, i) => ({ entry: entry(d), notes: linerNotes(d), media: i ? {} : { mp3: asset(123) } }));
    const xml = feed(records);
    expect(xml.match(/<item>/g)).toHaveLength(1);
    expect(xml).toContain('length="123" type="audio/mpeg"');
    expect(xml).toContain(`<guid isPermaLink="false">r-${LAUNCH}</guid>`);
    expect(xml).toContain("<pubDate>Thu, 22 Oct 2026 21:00:00 GMT</pubDate>");
  });

  it("dates each record at midnight in Chișinău, summer time or not", () => {
    expect(pressedAt("2026-10-23").toISOString()).toBe("2026-10-22T21:00:00.000Z");
    expect(pressedAt("2026-10-25").toISOString()).toBe("2026-10-24T21:00:00.000Z");
    expect(pressedAt("2026-11-01").toISOString()).toBe("2026-10-31T22:00:00.000Z");
    expect(pressedAt("2027-03-28").toISOString()).toBe("2027-03-27T22:00:00.000Z");
  });
});
