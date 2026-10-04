// Builds a copy of the site from hostile content and checks, in a real browser, that none of it runs.
import { test, expect } from "@playwright/test";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "../../scripts/build.mjs";
import { serve } from "../../scripts/serve.mjs";
import { hostileData } from "../fixtures/hostile-data.mjs";
import { PAGES, watch } from "./helpers.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const SKIP = /(^|\/)(\.git|node_modules|tests|test-results|playwright-report|_site)(\/|$)/;
let dir, server, origin;

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "site-xss-"));
  cpSync(ROOT, dir, { recursive: true, filter: src => !SKIP.test(src.slice(ROOT.length)) });
  build({ root: dir, data: hostileData() });
  server = await serve({ root: dir, port: 0 }); // any free port, so parallel workers don't clash
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(() => {
  server?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

for (const [name, path] of Object.entries(PAGES)) {
  test(`${name} page: hostile content is shown as text and nothing runs`, async ({ page }) => {
    const problems = await watch(page);
    const dialogs = [];
    page.on("dialog", d => { dialogs.push(d.message()); d.dismiss(); });
    await page.goto(origin + path, { waitUntil: "networkidle" });
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
