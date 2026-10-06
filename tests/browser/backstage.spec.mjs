// Backstage end to end, with GitHub's API simulated: content that CI would reject is caught before
// publishing, with the field named, and valid content is published.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { copyOfData, data, siteFrom, watch } from "./helpers.mjs";
import { cvPdf, pageCount } from "../../scripts/cv-pdf.mjs";

const schema = readFileSync(new URL("../../data/site.schema.json", import.meta.url), "utf8");
const REPO = "/repos/Lectrik0/Lectrik0.github.io";
const b64 = text => Buffer.from(text, "utf8").toString("base64");
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET, PUT, OPTIONS" };

// Answers Backstage's GitHub API calls. Pages listed in `existing` exist; anything else is a 404.
// `content` is the live data/site.json; `history` lists earlier commits of it ({ sha, date, message, data }).
async function fakeGitHub(page, { existing = ["cv.html", "writeups/hardening-this-site.html"], content = data, history = [] } = {}) {
  const published = [];
  await page.route("https://api.github.com/**", async route => {
    const req = route.request();
    const url = new URL(req.url()), path = decodeURIComponent(url.pathname), ref = url.searchParams.get("ref");
    const reply = (status, body) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    if (path === REPO) return reply(200, { permissions: { push: true } });
    if (path === `${REPO}/commits`) return reply(200, history.map(c => ({ sha: c.sha, commit: { message: c.message, committer: { date: c.date } } })));
    const old = history.find(c => c.sha === ref);
    if (path === `${REPO}/contents/data/site.json` && req.method() === "GET") return reply(200, { sha: "s1", content: b64(JSON.stringify(old ? old.data : content, null, 1)) });
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

async function unlock(page, { expires = "" } = {}) {
  await page.goto("/backstage/");
  const setup = page.locator("#setup-form");
  await setup.getByLabel("Username").fill("ali");
  await setup.getByLabel("Password", { exact: true }).fill("correct horse battery");
  await setup.getByLabel("Repeat password").fill("correct horse battery");
  await setup.getByLabel("GitHub token").fill("github_pat_" + "A".repeat(40));
  if (expires) await setup.getByLabel("Token expiry date (optional)").fill(expires);
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
  await item.getByLabel("Badge text", { exact: true }).fill("TC");
  await expect(problems).toBeHidden(); // the list updates while fixing

  await page.locator("#publish").click();
  await expect(page.locator("#toast")).toContainText("Published.");
  await expect(page.locator("#toast a")).toHaveText("Follow the checks");
  expect(published).toHaveLength(1);
  expect(published[0].certs.at(-1)).toEqual({ name: "Test certificate", short: "TC", status: "planned", issued: "", verify: "" });
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
  await page.getByLabel("Email", { exact: true }).fill("not an email");
  await page.getByRole("button", { name: "Certifications" }).click();
  await page.locator("#publish").click();
  await expect(page.locator("#problems li")).toHaveText(["Profile › Email Needs a valid email address, or leave it empty to hide it. Show"]);
  await page.locator("#problems li").getByRole("button", { name: "Show" }).click();
  await expect(page.getByLabel(/^Email/)).toBeFocused();
});

/* ---------- the CV must stay on one A4 page ---------- */

test("the CV tab shows how full the page is, and a CV that runs onto a second page isn't published", async ({ page }) => {
  const published = await fakeGitHub(page);
  await unlock(page);
  await page.getByRole("button", { name: "CV", exact: true }).click();
  const fit = page.locator("#cv-fit");
  await expect(fit).toHaveText(/^The CV fills \d+% of one A4 page\.$/);
  const summary = page.getByLabel("Profile summary", { exact: true });
  const before = await summary.inputValue();
  await summary.fill(Array(8).fill(before).join(" "));
  await expect(fit).toHaveAttribute("data-state", "bad");
  await page.locator("#publish").click();
  await expect(page.locator("#problems li")).toHaveText([/^CV The CV no longer fits on one A4 page \(it's \d+% of a page\)\./]);
  expect(published).toEqual([]);
  await summary.fill(before);                       // fixing it clears the problem
  await expect(page.locator("#problems")).toBeHidden();
  await expect(fit).not.toHaveAttribute("data-state", "bad");
});

// What Backstage measures has to match what CI's PDF really does, for content that fits and content that doesn't.
for (const [name, extraBullets, pages] of [["fits", 0, 1], ["runs over", 8, 2]]) {
  test(`Backstage's page check agrees with the real PDF (${name})`, async ({ page }) => {
    test.setTimeout(60_000);
    const d = copyOfData();
    d.cv.experience[0].bullets.push(...Array(extraBullets).fill("Worked with the security team on a long-running task that needed a fairly long description here."));
    const site = await siteFrom(d);
    try { expect(pageCount(await cvPdf({ root: site.root }))).toBe(pages); } finally { site.close(); }
    await fakeGitHub(page, { content: d });
    await unlock(page);
    await page.getByRole("button", { name: "CV", exact: true }).click();
    await expect(page.locator("#cv-fit")).toHaveAttribute("data-state", pages === 1 ? /ok|warn/ : "bad");
  });
}

/* ---------- earlier versions ---------- */

test("an earlier version can be loaded from History and published again", async ({ page }) => {
  const older = copyOfData();
  older.certs = older.certs.slice(1);
  const published = await fakeGitHub(page, { history: [
    { sha: "new1", date: "2026-10-05T10:00:00Z", message: "Update site content from Backstage", data },
    { sha: "old1", date: "2026-09-01T09:30:00Z", message: "Older edit\n\nwith details", data: older }
  ] });
  await unlock(page);
  await page.getByRole("button", { name: "History" }).click();
  const items = page.locator("#history-list li");
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText("live now");
  await expect(items.nth(1)).toContainText("Older edit");
  await items.nth(1).getByRole("button", { name: "Load this version" }).click();
  await expect(page.locator("#history")).toBeHidden();
  await expect(page.locator("#status")).toHaveText("Unsaved changes");
  await page.locator("#publish").click();
  await expect(page.locator("#toast")).toContainText("Published.");
  expect(published).toEqual([older]);
});

/* ---------- token expiry reminder ---------- */

const inDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

test("Backstage warns before the GitHub token expires", async ({ page }) => {
  await fakeGitHub(page);
  await unlock(page, { expires: inDays(5) });
  await expect(page.locator("#token-note")).toContainText("Your GitHub token expires in 5 days");
  await expect(page.getByRole("link", { name: "Job-fair cards" })).toHaveAttribute("href", "../card.html");
  await expect(page.locator("#token-note")).toHaveAttribute("data-state", "warn");
});

test("without an expiry date, Backstage asks for one and then shows it", async ({ page }) => {
  await fakeGitHub(page);
  await unlock(page);
  const note = page.locator("#token-note");
  await expect(note).toContainText("Add your GitHub token's expiry date");
  await note.getByLabel("Token expiry date").fill(inDays(60));
  await note.getByRole("button", { name: "Save" }).click();
  await expect(note).toContainText("GitHub token valid until");
  await expect(note).toHaveAttribute("data-state", "ok");
});
