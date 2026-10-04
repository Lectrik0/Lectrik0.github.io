import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { cvPdf, pageCount } from "../../scripts/cv-pdf.mjs";
import { siteConfig } from "../../scripts/build.mjs";

// The CV's "Download PDF" file: rendered from cv.html by scripts/cv-pdf.mjs (CI does it on main).
test("the CV renders to a one-page PDF that links to the live site, the same every time", async () => {
  test.setTimeout(60_000);
  const [first, second] = [await cvPdf(), await cvPdf()];
  expect(pageCount(first)).toBe(1);
  expect(first.equals(second), "rendering the same CV twice should give the same file").toBe(true);
  const uris = [...first.toString("latin1").matchAll(/\/URI \(([^)]*)\)/g)].map(m => m[1]);
  expect(uris).toContain(siteConfig().url);
  expect(uris.filter(u => /127\.0\.0\.1|localhost/.test(u))).toEqual([]);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the Download PDF button gets the committed PDF", async ({ page }) => {
    await page.goto("/cv.html");
    const button = page.getByRole("link", { name: "Download PDF" });
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute("download", /\.pdf$/);
    const res = await page.request.get(new URL(await button.getAttribute("href"), page.url()).href);
    expect(res.headers()["content-type"]).toBe("application/pdf");
    const body = await res.body();
    expect(pageCount(body)).toBe(1);
    expect(body.equals(readFileSync(new URL("../../cv.pdf", import.meta.url)))).toBe(true);
  });
});
