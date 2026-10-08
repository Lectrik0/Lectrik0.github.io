import { test, expect } from "@playwright/test";

test.describe("browser language", () => {
  for (const [locale, path, lang] of [["es-ES", "/es/", "es"], ["es-MX", "/es/", "es"], ["ar-EG", "/ar/", "ar"]]) {
    test(`a ${locale} browser opening the home page lands on ${path}`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({ locale, baseURL });
      const page = await context.newPage();
      await page.goto("/");
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await context.close();
    });
  }

  test("the redirect keeps the #section", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ locale: "es-ES", baseURL });
    const page = await context.newPage();
    await page.goto("/#terminal");
    await expect(page).toHaveURL(/\/es\/#terminal$/);
    await context.close();
  });

  test("English and other languages stay on the English page", async ({ browser, baseURL }) => {
    for (const locale of ["en-US", "fr-FR"]) {
      const context = await browser.newContext({ locale, baseURL });
      const page = await context.newPage();
      await page.goto("/");
      await expect(page).toHaveURL(/\/$/);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await context.close();
    }
  });

  test("a link straight to /es/ is never redirected, and a chosen language is remembered", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ locale: "es-ES", baseURL });
    const page = await context.newPage();
    await page.goto("/es/");
    await expect(page).toHaveURL(/\/es\/$/);
    await page.locator('.lang a[data-lang="en"]').click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/");   // chose English, so a Spanish browser stays on English
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.locator('.lang a[data-lang="ar"]').click();
    await expect(page).toHaveURL(/\/ar\/$/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/ar\/$/);
    await context.close();
  });
});

test.describe("translated pages", () => {
  test("Spanish: content, dates, terminal and messages are in Spanish", async ({ page }) => {
    await page.goto("/es/");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.locator("#story-h")).toHaveText("La historia hasta ahora");
    await expect(page.locator(".post time").first()).toHaveText("7 oct 2026");
    await expect(page.locator("#term-log .term-out dt").first()).toHaveText("nombre");
    await page.fill("#term-input", "sudo");
    await page.press("#term-input", "Enter");
    await expect(page.locator("#term-log")).toContainText("no está en el archivo sudoers");
    await page.fill("#flag-input", "nope");
    await page.click("#flag-form button");
    await expect(page.locator("#flag-msg")).toContainText("formato AA{...}");
    await expect(page.locator("#toggle-label")).toHaveText(/Noche|Día/);
  });

  test("Arabic: right to left, with the terminal's prompt left to right", async ({ page }) => {
    await page.goto("/ar/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("#story-h")).toHaveText("القصة حتى الآن");
    expect(await page.locator(".term-form").evaluate(e => getComputedStyle(e).direction)).toBe("ltr");
    expect(await page.locator("h1").evaluate(e => getComputedStyle(e).fontFamily)).toContain("Noto Kufi Arabic");
    await page.fill("#term-input", "foo");
    await page.press("#term-input", "Enter");
    await expect(page.locator("#term-log")).toContainText("الأمر غير موجود");
  });

  test("Arabic and Spanish pages don't scroll sideways on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    for (const path of ["/es/", "/ar/"]) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), path).toBeLessThanOrEqual(0);
    }
  });

  test("the language switch marks the current page and shows only on the home pages", async ({ page }) => {
    await page.goto("/ar/");
    await expect(page.locator('.lang a[aria-current="true"]')).toHaveAttribute("data-lang", "ar");
    await page.goto("/cv.html");
    await expect(page.locator(".lang")).toHaveCount(0);
  });
});
