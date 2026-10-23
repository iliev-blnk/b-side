// Contact sheets of episodes and sleeves, for looking at the picture without playing it.
// node scripts/stills.mjs [days...] [--size=WxH]
import { mkdirSync, writeFileSync } from "node:fs";
import { openSite } from "./browser.mjs";

const args = process.argv.slice(2);
const sizeArg = args.find((a) => a.startsWith("--size="));
const [W, H] = (sizeArg?.slice(7) ?? "960x540").split("x").map(Number);
const days = args.filter((a) => !a.startsWith("--"));
if (!days.length) days.push("2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29");

const { page, close } = await openSite({ now: "2026-12-31T12:00:00Z" });
const out = `stills/${W}x${H}`;
mkdirSync(out, { recursive: true });
const save = (file, url) => writeFileSync(file, Buffer.from(url.split(",")[1], "base64"));
try {
  for (const day of days) {
    const cuts = await page.evaluate((d) => window.__cuts(d), day);
    save(`${out}/${day}-sleeve.png`, await page.evaluate((d) => window.__sleeve(d, 800), day));
    for (const [i, c] of cuts.entries()) {
      // a moment after the cut, once the pieces have landed
      const end = i + 1 < cuts.length ? cuts[i + 1].start : c.start + 4;
      const t = Math.min(c.start + 1.4, (c.start + end) / 2);
      save(`${out}/${day}-${String(i).padStart(2, "0")}-${c.kind}-${c.comp}.png`, await page.evaluate(([d, t, w, h]) => window.__still(d, t, w, h), [day, t, W, H]));
    }
    console.log(`${day}: ${cuts.length} shots`);
  }
} finally {
  await close();
}
