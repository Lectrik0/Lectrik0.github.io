import { test, expect } from "@playwright/test";
import { PAGES, data, local, watch } from "./helpers.mjs";

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
          expect(url.protocol, `${ref.url} should be https or mailto`).toMatch(/^(https|mailto):$/);
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

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the home page shows all of its content", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".skill-col")).toHaveCount(data.skills.length);
    await expect(page.locator(".cert")).toHaveCount(data.certs.length);
    await expect(page.locator(".post")).toHaveCount(data.posts.length);
    await expect(page.locator(".sem")).toHaveCount(data.courses.semesters.length);
    await expect(page.locator("#hero-buttons, .hero-card .btn").first()).toBeVisible();
    await expect(page.getByText("Jul 2026 – Jan 2027")).toBeVisible();
    // controls that need a script are hidden, with a note where it matters
    await expect(page.locator("#toggle")).toBeHidden();
    await expect(page.locator("#flag-form")).toBeHidden();
    const note = page.locator(".ctf-check noscript p"); // (Playwright's text matching skips <noscript>)
    await expect(note).toBeVisible();
    expect(await note.evaluate(n => n.textContent)).toContain("needs JavaScript");
  });

  test("the CV is complete", async ({ page }) => {
    await page.goto("/cv.html");
    await expect(page.locator(".cv h2")).toHaveText(["Profile", "Education", "Experience", "Projects", "Certifications", "Skills"]);
    await expect(page.getByText(data.cv.summary)).toBeVisible();
    await expect(page.locator("#print-cv")).toBeHidden();
  });
});
