import { test, expect } from "@playwright/test";
import { watch, data } from "./helpers.mjs";

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

test.describe("terminal", () => {
  const run = async (page, command) => { await page.locator("#term-input").fill(command); await page.locator("#term-input").press("Enter"); };

  test("starts with whoami, and answers typed commands and tapped ones", async ({ page }) => {
    await page.goto("/#terminal");
    const log = page.locator("#term-log");
    await expect(log).toContainText(data.profile.tagline);
    await run(page, "skills");
    for (const group of data.skills.filter(g => g.group)) await expect(log).toContainText(group.group);
    await expect(log).toContainText(data.skills[0].items[0]);
    await page.getByRole("button", { name: "projects", exact: true }).click();
    await expect(log).toContainText(data.cv.projects[0].title);
    await run(page, "  CONTACT  ");   // spaces and capitals don't matter
    await expect(log.getByRole("link", { name: data.profile.email })).toHaveAttribute("href", `mailto:${data.profile.email}`);
    await run(page, "cv");
    await expect(log.getByRole("link", { name: "Download the PDF" })).toHaveAttribute("download", /-CV\.pdf$/);
  });

  test("a tapped command types itself out first, or runs at once with reduced motion", async ({ page }) => {
    await page.goto("/#terminal");
    const input = page.locator("#term-input"), log = page.locator("#term-log");
    await page.getByRole("button", { name: "certs", exact: true }).click();
    await expect(input).toHaveValue(/^c/);                       // being typed
    await expect(log).toContainText(data.certs[0].name);         // then run
    await expect(input).toHaveValue("");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "experience", exact: true }).click();
    await expect(log).toContainText(data.cv.experience[0].title, { timeout: 100 });
    await expect(input).toHaveValue("");
  });

  test("handles unknown commands, extras, history, completion and clear", async ({ page }) => {
    await page.goto("/#terminal");
    const input = page.locator("#term-input"), log = page.locator("#term-log");
    await run(page, "nope");
    await expect(log).toContainText("nope: command not found");
    await run(page, "sudo rm -rf /");
    await expect(log).toContainText("not in the sudoers file");
    await run(page, "cat flag.txt");
    await expect(log).toContainText("see the hints under Hidden flags");
    expect(await log.evaluate(n => n.textContent)).not.toMatch(/AA\{/);   // the terminal never gives a flag away
    await input.press("ArrowUp");
    await expect(input).toHaveValue("cat flag.txt");
    await input.press("ArrowUp");
    await expect(input).toHaveValue("sudo rm -rf /");
    await input.press("ArrowDown");
    await input.press("ArrowDown");
    await expect(input).toHaveValue("");
    await input.fill("exper");
    await input.press("Tab");
    await expect(input).toHaveValue("experience ");
    await input.fill("zzz");
    await input.press("Tab");   // nothing to complete: Tab must not be trapped
    await expect(input).not.toBeFocused();
    await run(page, "clear");
    await expect(log.locator(".term-cmd")).toHaveCount(0);
  });

  test("shows what a visitor types as text, never as HTML", async ({ page }) => {
    await page.goto("/#terminal");
    const payload = "<img src=x onerror=alert(1)>";
    await run(page, `echo ${payload}`);
    await run(page, payload);
    await expect(page.locator("#term-log")).toContainText(`echo ${payload}`);
    await expect(page.locator("#term-log img, #term-log script")).toHaveCount(0);
  });

  test("output is announced politely, but only after the visitor starts using it", async ({ page }) => {
    await page.goto("/#terminal");
    await expect(page.locator("#term-log")).toHaveAttribute("aria-live", "off");
    await page.locator("#term-input").focus();
    await expect(page.locator("#term-log")).toHaveAttribute("aria-live", "polite");
  });
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
