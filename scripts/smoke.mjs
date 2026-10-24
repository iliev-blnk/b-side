// Plays records on the shelf the way a visitor would and checks the player holds together.
import { mkdirSync, writeFileSync } from "node:fs";
import { recordPage } from "../src/label/page.ts";
import { entry, linerNotes } from "../src/label/record.ts";
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
  check(shelf.length === 14, `the catalogue holds all 14 records (${shelf.length})`);
  check((await page.textContent(".cat-head h3")) === "The catalogue, 14 records", "the catalogue counts them");

  check((await page.$$("#today ol.tracks li")).length === 3, "the side lists its three tracks");
  await page.click("#today .play");
  await page.waitForFunction(() => window.__playing === 1 && window.__side, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  check((await painted(page, "#player canvas.film")) > 2, "the film is drawing");
  check((await page.$$("#player .timeline .act")).length === 3, "the timeline has the three acts");

  // sit in: wait for the band, play a few notes, and share them
  await page.waitForFunction(() => window.__side.where(window.__side.time()) !== null, null, { timeout: 15000 });
  for (const k of ["a", "d", "g", "j"]) {
    await page.keyboard.down(k);
    await page.waitForTimeout(120);
    await page.keyboard.up(k);
    await page.waitForTimeout(80);
  }
  const notes = await page.evaluate(() => window.__side.take.notes.length);
  check(notes === 4, `the pads go in the take (${notes})`);
  check((await page.textContent("#player .take .count"))?.includes("4 notes"), "the take is counted");
  await page.locator("#player .knob input").first().fill("4");
  check((await page.evaluate(() => window.__side.take.moves.length)) > 0, "a knob move goes in the take");
  await page.click("#player .take .copy");
  const link = await page.evaluate(() => location.hash);
  check(/^#\d{4}-\d{2}-\d{2}\/take=[\w-]+$/.test(link), `the take is in the link (${link})`);

  // the needle can be picked up anywhere
  const box = await page.locator("#player .timeline").boundingBox();
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2);
  await page.waitForTimeout(300);
  const [at, length] = await page.evaluate(() => [window.__side.time(), window.__side.length]);
  check(Math.abs(at - length * 0.8) < 3, `scrubbing moves the needle (${at.toFixed(1)}s of ${length.toFixed(0)}s)`);

  // the take plays back from its link
  const replay = await newPage({ hash: link });
  check((await replay.textContent("#today"))?.includes("4 notes"), "a take link says what was played");
  await replay.click("#today .play");
  await replay.waitForFunction(() => window.__side, null, { timeout: 20000 });
  check((await replay.evaluate(() => window.__side.take.notes.length)) === 4, "the take comes back from the link");
  await replay.close();

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

  // the catalogue: filters, search, the month
  const cat = await newPage();
  const count = () => cat.textContent(".cat-head h3");
  const figures = () => cat.$$eval("#grid figure", (f) => f.length);
  await cat.click(".chips .chip:text-is('noir')");
  const noir = Number((await count()).split(" ")[0]);
  check(noir > 0 && noir < 14 && (await figures()) === noir, `a mood narrows the wall (${await count()})`);
  await cat.selectOption("select[aria-label='Any instrument']", { index: 1 });
  check(Number((await count()).split(" ")[0]) <= noir, `an instrument narrows it further (${await count()})`);
  await cat.click(".chips .chip:text-is('All')");
  await cat.selectOption("select[aria-label='Any instrument']", "");
  await cat.fill(".cat-head .search", "zzzz");
  check((await cat.textContent("#shelf .none"))?.includes("Nothing pressed"), "a search with no match says so");
  await cat.fill(".cat-head .search", "");
  await cat.click(".views .chip:text-is('By month')");
  check((await cat.textContent(".month-nav h4")) === "November 2026", "the month opens on this month");
  check((await cat.$$(".cal .day")).length === 30 && (await cat.$$(".cal .day .sleeve")).length === 5, "november has its five records on their dates");
  check(await cat.$eval(".month-nav .step[aria-label='Later month']", (b) => b.disabled), "there's no later month yet");
  await cat.click(".month-nav .step[aria-label='Earlier month']");
  check((await cat.textContent(".month-nav h4")) === "October 2026" && (await cat.$$(".cal .day .sleeve")).length === 9, "october has the first nine");
  await cat.close();

  // a record page, as the nightly build writes it
  const day = "2026-10-24";
  mkdirSync(`dist/r/${day}`, { recursive: true });
  writeFileSync(`dist/r/${day}/index.html`, recordPage(entry(day), linerNotes(day), {}, "2026-11-05"));
  const rec = await newPage({ path: `r/${day}/` });
  check((await rec.textContent("h1")) === entry(day).title, "a record page has its title");
  check((await rec.$$("ol.tracks li")).length === 3 && (await rec.textContent(".notes"))?.length > 200, "it lists the side and the notes");
  check((await rec.$eval("body", (b) => getComputedStyle(b).backgroundColor)) !== "rgba(0, 0, 0, 0)", "its stylesheet loads");
  await rec.click("a.play");
  await rec.waitForSelector("#today h2");
  check((await rec.textContent("#today"))?.includes("No. 2,"), "it links back to its record on the front");
  await rec.close();

  const still = await newPage({ reducedMotion: true });
  await still.click("#today .play");
  await still.waitForFunction(() => window.__playing === 1, null, { timeout: 15000 });
  check((await still.$("#player canvas.still")) !== null && (await still.$("#player canvas.film")) === null, "reduced motion plays the sleeve, not the film");
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
