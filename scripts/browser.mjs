// Builds the site, serves it, and opens it in chromium. Shared by render.mjs and smoke.mjs.
import { chromium } from "playwright-core";
import { build, preview } from "vite";

export async function openSite() {
  await build({ logLevel: "warn" });
  const server = await preview({ preview: { port: 0, strictPort: false }, logLevel: "warn" });
  const url = server.resolvedUrls.local[0];
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium",
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("page error:", e.message));
  await page.goto(url);
  return {
    page,
    async close() {
      await browser.close();
      await new Promise((r) => server.httpServer.close(r));
    },
  };
}
