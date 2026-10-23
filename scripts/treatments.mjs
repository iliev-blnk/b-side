// The same scene drawn three ways, so one look can be chosen before the films are built.
// node scripts/treatments.mjs sheet [day] [mood]   a contact sheet: a row per moment, a column per look
// node scripts/treatments.mjs at <seconds> [day] [mood]   one full-size frame per look
// node scripts/treatments.mjs [day] [mood]          each look as an mp4 with the music, and all three in a grid
// needs ffmpeg, and renders/<day>-<mood>.mp3 from scripts/press.mjs for the sound
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openSite } from "./browser.mjs";

const args = process.argv.slice(2);
const sheet = args[0] === "sheet";
if (sheet) args.shift();
const at = args[0] === "at" ? Number(args.splice(0, 2)[1]) : null;
const [day = "2026-10-23", mood = "noir"] = args;
const LOOKS = ["flat", "deep", "hard"];
const FPS = 12;
const OUT = "renders/treatments";
const save = (file, url) => writeFileSync(file, Buffer.from(url.split(",")[1], "base64"));
const ff = (...a) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a], { stdio: "inherit" });

mkdirSync(OUT, { recursive: true });
const { page, close } = await openSite();
const frames = mkdtempSync(join(tmpdir(), "b-side-film-"));
const film = (look, t, w, h) => page.evaluate(([d, m, l, t, w, h]) => window.__film(d, m, l, t, w, h), [day, mood, look, t, w, h]);
try {
  const info = await page.evaluate(([d, m]) => window.__filmInfo(d, m), [day, mood]);
  const [, cut] = info.cuts;
  console.log(`${info.title}: ${info.length.toFixed(1)} s, cut at ${cut.toFixed(2)} s`);

  if (at !== null) {
    for (const look of LOOKS) save(join(OUT, `at-${look}.jpg`), await film(look, at, 1920, 1080));
    console.log(`${OUT}/at-{${LOOKS}}.jpg at ${at} s`);
  } else if (sheet) {
    const times = [0.5, cut * 0.35, cut * 0.62, cut * 0.97, cut + 0.6, cut + (info.length - cut) * 0.45, info.length - 0.4];
    const cells = [];
    for (const [i, t] of times.entries())
      for (const look of LOOKS) {
        const f = join(frames, `${i}-${look}.jpg`);
        save(f, await film(look, t, 800, 450));
        cells.push(f);
      }
    const n = cells.length;
    ff(...cells.flatMap((f) => ["-i", f]), "-filter_complex",
      `${cells.map((_, i) => `[${i}]`).join("")}xstack=inputs=${n}:layout=${cells.map((_, i) => `${(i % 3) * 800}_${Math.floor(i / 3) * 450}`).join("|")}:fill=black`,
      "-q:v", "3", join(OUT, "sheet.jpg"));
    console.log(`${OUT}/sheet.jpg at ${times.map((t) => t.toFixed(1)).join(", ")} s`);
  } else {
    const n = Math.ceil(info.length * FPS);
    const audio = `renders/${day}-${mood}.mp3`;
    const sound = existsSync(audio) ? ["-i", audio, "-t", info.length.toFixed(2), "-c:a", "aac", "-b:a", "192k"] : [];
    for (const look of LOOKS) {
      const dir = join(frames, look);
      mkdirSync(dir);
      for (let i = 0; i < n; i++) save(join(dir, `${String(i).padStart(4, "0")}.jpg`), await film(look, (i + 0.5) / FPS, 1280, 720));
      ff("-framerate", String(FPS), "-i", join(dir, "%04d.jpg"), ...sound, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-r", "24", "-shortest", join(OUT, `${look}.mp4`));
      console.log(`${OUT}/${look}.mp4`);
    }
    // the three in one frame: A and B on top, C below, each with its letter
    const label = (i, l) => `[${i}:v]scale=960:540,drawtext=text='${l}':x=24:y=18:fontsize=30:fontcolor=white@0.85[v${i}]`;
    ff(...LOOKS.flatMap((l) => ["-i", join(OUT, `${l}.mp4`)]), "-filter_complex",
      `${label(0, "A")};${label(1, "B")};${label(2, "C")};[v0][v1][v2]xstack=inputs=3:layout=0_0|960_0|480_540:fill=black[v]`,
      "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-c:a", "copy", join(OUT, "all.mp4"));
    console.log(`${OUT}/all.mp4`);
  }
} finally {
  rmSync(frames, { recursive: true, force: true });
  await close();
}
