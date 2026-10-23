// Plays records on the shelf the way a visitor would and checks the player holds together.
import { openSite } from "./browser.mjs";

const NOW = "2026-11-05T21:00:00+02:00";
const { page, newPage, close } = await openSite({ now: NOW });
const playing = () => page.evaluate(() => window.__playing);
const check = (ok, msg) => {
  if (!ok) throw new Error(msg);
  console.log(`ok  ${msg}`);
};
// a canvas showing an episode has more than one colour on it
const painted = (p, sel) =>
  p.$eval(sel, (c) => {
    const g = c.getContext("2d");
    const seen = new Set();
    for (let i = 0; i < 64; i++) {
      const [r, gg, b] = g.getImageData(((i * 37) % 8) * (c.width / 8) + 4, Math.floor(i / 8) * (c.height / 8) + 4, 1, 1).data;
      seen.add(`${r >> 4},${gg >> 4},${b >> 4}`);
    }
    return seen.size;
  });

let failed = false;
try {
  check((await page.textContent("#today h2"))?.length > 0, "tonight's record is on the front");
  const shelf = await page.$$("#grid figure");
  check(shelf.length === 13, `the shelf holds the 13 earlier records (${shelf.length})`);

  await page.click("#today .play");
  await page.waitForFunction(() => window.__playing === 1, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  check((await painted(page, "#player canvas")) > 2, "the episode is drawing");

  // start another record over the first, twice, fast
  await page.click("#close");
  await page.locator("#grid figure .sleeve").first().scrollIntoViewIfNeeded();
  await page.locator("#grid figure .sleeve").nth(1).waitFor();
  // the overlay covers the shelf once a record starts, so the double press comes from script
  await page.evaluate(() => {
    const [a, b] = document.querySelectorAll("#grid .sleeve");
    a.click();
    setTimeout(() => b.click(), 60);
  });
  await page.waitForFunction(() => window.__playing >= 1, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  check((await playing()) === 1, "only one record plays at a time");
  await page.keyboard.press("Escape");
  check((await playing()) === 0, "escape stops it");

  const still = await newPage({ reducedMotion: true });
  await still.click("#today .play");
  await still.waitForFunction(() => window.__playing === 1, null, { timeout: 15000 });
  check((await still.$("#player .still canvas")) !== null && (await still.$("#player > canvas")) === null, "reduced motion plays the sleeve, not the film");
  await still.close();

  const future = await newPage({ hash: "#2026-12-25" });
  check((await future.textContent("#today"))?.includes("Not pressed yet"), "a future night is not pressed yet");
  const before = await newPage({ hash: "#2026-01-01" });
  check((await before.textContent("#today"))?.includes("No record was pressed"), "a night before launch has no record");
  const old = await newPage({ hash: "#2026-10-23" });
  check((await old.textContent("#today h2"))?.length > 0 && (await old.textContent("#today"))?.includes("No. 1,"), "a #day link opens that record");
} catch (e) {
  failed = true;
  console.error(`FAIL ${e.message}`);
} finally {
  await close();
}
process.exit(failed ? 1 : 0);
