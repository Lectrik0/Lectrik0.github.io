import { test, expect } from "@playwright/test";
import { PAGES, copyOfData, data, local, siteFrom, watch } from "./helpers.mjs";
import { cvSections, postList } from "../../scripts/lib/views.mjs";

for (const [name, path] of Object.entries(PAGES)) {
  test.describe(`${name} page`, () => {
    test("loads with no errors, CSP violations or failed requests", async ({ page }) => {
      const problems = await watch(page);
      const res = await page.goto(path, { waitUntil: "networkidle" });
      expect(res.status()).toBe(name === "notFound" ? 404 : 200);
      await page.evaluate(() => document.fonts.ready);
      expect(problems).toEqual([]);
    });

    test("links and resources on this site all resolve", async ({ page, request, baseURL }) => {
      await page.goto(path);
      const refs = await page.$$eval("a[href], link[href], script[src], img[src]", els => els.map(e => ({
        tag: e.tagName.toLowerCase(), rel: e.getAttribute("rel") || "", target: e.getAttribute("target"), url: e.href || e.src
      })));
      const origin = new URL(baseURL).origin;
      const checked = new Map();
      for (const ref of refs) {
        const url = new URL(ref.url);
        if (url.origin !== origin) {
          expect(url.protocol, `${ref.url} should be https, mailto or tel`).toMatch(/^(https|mailto|tel):$/);
          if (ref.tag === "a" && url.protocol === "https:") {
            expect(ref.target, `${ref.url} should open in a new tab`).toBe("_blank");
            expect(ref.rel, `${ref.url} needs noopener noreferrer`).toContain("noopener");
            expect(ref.rel).toContain("noreferrer");
          }
          continue;
        }
        const key = url.origin + url.pathname + url.search;
        if (!checked.has(key)) {
          const res = await request.get(key);
          checked.set(key, { status: res.status(), body: res.headers()["content-type"]?.includes("html") ? await res.text() : "" });
        }
        const { status, body } = checked.get(key);
        expect(status, `${ref.url} on ${path}`).toBe(200);
        if (url.hash.length > 1) expect(body, `#${url.hash.slice(1)} should exist on ${url.pathname}`).toContain(`id="${decodeURIComponent(url.hash.slice(1))}"`);
      }
    });
  });
}

test.describe("search engines and link previews", () => {
  for (const path of [PAGES.home, PAGES.cv, PAGES.writeup]) {
    test(`${path} has a canonical URL and a working preview image`, async ({ page, request }) => {
      await page.goto(path);
      const canonical = await page.getAttribute('link[rel="canonical"]', "href");
      expect((await request.get(local(canonical))).status()).toBe(200);
      expect(await page.getAttribute('meta[property="og:url"]', "content")).toBe(canonical);
      const image = await page.getAttribute('meta[property="og:image"]', "content");
      const res = await request.get(local(image));
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toBe("image/png");
      const png = await res.body();
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
    });
  }

  test("sitemap, feed and robots.txt are valid and point at real pages", async ({ page, request }) => {
    await page.goto("about:blank"); // parse XML on a blank page, outside the site's Trusted Types policy
    for (const file of ["/sitemap.xml", "/feed.xml"]) {
      const text = await (await request.get(file)).text();
      const parsed = await page.evaluate(t => {
        const doc = new DOMParser().parseFromString(t, "application/xml");
        return { error: doc.querySelector("parsererror")?.textContent ?? null, root: doc.documentElement.localName,
          links: [...doc.querySelectorAll("loc, entry > link")].map(n => n.textContent || n.getAttribute("href")) };
      }, text);
      expect(parsed.error, file).toBeNull();
      expect(parsed.root).toBe(file === "/feed.xml" ? "feed" : "urlset");
      expect(parsed.links.length).toBeGreaterThan(0);
      for (const url of parsed.links) expect((await request.get(local(url))).status(), url).toBe(200);
    }
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/^Sitemap: https:\/\/\S+\/sitemap\.xml$/m);
  });
});

