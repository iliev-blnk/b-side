// Presses whole nights: renders each track of side A offline through the real audio chain, checks
// levels (peak <= -1 dBFS, RMS >= -40 dBFS), and joins them into renders/<date>-<mood>.mp3.
// usage: node scripts/press.mjs [date ...] [--mood noir|chase|sad] [--only part,part]
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openSite } from "./browser.mjs";

const OUT = new URL("../renders", import.meta.url).pathname;
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const moodArg = flag("--mood");
const only = flag("--only")?.split(",");
const dates = args.length ? args : ["2026-10-23"];
const moods = moodArg ? [moodArg] : ["noir", "chase", "sad"];

mkdirSync(OUT, { recursive: true });
const site = await openSite();
let bad = 0;
try {
  for (const date of dates) {
    for (const mood of moods) {
      const parts = [];
      for (let n = 0; n < 3; n++) {
        const r = await site.page.evaluate(([d, m, k, o]) => window.__renderTrack(d, m, k, "./samples/", o ?? undefined), [date, mood, n, only]);
        const file = join(OUT, `${date}-${mood}-${n + 1}.wav`);
        writeFileSync(file, Buffer.from(r.wav, "base64"));
        parts.push(file);
        const ok = r.peakDb <= -1 && r.rmsDb >= -40;
        if (!ok) bad++;
        console.log(`${ok ? "ok " : "BAD"} ${date} ${mood.padEnd(5)} ${n + 1} ${r.style.padEnd(7)} ${r.title.padEnd(28)} ${r.seconds.toFixed(1).padStart(6)} s  peak ${r.peakDb.toFixed(1)}  rms ${r.rmsDb.toFixed(1)}`);
      }
      const list = join(OUT, `${date}-${mood}.txt`);
      writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n"));
      const mp3 = join(OUT, `${date}-${mood}${only ? `-${only.join("+")}` : ""}.mp3`);
      execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c:a", "libmp3lame", "-q:a", "2", mp3]);
      for (const p of [...parts, list]) rmSync(p);
      console.log(`   -> ${mp3}`);
    }
  }
} finally {
  await site.close();
}
if (bad) {
  console.error(`${bad} tracks out of level limits`);
  process.exit(1);
}
