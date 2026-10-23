// Prints the level of each part on its own, through the full chain (without crackle masking it much).
// usage: node scripts/stems.mjs [seed]
import { openSite } from "./browser.mjs";

const seed = process.argv[2] ?? "2026-10-23";
const site = await openSite();
try {
  for (const mood of ["noir", "chase", "sad"]) {
    const parts = ["kick", "snare", "hat", "shaker", "bass", "keys", "piano", "sax", "vibes", "harmonica"];
    const row = [];
    for (const p of parts) {
      const r = await site.page.evaluate(([s, m, p]) => window.__render(s, m, "./samples/", [p]).then((x) => ({ peakDb: x.peakDb, rmsDb: x.rmsDb })), [seed, mood, p]);
      if (r.peakDb > -60) row.push(`${p} ${r.rmsDb.toFixed(0)}/${r.peakDb.toFixed(0)}`);
    }
    console.log(`${mood}: ${row.join("  ")}`);
  }
} finally {
  await site.close();
}
