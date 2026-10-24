// Renders a night's film.
// node scripts/film.mjs sheet [day] [mood]            a contact sheet: a frame from the middle of every shot, labelled
//   SCENE=club node scripts/film.mjs sheet ...         only that scene's shots, three frames from each
// node scripts/film.mjs at <seconds> [day] [mood]     one full-size frame
// node scripts/film.mjs range <from> <to> [day] [mood] [width]   part of the film as an mp4, with the music
// node scripts/film.mjs [day] [mood] [width]          the whole side as an mp4, with the music
// needs ffmpeg, and renders/<day>-<mood>.mp3 from scripts/press.mjs for the sound
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openSite } from "./browser.mjs";

const args = process.argv.slice(2);
const mode = ["sheet", "at", "range"].includes(args[0]) ? args.shift() : "film";
const nums = mode === "at" ? args.splice(0, 1).map(Number) : mode === "range" ? args.splice(0, 2).map(Number) : [];
const [day = "2026-10-23", mood = "noir", width = "1280"] = args;
const FPS = 12;
const OUT = "renders/film";
const save = (file, url) => writeFileSync(file, Buffer.from(url.split(",")[1], "base64"));
const ff = (...a) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a], { stdio: "inherit" });

mkdirSync(OUT, { recursive: true });
const { page, close } = await openSite();
const frames = mkdtempSync(join(tmpdir(), "b-side-film-"));
const shoot = (t, w, h) => page.evaluate(([d, m, t, w, h]) => window.__film(d, m, t, w, h), [day, mood, t, w, h]);
try {
  const info = await page.evaluate(([d, m]) => window.__filmInfo(d, m), [day, mood]);
  console.log(`${info.titles.join(" / ")}: ${info.length.toFixed(1)} s, ${info.shots.length} shots; ${info.band.name}; ${info.prop}, ${info.weather}`);

  if (mode === "at") {
    const f = join(OUT, `${day}-${mood}-at.jpg`);
    save(f, await shoot(nums[0], 1920, 1080));
    console.log(f);
  } else if (mode === "sheet") {
    const cells = [];
    const only = process.env.SCENE;
    for (const [i, s] of info.shots.entries()) {
      if (only && !only.split(",").includes(s.scene)) continue;
      for (const k of only ? [0.12, 0.45, 0.8] : [0.55]) {
        const t = s.start + (s.end - s.start) * k;
        const f = join(frames, `${cells.length}.jpg`);
        save(f, await shoot(t, 480, 270));
        cells.push({ f, label: `${i} ${s.scene}${s.variant ? `·${s.variant}` : ""} ${t.toFixed(0)}s` });
      }
    }
    const cols = process.env.SCENE ? 3 : 6;
    const n = cells.length;
    const lab = cells.map((c, i) => `[${i}:v]drawtext=text='${c.label}':x=8:y=8:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.6[v${i}]`).join(";");
    const out = join(OUT, `${day}-${mood}-${process.env.SCENE ?? "all"}-sheet.jpg`);
    ff(...cells.flatMap((c) => ["-i", c.f]), "-filter_complex",
      `${lab};${cells.map((_, i) => `[v${i}]`).join("")}xstack=inputs=${n}:layout=${cells.map((_, i) => `${(i % cols) * 480}_${Math.floor(i / cols) * 270}`).join("|")}:fill=black`,
      "-frames:v", "1", "-q:v", "3", out);
    console.log(out);
  } else {
    const [from, to] = mode === "range" ? nums : [0, info.length];
    const w = Number(width);
    const h = Math.round((w * 9) / 16);
    const n = Math.ceil((to - from) * FPS);
    const t0 = Date.now();
    for (let i = 0; i < n; i++) {
      save(join(frames, `${String(i).padStart(5, "0")}.jpg`), await shoot(from + (i + 0.5) / FPS, w, h));
      if (i % 240 === 0) console.log(`  ${i}/${n} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
    const audio = `renders/${day}-${mood}.mp3`;
    const sound = existsSync(audio) ? ["-ss", from.toFixed(3), "-i", audio, "-t", (to - from).toFixed(3), "-c:a", "aac", "-b:a", "192k"] : [];
    const out = join(OUT, mode === "range" ? `${day}-${mood}-${from}-${to}.mp4` : `${day}-${mood}.mp4`);
    ff("-framerate", String(FPS), "-i", join(frames, "%05d.jpg"), ...sound, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-r", "24", "-movflags", "+faststart", "-shortest", out);
    console.log(out);
  }
} finally {
  rmSync(frames, { recursive: true, force: true });
  await close();
}
