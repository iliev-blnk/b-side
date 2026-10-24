// The share image (public/og.jpg) and the README loop (docs/demo.gif), drawn by the site itself.
// node scripts/media.mjs [day]   needs ffmpeg
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { entry } from "../src/label/record.ts";
import { openSite } from "./browser.mjs";

const day = process.argv[2] ?? "2026-10-23";
const GIF = { w: 480, h: 270, seconds: 10, fps: 12 };
const save = (file, url) => writeFileSync(file, Buffer.from(url.split(",")[1], "base64"));
const frame = (page, mood, t, w, h) => page.evaluate(([d, m, t, w, h]) => window.__film(d, m, t, w, h), [day, mood, t, w, h]);

const { page, close } = await openSite({ now: "2026-12-31T12:00:00Z" });
const frames = mkdtempSync(join(tmpdir(), "b-side-"));
try {
  const { mood } = entry(day);
  const { heads } = await page.evaluate(([d, m]) => window.__filmInfo(d, m), [day, mood]);
  const title = heads[0];

  // the first title once all its words are down, a second before it lifts
  const og = join(frames, "og.jpg");
  save(og, await frame(page, mood, title.end - 1, 1200, 630));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", og, "-q:v", "3", "public/og.jpg"]);

  // from just before the title into the tune, frame for frame on the film's twos
  const from = Math.max(0, title.start - 1);
  for (let i = 0; i < GIF.seconds * GIF.fps; i++) {
    save(join(frames, `${String(i).padStart(4, "0")}.jpg`), await frame(page, mood, from + (i + 0.5) / GIF.fps, GIF.w, GIF.h));
  }
  mkdirSync("docs", { recursive: true });
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-framerate", String(GIF.fps), "-i", join(frames, "%04d.jpg"),
    "-vf", "split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
    "-loop", "0", "docs/demo.gif",
  ]);
  console.log(`og.jpg and demo.gif from ${day}, title at ${title.start.toFixed(2)} s`);
} finally {
  rmSync(frames, { recursive: true, force: true });
  await close();
}
