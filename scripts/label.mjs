// The label's nightly work.
// node scripts/label.mjs press [day ...] [--missing N] [--release]
//   renders a night's side (MP3), film (MP4, 720p) and sleeve (PNG, 3000 px) into renders/label/<day>/,
//   and with --release puts them on the GitHub Release r-<day>. --missing N presses the N newest
//   nights that have no release yet, tonight first.
// node scripts/label.mjs site
//   builds the site and adds the record pages (r/<day>/), catalogue.json, feed.xml and feed.jpg,
//   with the media from whichever releases exist.
// needs ffmpeg, and gh for --release
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assetName, feed, recordPage, releaseTag, REPO } from "../src/label/page.ts";
import { entry, linerNotes } from "../src/label/record.ts";
import { isPressed, pressedDays, today } from "../src/record/date.ts";
import { openSite } from "./browser.mjs";

const args = process.argv.slice(2);
const cmd = args.shift();
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
};
const option = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const run = (bin, a) => execFileSync(bin, a, { stdio: "inherit" });
const save = (file, url) => writeFileSync(file, Buffer.from(url.split(",")[1], "base64"));

/** Every release's media, by night. Without network or a token it's just empty. */
async function releases() {
  const media = new Map();
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  const headers = { accept: "application/vnd.github+json", ...(token ? { authorization: `Bearer ${token}` } : {}) };
  try {
    for (let page = 1; ; page++) {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`, { headers });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const list = await res.json();
      for (const r of list) {
        const day = r.tag_name.replace(/^r-/, "");
        const m = {};
        for (const kind of ["mp3", "mp4", "png"]) {
          const a = r.assets.find((x) => x.name === assetName(day, kind) && x.state === "uploaded");
          if (a) m[kind] = { url: a.browser_download_url, size: a.size };
        }
        media.set(day, m);
      }
      if (list.length < 100) break;
    }
  } catch (e) {
    console.warn(`no releases read (${e.message}); pages go out without media`);
  }
  return media;
}

async function pressNights() {
  const release = flag("--release");
  const missing = Number(option("--missing") ?? 0);
  let days = args;
  for (const d of days) {
    if (!isPressed(d, today())) throw new Error(`${d} isn't a pressed night`);
  }
  if (!days.length) {
    const have = await releases();
    days = missing ? pressedDays(today()).filter((d) => !have.get(d)?.mp4).slice(0, missing) : [today()];
  }
  if (!days.length) console.log("every night is pressed");
  for (const day of days) {
    const e = entry(day);
    const dir = join("renders/label", day);
    mkdirSync(dir, { recursive: true });
    console.log(`pressing no. ${e.no}, ${e.title} (${day}, ${e.mood})`);
    run("node", ["scripts/press.mjs", day, "--mood", e.mood]);
    run("node", ["scripts/film.mjs", day, e.mood, "1280"]);

    const site = await openSite();
    const png = join(dir, assetName(day, "png"));
    const cover = join(dir, "cover.jpg");
    try {
      save(png, await site.page.evaluate(([d]) => window.__sleeve(d, 3000), [day]));
      save(cover, await site.page.evaluate(([d]) => window.__sleeve(d, 1000, "image/jpeg"), [day]));
    } finally {
      await site.close();
    }
    const tags = [
      ["title", e.title],
      ["artist", e.band],
      ["album", `b-side no. ${e.no}`],
      ["date", day],
      ["comment", linerNotes(day)],
    ].flatMap(([k, v]) => ["-metadata", `${k}=${v}`]);
    const ff = (...a) => run("ffmpeg", ["-y", "-loglevel", "error", ...a]);
    ff("-i", `renders/${day}-${e.mood}.mp3`, "-i", cover, "-map", "0:a", "-map", "1:v", "-c", "copy", "-id3v2_version", "3", "-disposition:v", "attached_pic", ...tags, join(dir, assetName(day, "mp3")));
    ff("-i", `renders/film/${day}-${e.mood}.mp4`, "-c", "copy", "-movflags", "+faststart", ...tags, join(dir, assetName(day, "mp4")));
    rmSync(cover);

    if (release) {
      const files = ["mp3", "mp4", "png"].map((k) => join(dir, assetName(day, k)));
      const tag = releaseTag(day);
      let exists = true;
      try {
        execFileSync("gh", ["release", "view", tag, "--repo", REPO], { stdio: "ignore" });
      } catch {
        exists = false;
      }
      if (exists) run("gh", ["release", "upload", tag, ...files, "--clobber", "--repo", REPO]);
      else run("gh", ["release", "create", tag, ...files, "--repo", REPO, "--title", `No. ${e.no}, ${e.title}`, "--notes", linerNotes(day), "--latest=false"]);
      console.log(`released ${tag}`);
    }
  }
}

async function buildSite() {
  const now = today();
  const media = await releases();
  const site = await openSite();
  const records = [];
  try {
    const days = pressedDays(now);
    for (const day of days) {
      const e = entry(day);
      const notes = linerNotes(day);
      const m = media.get(day) ?? {};
      const dir = join("dist/r", day);
      mkdirSync(dir, { recursive: true });
      save(join(dir, "sleeve.jpg"), await site.page.evaluate(([d]) => window.__sleeve(d, 1200, "image/jpeg"), [day]));
      save(join(dir, "poster.jpg"), await site.page.evaluate(([d, mood]) => window.__film(d, mood, 4, 1280, 720), [day, e.mood]));
      writeFileSync(join(dir, "index.html"), recordPage(e, notes, m, now));
      records.push({ entry: e, notes, media: m });
    }
    // the feed's art is no. 1's sleeve, at the size podcast apps ask for
    save("dist/feed.jpg", await site.page.evaluate(([d]) => window.__sleeve(d, 1400, "image/jpeg"), [days.at(-1)]));
    writeFileSync("dist/feed.xml", feed(records));
    writeFileSync("dist/catalogue.json", JSON.stringify({ built: now, records: records.map((r) => ({ ...r.entry, media: Object.keys(r.media) })) }));
    console.log(`${records.length} record pages, ${records.filter((r) => r.media.mp3).length} in the feed`);
  } finally {
    await site.close();
  }
}

if (cmd === "press") await pressNights();
else if (cmd === "site") await buildSite();
else {
  console.error("usage: node scripts/label.mjs press [day ...] [--missing N] [--release] | site");
  process.exit(1);
}