// What the pages must show is worked out from the content, never typed in here, so editing the
// content (e.g. adding a language in Backstage) can't make these tests fail.
const filled = (list, key) => list.filter(x => String(x[key] ?? "").trim());
// Earned certifications with a proof link get a Verify link, on the home page and the CV.
async function expectVerifyLinks(page, d, scope) {
  const verified = filled(d.certs, "name").filter(c => c.status === "earned" && /^https:\/\//.test(c.verify ?? ""));
  await expect(page.locator(`${scope} a.verify`)).toHaveCount(verified.length);
  for (const c of verified) await expect(page.locator(scope).getByRole("link", { name: `Verify ${c.name}` })).toHaveAttribute("href", c.verify);
}
const month = d => new Date(d).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

async function expectCompleteHome(page, d) {
  await expect(page.locator(".skill-col h3")).toHaveText(filled(d.skills, "group").map(g => g.group));
  await expect(page.locator(".cert h3")).toHaveText(filled(d.certs, "name").map(c => c.name));
  await expect(page.locator(".post h3")).toHaveText(postList(d).map(p => p.title)); // newest first
  await expect(page.locator("#writeups .empty")).toHaveCount(postList(d).length ? 0 : 1);
  await expect(page.locator(".sem h3")).toHaveText(filled(d.courses.semesters, "name").map(s => s.name));
  await expect(page.locator("#intern-left")).toHaveText(`${month(d.internship.start)} – ${month(d.internship.end)}`);
  await expect(page.locator(".hero-card .btn").first()).toBeVisible();
  // nothing half-filled slips through as an empty heading or list item
  expect(await page.locator("h2:empty, h3:empty, li:empty, b:empty").count()).toBe(0);
}

async function expectCompleteCV(page, d) {
  const sections = cvSections(d);
  await expect(page.locator(".sheet h2")).toHaveText(sections.map(([title]) => title));
  for (const language of d.cv.languages.filter(l => l.trim())) await expect(page.locator(".sheet .skills li", { hasText: language })).toHaveCount(1);
  // planned certifications stay off the CV
  for (const c of d.certs.filter(c => c.status === "planned" && c.name)) await expect(page.locator(".sheet", { hasText: c.name })).toHaveCount(0);
  expect(await page.locator("h2:empty, h3:empty, li:empty, b:empty").count()).toBe(0);
}

// Today's content, plus two edits of it: one with more of everything (and a half-filled entry,
// as Backstage's Add buttons make), one with optional parts emptied out.
const more = () => {
  const d = copyOfData();
  d.certs.push({ name: "Test certificate", short: "TST", status: "earned", verify: "https://www.credly.com/badges/test" }, { name: "", short: "", status: "earned" },
    { name: "Planned with a link", short: "PWL", status: "planned", verify: "https://www.credly.com/badges/later" });
  d.cv.languages.push("German (basic)", "");
  d.cv.projects.push({ title: "Home lab", stack: "Proxmox, pfSense", dates: "2027", bullets: ["Built a lab"] }, { title: "" });
  d.cv.experience.push({ title: "Volunteer", org: "Club", location: "Cairo, Egypt", dates: "2025", bullets: ["Helped"] }, { title: "" });
  d.skills.push({ group: "", note: "", color: "teal", items: [] });
  d.posts.push({ title: "An older write-up", date: "2025-01-01", tag: "Lab", summary: "Old", url: "writeups/hardening-this-site.html" });
  d.posts.reverse(); // stored oldest first: the site must still list newest first
  return d;
};
const less = () => {
  const d = copyOfData();
  Object.assign(d.cv, { languages: [], projects: [], experience: [] });
  d.posts = [];
  d.certs = [];
  return d;
};

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the home page shows all of its content", async ({ page }) => {
    await page.goto("/");
    await expectCompleteHome(page, data);
    // controls that need a script are hidden, with a note where it matters
    await expect(page.locator("#toggle")).toBeHidden();
    await expect(page.locator("#flag-form")).toBeHidden();
    const note = page.locator(".ctf-check noscript p"); // (Playwright's text matching skips <noscript>)
    await expect(note).toBeVisible();
    expect(await note.evaluate(n => n.textContent)).toContain("needs JavaScript");
  });

  test("the CV is complete", async ({ page }) => {
    await page.goto("/cv.html");
    await expectCompleteCV(page, data);
    await expect(page.getByText(data.cv.summary)).toBeVisible();
    await expect(page.locator("#print-cv")).toBeHidden();
  });

  for (const [name, content] of [["more", more], ["less", less]]) {
    test(`pages follow edited content (${name})`, async ({ page }) => {
      const d = content();
      const site = await siteFrom(d);
      try {
        await page.goto(site.origin + "/");
        await expectCompleteHome(page, d);
        await expectVerifyLinks(page, d, "#certs");
        await page.goto(site.origin + "/cv.html");
        await expectCompleteCV(page, d);
        await expectVerifyLinks(page, d, ".sheet");
      } finally {
        site.close();
      }
    });
  }
});
