// Balances the mix: renders each group of parts of a track alone and prints its level.
// usage: node scripts/stems.mjs <date> <mood> <track 1-3>
import { openSite } from "./browser.mjs";

const [date = "2026-10-23", mood = "noir", n = "1"] = process.argv.slice(2);
const GROUPS = {
  drums: ["kick", "snare", "hat", "ride", "crash", "tom", "shaker", "conga", "bongo", "clave", "brush"],
  bass: ["bass"],
  keys: ["piano", "keys"],
  lead: ["sax", "trumpet", "trombone", "flute", "clarinet", "vibes", "harmonica"],
  strings: ["strings"],
  colour: ["glock", "marimba"],
};
const site = await openSite();
try {
  for (const [name, parts] of Object.entries(GROUPS)) {
    const r = await site.page.evaluate(([d, m, k, o]) => window.__renderTrack(d, m, k, "./samples/", o).then((x) => ({ ...x, wav: "" })), [date, mood, Number(n) - 1, parts]);
    console.log(`${name.padEnd(8)} peak ${r.peakDb.toFixed(1).padStart(6)}  rms ${r.rmsDb.toFixed(1).padStart(6)}`);
  }
} finally {
  await site.close();
}
