import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PAGES, copyOfData, siteFrom } from "./helpers.mjs";

// axe injects its own script, which the site's CSP would rightly block, so these runs bypass CSP.
test.use({ bypassCSP: true });

async function seriousProblems(page, include) {
  const builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]);
  if (include) builder.include(include);
  const { violations } = await builder.analyze();
  return violations.filter(v => v.impact === "serious" || v.impact === "critical")
    .map(v => `${v.id}: ${v.help}\n    ${v.nodes.slice(0, 5).map(n => n.target.join(" ")).join("\n    ")}`);
}

for (const scheme of ["light", "dark"]) {
  for (const [name, path] of Object.entries(PAGES)) {
    test(`${name} page has no serious accessibility problems (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await page.goto(path);
      const problems = await seriousProblems(page);
      expect(problems, problems.join("\n")).toEqual([]);
    });
  }

  test(`an earned certification with a Verify link is accessible (${scheme})`, async ({ page }) => {
    const d = copyOfData();
    d.certs.unshift({ name: "Test certificate", short: "TST", status: "earned", verify: "https://www.credly.com/badges/test" });
    const site = await siteFrom(d);
    try {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await page.goto(site.origin + "/");
      const problems = await seriousProblems(page, "#certs");
      expect(problems, problems.join("\n")).toEqual([]);
    } finally {
      site.close();
    }
  });

  test(`course list and flag messages are accessible (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await page.goto("/");
    await page.locator("#flag-input").fill("AA{v13w_s0urc3_f1rst}");
    await page.locator("#flag-input").press("Enter");
    await expect(page.locator("#flag-msg")).toHaveAttribute("data-state", "ok");
    let problems = await seriousProblems(page, "#flags");
    expect(problems, problems.join("\n")).toEqual([]);
    await page.getByRole("button", { name: "See all my courses" }).click();
    await expect(page.locator("#courses-dialog")).toBeVisible();
    problems = await seriousProblems(page, "#courses-dialog");
    expect(problems, problems.join("\n")).toEqual([]);
  });
}
