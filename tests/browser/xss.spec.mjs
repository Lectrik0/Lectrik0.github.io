// Builds a copy of the site from hostile content and checks, in a real browser, that none of it runs.
import { test, expect } from "@playwright/test";
import { hostileData } from "../fixtures/hostile-data.mjs";
import { PAGES, siteFrom, watch } from "./helpers.mjs";

let site;
test.beforeAll(async () => { site = await siteFrom(hostileData()); });
test.afterAll(() => site?.close());

for (const [name, path] of Object.entries(PAGES)) {
  test(`${name} page: hostile content is shown as text and nothing runs`, async ({ page }) => {
    const problems = await watch(page);
    const dialogs = [];
    page.on("dialog", d => { dialogs.push(d.message()); d.dismiss(); });
    await page.goto(site.origin + path, { waitUntil: "networkidle" });
    await page.locator("#open-courses").click({ timeout: 1000 }).catch(() => {});
    expect(dialogs).toEqual([]);
    expect(problems).toEqual([]);
    const injected = await page.evaluate(() => ({
      handlers: document.querySelectorAll("[onerror], [onload], [onclick]").length,
      inlineScripts: document.querySelectorAll('script:not([src]):not([type="application/ld+json"])').length,
      badLinks: [...document.querySelectorAll("a[href]")].filter(a => !/^(https|mailto):$/.test(new URL(a.href).protocol) && new URL(a.href).origin !== location.origin).length
    }));
    expect(injected).toEqual({ handlers: 0, inlineScripts: 0, badLinks: 0 });
  });
}
