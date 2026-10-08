import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "../../scripts/build.mjs";
import { serve } from "../../scripts/serve.mjs";

export const data = JSON.parse(readFileSync(new URL("../../data/site.json", import.meta.url), "utf8"));
export const copyOfData = () => JSON.parse(JSON.stringify(data));
export const SITE = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).homepage;

export const PAGES = {
  home: "/",
  homeEs: "/es/",
  homeAr: "/ar/",
  cv: "/cv.html",
  cvEs: "/es/cv.html",
  writeupEs: "/es/writeups/hardening-this-site.html",
  cards: "/card.html",
  writeup: "/writeups/hardening-this-site.html",
  notFound: "/no-such-page",
  backstage: "/backstage/"
};

// Collects everything that should never happen on a page: script errors, console errors and warnings,
// CSP or Trusted Types violations, and failed requests.
export async function watch(page) {
  const problems = [];
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", e => console.error(`CSP violation: ${e.violatedDirective} blocked ${e.blockedURI || "inline code"}`));
  });
  page.on("pageerror", e => problems.push(`page error: ${e.message}`));
  page.on("console", m => {
    if (m.type() !== "error" && m.type() !== "warning") return;
    if (/status of 404/.test(m.text()) && m.location().url.includes("/no-such-page")) return; // the 404 page itself
    problems.push(`console ${m.type()}: ${m.text()}`);
  });
  page.on("requestfailed", r => problems.push(`request failed: ${r.url()} (${r.failure()?.errorText})`));
  page.on("response", r => {
    if (r.status() >= 400 && !(r.request().isNavigationRequest() && r.url().includes("/no-such-page"))) problems.push(`HTTP ${r.status()}: ${r.url()}`);
  });
  return problems;
}

// The production URL in a canonical/og tag, mapped onto the local test server.
export const local = url => url.replace(SITE, "/");

// A copy of the whole site built from other content, served on a free port. Lets tests check that the
// site (and the tests themselves) keep working when the content changes, not just with today's content.
const ROOT = new URL("../../", import.meta.url).pathname;
const SKIP = /(^|\/)(\.git|node_modules|tests|test-results|playwright-report|_site)(\/|$)/;
export async function siteFrom(content) {
  const dir = mkdtempSync(join(tmpdir(), "site-copy-"));
  cpSync(ROOT, dir, { recursive: true, filter: src => !SKIP.test(src.slice(ROOT.length)) });
  build({ root: dir, data: content });
  const server = await serve({ root: dir, port: 0 });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    root: dir,
    close() { server.close(); rmSync(dir, { recursive: true, force: true }); }
  };
}
