// The share image (public/og.jpg) and the README loop (docs/demo.gif), drawn by the site itself.
// node scripts/media.mjs [day]   needs ffmpeg
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openSite } from "./browser.mjs";

const day = process.argv[2] ?? "2026-10-23";
const GIF = { w: 640, h: 360, seconds: 18, fps: 12 };
const save = (file, url) => writeFileSync(file, Buffer.from(url.split(",")[1], "base64"));
const still = (page, t, w, h) => page.evaluate(([d, t, w, h]) => window.__still(d, t, w, h), [day, t, w, h]);

const { page, close } = await openSite({ now: "2026-12-31T12:00:00Z" });
const frames = mkdtempSync(join(tmpdir(), "b-side-"));
try {
  const cuts = await page.evaluate((d) => window.__cuts(d), day);
  const title = cuts.find((c) => c.kind === "title").start;

  // the title card once every letter is down
  const og = join(frames, "og.png");
  save(og, await still(page, title + 2.2, 1200, 630));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", og, "-q:v", "3", "public/og.jpg"]);

  // from just before the title card into the montage, frame for frame on the paper's twos
  const from = Math.max(0, title - 1);
  for (let i = 0; i < GIF.seconds * GIF.fps; i++) {
    save(join(frames, `${String(i).padStart(4, "0")}.png`), await still(page, from + (i + 0.5) / GIF.fps, GIF.w, GIF.h));
  }
  mkdirSync("docs", { recursive: true });
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-framerate", String(GIF.fps), "-i", join(frames, "%04d.png"),
    "-vf", "split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
    "-loop", "0", "docs/demo.gif",
  ]);
  console.log(`og.jpg and demo.gif from ${day}, title card at ${title.toFixed(2)} s`);
} finally {
  rmSync(frames, { recursive: true, force: true });
  await close();
}
