/*
 * Views: turn data/site.json into HTML fragments for the build step.
 * Every function is pure (data in, SafeHtml out) and goes through h()/link(), so nothing from the
 * data is ever written into a page unescaped. Missing or malformed fields are skipped, not fatal.
 *
 * The views live in scripts/lib/views/, one file per part of the site. This file is the one place the
 * build and the tests import them from.
 */
export { str, arr, email, block } from "./views/shared.mjs";
export { isoDate, longDate } from "./views/dates.mjs";
export { nav, footer, meta, uiStrings } from "./views/chrome.mjs";
export { heroButtons, contactButtons, internship, skills, certs, posts } from "./views/home.mjs";
export { postList } from "./views/posts.mjs";
export { coursesSummary, semesters } from "./views/courses.mjs";
export { cvContact, cvPersonal, cvSections, cvBody, cvDownloads, cards } from "./views/cv.mjs";
export { terminal } from "./views/terminal.mjs";
export { bindings } from "./views/bindings.mjs";
