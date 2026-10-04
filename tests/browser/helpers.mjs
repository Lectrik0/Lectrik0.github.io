import { readFileSync } from "node:fs";

export const data = JSON.parse(readFileSync(new URL("../../data/site.json", import.meta.url), "utf8"));
export const SITE = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).homepage;

export const PAGES = {
  home: "/",
  cv: "/cv.html",
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
