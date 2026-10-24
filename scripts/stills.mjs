// Contact sheets of the film, a frame from the middle of every shot, for looking at the picture
// without playing it.
// node scripts/stills.mjs [days...] [--mood=noir|chase|sad] [--size=WxH] [--scene=name]
//   writes stills/<day>-<mood>/<nn>-<scene>.jpg and a sheet.jpg of them all (needs ffmpeg)
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { entry } from "../src/label/record.ts";
import { openSite } from "./browser.mjs";

const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const [W, H] = (opt("size") ?? "960x540").split("x").map(Number);
const days = args.filter((a) => !a.startsWith("--"));
if (!days.length) days.push("2026-10-23", "2026-10-24", "2026-10-25");

const save = (file, url) => writeFileSync(file, Buffer.from(url.split(",")[1], "base64"));
const { page, close } = await openSite({ now: "2027-12-31T12:00:00Z" });
try {
  for (const day of days) {
    const mood = opt("mood") ?? entry(day).mood;
    const out = `stills/${day}-${mood}`;
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    const { shots } = await page.evaluate(([d, m]) => window.__filmInfo(d, m), [day, mood]);
    let n = 0;
    for (const [i, s] of shots.entries()) {
      if (opt("scene") && s.scene !== opt("scene")) continue;
      // past the transition in, before the one out
      const t = s.start + Math.min(2.5, (s.end - s.start) / 2);
      save(`${out}/${String(i).padStart(2, "0")}-${s.scene}.jpg`, await page.evaluate(([d, m, t, w, h]) => window.__film(d, m, t, w, h), [day, mood, t, W, H]));
      n++;
    }
    const cols = Math.min(4, n);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-pattern_type", "glob", "-i", `${out}/[0-9]*.jpg`, "-vf", `scale=480:-1,tile=${cols}x${Math.ceil(n / cols)}:padding=4`, "-frames:v", "1", `${out}/sheet.jpg`]);
    console.log(`${day} ${mood}: ${n} shots -> ${out}/sheet.jpg`);
  }
} finally {
  await close();
}
