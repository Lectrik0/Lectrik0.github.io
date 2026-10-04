import { test, expect } from "@playwright/test";
import { watch } from "./helpers.mjs";

test.beforeEach(async ({ page }) => {
  page.problems = await watch(page);
});
test.afterEach(async ({ page }) => {
  expect(page.problems).toEqual([]);
});

test("day/night toggle switches theme and remembers it", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const toggle = page.locator("#toggle");
  await expect(toggle).toHaveAccessibleName("Switch to night mode");
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(toggle).toHaveAccessibleName("Switch to day mode");
  await page.goto("/cv.html");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("#toggle-label")).toHaveText("Day");
});

test("flag checker accepts a real flag and rejects a wrong one", async ({ page }) => {
  await page.goto("/#flags");
  const input = page.locator("#flag-input"), msg = page.locator("#flag-msg");
  await input.fill("AA{not_a_flag}");
  await input.press("Enter");
  await expect(msg).toHaveText("That's not one of the flags. Check for typos and try again.");
  await input.fill("<script>");
  await input.press("Enter");
  await expect(msg).toHaveText(/Flags look like AA\{\.\.\.\}/);
  await input.fill("AA{v13w_s0urc3_f1rst}");
  await page.getByRole("button", { name: "Check flag" }).click();
  await expect(msg).toHaveText("Flag 1 found. 3 to go.");
  await expect(page.locator("#flag-count")).toHaveText("1 of 4 found");
  await expect(page.locator('#hints li[data-flag="0"]')).toHaveClass(/done/);
  await page.reload();
  await expect(page.locator("#flag-count")).toHaveText("1 of 4 found");
});

test("course list opens from Chapter 1 and closes again", async ({ page }) => {
  await page.goto("/");
  const dialog = page.locator("#courses-dialog");
  await page.getByRole("button", { name: "See all my courses" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".sem").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.locator("#chapter-1 .art").click();
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});

test("internship bar shows live progress", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#intern-left")).toHaveText(/^(\d+ days left|Complete)$/);
  await expect(page.locator("#intern-bar")).toHaveAttribute("aria-valuenow", /^\d+$/);
});

test("CV has a working print button and the footer shows this year", async ({ page }) => {
  await page.goto("/cv.html");
  await expect(page.locator("#print-cv")).toBeVisible();
  await expect(page.locator("#year")).toHaveText(String(new Date().getFullYear()));
});

test("panels already on screen don't jump when the script starts", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 2400 });
  await page.goto("/");
  await page.waitForTimeout(300);
  expect(await page.locator("#chapter-1").evaluate(n => n.classList.contains("wait"))).toBe(false);
});
