// Builds the site, serves it, and opens it in chromium. Shared by render.mjs and smoke.mjs.
import { chromium } from "playwright-core";
import { build, preview } from "vite";

/**
 * `now` fakes the clock (an ISO time) so the shelf can be tested on any night.
 * `newPage` opens another tab on the same build, e.g. with reduced motion, a #day link or another `path`.
 */
export async function openSite({ now } = {}) {
  await build({ logLevel: "warn" });
  const server = await preview({ preview: { port: 0, strictPort: false }, logLevel: "warn" });
  const url = server.resolvedUrls.local[0];
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium",
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const newPage = async ({ reducedMotion, hash = "", path = "" } = {}) => {
    const page = await browser.newPage({ reducedMotion: reducedMotion ? "reduce" : "no-preference" });
    if (now) await page.clock.setFixedTime(new Date(now));
    page.on("pageerror", (e) => console.error("page error:", e.message));
    await page.goto(url + path + hash);
    return page;
  };
  const page = await newPage();
  return {
    page,
    newPage,
    async close() {
      await browser.close();
      await new Promise((r) => server.httpServer.close(r));
    },
  };
}
