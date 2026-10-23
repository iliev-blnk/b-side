// Clicks two moods in quick succession and checks only one record is playing.
import { openSite } from "./browser.mjs";

const { page, close } = await openSite();
try {
  await page.click('button[data-mood="noir"]');
  await page.waitForTimeout(300);
  await page.click('button[data-mood="chase"]');
  await page.waitForFunction(() => document.querySelector("#info")?.textContent?.startsWith("chase"), null, { timeout: 15000 });
  await page.waitForTimeout(1000);
  const playing = await page.evaluate(() => window.__playing);
  const info = await page.textContent("#info");
  if (playing !== 1) throw new Error(`expected 1 record playing, got ${playing}`);
  await page.click("#stop");
  const after = await page.evaluate(() => window.__playing);
  if (after !== 0) throw new Error(`expected 0 after stop, got ${after}`);
  console.log(`ok  ${info}`);
} finally {
  await close();
}
