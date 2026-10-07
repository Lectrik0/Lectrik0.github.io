#!/usr/bin/env node
/*
 * Build: renders data/site.json into the site's pages, in place.
 *
 *   node scripts/build.mjs           update the pages and generated files
 *   node scripts/build.mjs --check   change nothing; exit 1 if anything is out of date
 *
 * The HTML files stay hand-written. The build only rewrites
 * - regions between <!-- build:name --> and <!-- /build:name --> (see REGIONS below),
 * - the text of elements marked data-bind="key" (see bindings() in lib/views.mjs),
 * - ?v= version stamps on links to files in assets/, so browsers never mix old CSS/JS with new HTML,
 * and it writes sitemap.xml, feed.xml, robots.txt and the Contact lines of .well-known/security.txt.
 * Output depends only on the repo's files (no dates, no randomness), so a second run changes nothing.
 * No dependencies: it runs on a plain Node.js 20+.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml, safeUrl } from "./lib/html.mjs";
import * as views from "./lib/views.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set([".git", ".github", "node_modules", "scripts", "tests", "infra", "test-results", "playwright-report", "_site"]);

const REGIONS = {
  nav: (data, page) => views.nav(data, page),
  footer: data => views.footer(data),
  meta: (data, page, site) => views.meta(data, page, site),
  "hero-buttons": data => views.heroButtons(data),
  "contact-buttons": data => views.contactButtons(data),
  internship: data => views.internship(data),
  skills: data => views.skills(data),
  certs: data => views.certs(data),
  posts: data => views.posts(data),
  terminal: data => views.terminal(data),
  "courses-summary": data => views.coursesSummary(data),
  semesters: data => views.semesters(data),
  "cv-contact": (data, page, site) => views.cvContact(data, site),
  "cv-personal": data => views.cvPersonal(data),
  "cv-body": data => views.cvBody(data),
  "cv-downloads": data => views.cvDownloads(data),
  cards: (data, page, site) => views.cards(data, site)
};

export function siteConfig(root = ROOT) {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const url = new URL(pkg.homepage);
  if (url.protocol !== "https:") throw new Error("package.json homepage must be an https:// URL");
  return { url: url.href.endsWith("/") ? url.href : url.href + "/" };
}

const hash = buf => createHash("sha256").update(buf).digest("hex").slice(0, 10);
const toPosix = p => p.split(sep).join("/");

function htmlFiles(root) {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith(".html"))
    .map(e => toPosix(relative(root, join(e.parentPath ?? e.path, e.name))))
    .filter(f => !f.split("/").some(part => SKIP_DIRS.has(part)))
    .sort();
}

function pageInfo(file, html, data) {
  const path = "/" + file.replace(/(^|\/)index\.html$/, "$1");
  const title = (/<title>([^<]*)<\/title>/.exec(html) || [])[1] || "";
  const description = (/<meta name="description" content="([^"]*)"/.exec(html) || [])[1] || "";
  const noindex = file === "404.html" || /<meta name="robots" content="[^"]*noindex/.test(html);
  const article = views.postList(data).find(p => safeUrl(p.url) === path) || null;
  // title and description are read straight from the HTML, where they're already escaped
  const unescape = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  return { file, path, title: unescape(title), description: unescape(description), noindex, article };
}

function renderPage(root, file, html, data, site) {
  const page = pageInfo(file, html, data);

  // 1. regions
  html = html.replace(/^([ \t]*)<!-- build:([a-z-]+) -->\n[\s\S]*?^[ \t]*<!-- \/build:\2 -->$/gm, (_, indent, name) => {
    if (!REGIONS[name]) throw new Error(`${file}: unknown build region "${name}"`);
    const body = String(REGIONS[name](data, page, site)).split("\n").map(l => (l ? indent + l : l)).join("\n");
    return `${indent}<!-- build:${name} -->\n${body}${body ? "\n" : ""}${indent}<!-- /build:${name} -->`;
  });
  const opened = (html.match(/<!-- build:/g) || []).length, closed = (html.match(/<!-- \/build:/g) || []).length;
  if (opened !== closed) throw new Error(`${file}: a build region is missing its start or end marker`);

  // 2. single text values
  const values = views.bindings(data);
  html = html.replace(/(<([a-z0-9]+)\b[^>]*\sdata-bind="([^"]+)"[^>]*>)([^<]*)(<\/\2>)/g, (whole, open, tag, key, text, close) => {
    if (!(key in values)) throw new Error(`${file}: unknown data-bind "${key}"`);
    return values[key] ? open + escapeHtml(values[key]) + close : whole;
  });

  // 3. version stamps for CSS, JS and images (fonts never change, and CSS refers to them without stamps)
  html = html.replace(/((?:href|src)=")((?:\.\.\/)*\/?assets\/(?!fonts\/)[^"?#]+)(?:\?v=[0-9a-f]+)?"/g, (_, attr, url) => {
    const target = url.startsWith("/") ? join(root, url) : join(root, dirname(file), url);
    if (!existsSync(target)) throw new Error(`${file}: ${url} doesn't exist`);
    return `${attr}${url}?v=${hash(readFileSync(target))}"`;
  });

  return { html, page };
}

const xml = s => escapeHtml(s);

function sitemap(pages, data, site) {
  const urls = pages.filter(p => !p.noindex).sort((a, b) => a.path.localeCompare(b.path)).map(p => {
    const lastmod = p.article && views.isoDate(p.article.date);
    return `  <url><loc>${xml(new URL(p.path, site.url).href)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

function feed(data, site) {
  const P = data.profile || {};
  const name = views.str(P.name);
  const posts = views.postList(data).map(p => ({ ...p, href: new URL(views.str(p.url), site.url).href, day: views.isoDate(p.date) }));
  const days = posts.map(p => p.day).filter(Boolean).sort();
  const updated = `${days.length ? days[days.length - 1] : "2026-01-01"}T00:00:00Z`;
  const entries = posts.map(p => [
    "  <entry>",
    `    <title>${xml(views.str(p.title))}</title>`,
    `    <link href="${xml(p.href)}" rel="alternate" type="text/html"/>`,
    `    <id>${xml(p.href)}</id>`,
    p.day ? `    <published>${p.day}T00:00:00Z</published>\n    <updated>${p.day}T00:00:00Z</updated>` : `    <updated>${updated}</updated>`,
    views.str(p.tag) ? `    <category term="${xml(views.str(p.tag))}"/>` : null,
    `    <summary>${xml(views.str(p.summary))}</summary>`,
    "  </entry>"
  ].filter(Boolean).join("\n"));
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <title>${xml(name)}: write-ups</title>`,
    `  <subtitle>${xml(views.str(P.tagline))}</subtitle>`,
    `  <link href="${xml(site.url)}feed.xml" rel="self" type="application/atom+xml"/>`,
    `  <link href="${xml(site.url)}" rel="alternate" type="text/html"/>`,
    `  <id>${xml(site.url)}</id>`,
    `  <updated>${updated}</updated>`,
    `  <author><name>${xml(name)}</name><uri>${xml(site.url)}</uri></author>`,
    ...entries,
    "</feed>",
    ""
  ].join("\n");
}

const robots = site => `User-agent: *\nAllow: /\n\nSitemap: ${site.url}sitemap.xml\n`;

// Keeps the hand-written parts of security.txt (comments, Expires, languages) and regenerates
// the Contact lines from the profile, plus the Canonical URL.
function securityTxt(current, data, site) {
  const P = data.profile || {};
  const email = views.email(data) && `mailto:${views.email(data)}`;
  const contacts = [email, safeUrl(P.linkedin)].filter(u => u && /^(https|mailto):/.test(u));
  if (!contacts.length) throw new Error("security.txt needs a contact: set profile.email or profile.linkedin");
  const out = [];
  let placed = false;
  for (const line of current.replace(/\n$/, "").split("\n")) {
    if (/^Contact:/i.test(line)) {
      if (!placed) { out.push(...contacts.map(c => `Contact: ${c}`)); placed = true; }
    } else if (/^Canonical:/i.test(line)) {
      out.push(`Canonical: ${site.url}.well-known/security.txt`);
    } else {
      out.push(line);
    }
  }
  if (!placed) out.splice(out.findIndex(l => !l.startsWith("#")), 0, ...contacts.map(c => `Contact: ${c}`));
  return out.join("\n") + "\n";
}

// Everything the build would write, as { "relative/path": "contents" }. Writes nothing.
export function renderSite({ root = ROOT, data } = {}) {
  data = data ?? JSON.parse(readFileSync(join(root, "data/site.json"), "utf8"));
  const site = siteConfig(root);
  const out = new Map();
  const pages = [];
  for (const file of htmlFiles(root)) {
    const { html, page } = renderPage(root, file, readFileSync(join(root, file), "utf8"), data, site);
    out.set(file, html);
    pages.push(page);
  }
  out.set("sitemap.xml", sitemap(pages, data, site));
  out.set("feed.xml", feed(data, site));
  out.set("robots.txt", robots(site));
  const sec = ".well-known/security.txt";
  out.set(sec, securityTxt(readFileSync(join(root, sec), "utf8"), data, site));
  return out;
}

// Writes (or, with check, only compares) the build output. Returns the files that changed or would change.
export function build({ root = ROOT, data, check = false } = {}) {
  const changed = [];
  for (const [file, contents] of renderSite({ root, data })) {
    const path = join(root, file);
    if (existsSync(path) && readFileSync(path, "utf8") === contents) continue;
    changed.push(file);
    if (!check) writeFileSync(path, contents);
  }
  return changed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  try {
    const changed = build({ check });
    if (check && changed.length) {
      console.error(`Out of date: ${changed.join(", ")}\nRun "npm run build" and commit the result.`);
      process.exit(1);
    }
    console.log(changed.length ? `${check ? "Would update" : "Updated"}: ${changed.join(", ")}` : "Everything is up to date.");
  } catch (err) {
    console.error(`Build failed: ${err.message}`);
    process.exit(1);
  }
}
