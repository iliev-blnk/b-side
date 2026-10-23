// Renders themes offline through the real audio chain, writes renders/<mood>-<seed>.wav,
// and fails if anything clips (peak > -1 dBFS) or is silent (RMS < -40 dBFS).
// usage: node scripts/render.mjs [seed ...]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openSite } from "./browser.mjs";

const OUT = new URL("../renders", import.meta.url).pathname;
const seeds = process.argv.slice(2).length ? process.argv.slice(2) : ["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"];
const moods = ["noir", "chase", "sad"];

mkdirSync(OUT, { recursive: true });
const site = await openSite();
let bad = 0;
try {
  for (const seed of seeds) {
    for (const mood of moods) {
      const r = await site.page.evaluate(([s, m]) => window.__render(s, m, "./samples/"), [seed, mood]);
      const file = join(OUT, `${mood}-${seed}.wav`);
      writeFileSync(file, Buffer.from(r.wav, "base64"));
      const ok = r.peakDb <= -1 && r.rmsDb >= -40;
      if (!ok) bad++;
      console.log(`${ok ? "ok " : "BAD"} ${mood.padEnd(5)} ${seed}  ${r.seconds.toFixed(1)} s  peak ${r.peakDb.toFixed(1)} dBFS  rms ${r.rmsDb.toFixed(1)} dBFS`);
    }
  }
} finally {
  await site.close();
}
if (bad) {
  console.error(`${bad} renders out of level limits`);
  process.exit(1);
}
