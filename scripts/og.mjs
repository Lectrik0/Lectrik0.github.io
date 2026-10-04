#!/usr/bin/env node
/*
 * Renders assets/og.png, the 1200x630 preview image that LinkedIn, Slack, X and others show for links
 * to this site. It's the home page's hero drawing with the buttons swapped for the site address, so
 * it always matches the site. Re-run after changing the hero or the profile text:
 *
 *   npm run og      (needs Playwright's Chromium: npx playwright install chromium)
 */
import { chromium } from "@playwright/test";
import { join } from "node:path";
import { serve } from "./serve.mjs";
import { siteConfig } from "./build.mjs";

const ROOT = join(import.meta.dirname, "..");
const PORT = 4174;
const server = await serve({ port: PORT });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, reducedMotion: "reduce", bypassCSP: true });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: `
    .nav, main, footer, dialog { display: none !important; }
    .hero { padding: 26px 30px; max-width: none; }
    .splash .in { min-height: 578px; }
    .hero-copy { padding: 56px 64px; max-width: 700px; gap: 22px; }
    .hero h1 { font-size: 128px; }
    .hero .lede { font-size: 1.55rem; }
    .og-url { font: 700 1.35rem/1 var(--f-display); color: var(--teal); letter-spacing: .02em; }
  ` });
  const host = new URL(siteConfig(ROOT).url).host;
  await page.evaluate(host => {
    const btns = document.querySelector(".hero-card .btns");
    const url = document.createElement("span");
    url.className = "og-url";
    url.textContent = host;
    btns.replaceWith(url);
  }, host);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(ROOT, "assets/og.png"), clip: { x: 0, y: 0, width: 1200, height: 630 } });
  console.log("Wrote assets/og.png");
} finally {
  await browser.close();
  server.close();
}
