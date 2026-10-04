// Backstage end to end, with GitHub's API simulated: content that CI would reject is caught before
// publishing, with the field named, and valid content is published.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { data, watch } from "./helpers.mjs";

const schema = readFileSync(new URL("../../data/site.schema.json", import.meta.url), "utf8");
const REPO = "/repos/Lectrik0/Lectrik0.github.io";
const b64 = text => Buffer.from(text, "utf8").toString("base64");
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET, PUT, OPTIONS" };

// Answers Backstage's GitHub API calls. Pages listed in `existing` exist; anything else is a 404.
async function fakeGitHub(page, { existing = ["cv.html", "writeups/hardening-this-site.html"] } = {}) {
  const published = [];
  await page.route("https://api.github.com/**", async route => {
    const req = route.request();
    const path = decodeURIComponent(new URL(req.url()).pathname);
    const reply = (status, body) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (path === REPO) return reply(200, { permissions: { push: true } });
    if (path === `${REPO}/contents/data/site.json` && req.method() === "GET") return reply(200, { sha: "s1", content: b64(JSON.stringify(data, null, 1)) });
    if (path === `${REPO}/contents/data/site.schema.json`) return reply(200, { sha: "s2", content: b64(schema) });
    if (path === `${REPO}/contents/data/site.json` && req.method() === "PUT") {
      const body = JSON.parse(req.postData());
      published.push(JSON.parse(Buffer.from(body.content, "base64").toString("utf8")));
      return reply(200, { content: { sha: "s3" }, commit: { html_url: "https://github.com/x" } });
    }
    const file = path.slice(`${REPO}/contents/`.length);
    if (path.startsWith(`${REPO}/contents/`)) return existing.includes(file) ? reply(200, { sha: "x" }) : reply(404, { message: "Not Found" });
    return reply(404, { message: "Not Found" });
  });
  return published;
}

async function unlock(page) {
  await page.goto("/backstage/");
  const setup = page.locator("#setup-form");
  await setup.getByLabel("Username").fill("ali");
  await setup.getByLabel("Password", { exact: true }).fill("correct horse battery");
  await setup.getByLabel("Repeat password").fill("correct horse battery");
  await setup.getByLabel("GitHub token").fill("github_pat_" + "A".repeat(40));
  await setup.getByRole("button", { name: "Encrypt and save" }).click();
  await expect(page.locator("#status")).toHaveText("Up to date with the live site", { timeout: 15000 });
}

test.beforeEach(async ({ page }) => { page.problems = await watch(page); });
test.afterEach(async ({ page }) => { expect(page.problems).toEqual([]); });

test("a half-filled certification is caught before publishing, then published once filled in", async ({ page }) => {
  const published = await fakeGitHub(page);
  await unlock(page);
  await page.getByRole("button", { name: "Certifications" }).click();
  await page.getByRole("button", { name: "Add certification" }).click();
  const item = page.locator("details.bs-item").last();
  await expect(item.getByLabel("Status")).toHaveValue("planned"); // a new certification isn't claimed as earned

  await page.locator("#publish").click();
  const problems = page.locator("#problems");
  await expect(problems).toBeVisible();
  const n = data.certs.length + 1;
  await expect(problems.locator("li")).toHaveText([
    `Certifications › #${n} (New certification) › Name Can't be empty. Show`,
    `Certifications › #${n} (New certification) › Badge text Can't be empty. Show`
  ]);
  await expect(item.getByLabel("Name")).toHaveAttribute("aria-invalid", "true");
  expect(published).toEqual([]);

  await item.getByLabel("Name").fill("Test certificate");
  await item.getByLabel("Badge text (max 7 characters, e.g. AZ-900)").fill("TC");
  await expect(problems).toBeHidden(); // the list updates while fixing

  await page.locator("#publish").click();
  await expect(page.locator("#toast")).toContainText("Published.");
  await expect(page.locator("#toast a")).toHaveText("Follow the checks");
  expect(published).toHaveLength(1);
  expect(published[0].certs.at(-1)).toEqual({ name: "Test certificate", short: "TC", status: "planned", verify: "" });
});

test("a write-up linking to a page that doesn't exist yet is caught", async ({ page }) => {
  const published = await fakeGitHub(page);
  await unlock(page);
  await page.getByRole("button", { name: "Write-ups" }).click();
  const link = page.locator("details.bs-item").first().getByLabel("Link");
  await link.fill("writeups/not-written-yet.html");
  await page.locator("#publish").click();
  await expect(page.locator("#problems li")).toContainText(["There's no page at writeups/not-written-yet.html yet."]);
  expect(published).toEqual([]);
  // GitHub's 404 for the missing page is how Backstage finds out, so it's expected here
  page.problems = page.problems.filter(p => !p.includes("not-written-yet.html") && !p.includes("status of 404"));
});

test("'Show' jumps to the field with the problem, on another tab", async ({ page }) => {
  await fakeGitHub(page);
  await unlock(page);
  await page.getByLabel("Email (shown on the home page, the CV and in security.txt; leave empty to hide)").fill("not an email");
  await page.getByRole("button", { name: "Certifications" }).click();
  await page.locator("#publish").click();
  await expect(page.locator("#problems li")).toHaveText(["Profile › Email Needs a valid email address, or leave it empty to hide it. Show"]);
  await page.locator("#problems li").getByRole("button", { name: "Show" }).click();
  await expect(page.getByLabel(/^Email/)).toBeFocused();
});
