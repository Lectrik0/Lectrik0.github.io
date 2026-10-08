import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { build, renderSite, siteConfig } from "../../scripts/build.mjs";
import { postList } from "../../scripts/lib/views.mjs";
import { hostileData, PAYLOAD } from "../fixtures/hostile-data.mjs";

const read = f => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
const SITE = siteConfig().url;

test("committed pages are up to date with data/site.json (run `npm run build` if this fails)", () => {
  assert.deepEqual(build({ check: true }), []);
});

test("the build is deterministic", () => {
  assert.deepEqual([...renderSite()], [...renderSite()]);
});

test("hostile content is rendered as text, and unsafe links are dropped", () => {
  const out = renderSite({ data: hostileData() });
  const escaped = PAYLOAD.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  for (const [file, text] of out) {
    if (!file.endsWith(".html")) continue;
    assert.ok(!text.includes("<img src=x"), `${file}: raw <img> payload`);
    assert.ok(!text.includes("<script>alert"), `${file}: raw <script> payload`);
    assert.ok(!/<svg onload/i.test(text), `${file}: raw <svg onload> payload`);
    assert.ok(!/(href|src)="\s*(javascript|data|vbscript|http):/i.test(text), `${file}: unsafe URL in a link`);
  }
  assert.ok(out.get("index.html").includes(escaped), "payload should appear, escaped, on the home page");
  // JSON-LD can't be closed early from inside the data
  const ld = /<script type="application\/ld\+json">([^]*?)<\/script>/.exec(out.get("index.html"))[1];
  assert.ok(!ld.includes("<"), "JSON-LD must not contain a raw <");
  assert.doesNotThrow(() => JSON.parse(ld));
  // XML outputs stay well-formed: no raw < or & from the data
  for (const f of ["feed.xml", "sitemap.xml"]) {
    const body = out.get(f).replace(/<\/?[a-zA-Z?][^<>]*>/g, "");
    assert.ok(!/[<>]|&(?!(amp|lt|gt|quot|#39);)/.test(body), `${f}: unescaped markup`);
  }
});

test("the build refuses to publish a security.txt with no way to make contact", () => {
  const data = hostileData();
  data.profile.linkedin = "javascript:alert(1)";
  assert.throws(() => renderSite({ data }), /security\.txt needs a contact/);
});

test("every page gets a canonical URL and social preview tags, except the 404 page", () => {
  const writeups = readdirSync(new URL("../../writeups/", import.meta.url)).filter(f => f.endsWith(".html")).map(f => `writeups/${f}`);
  for (const f of ["index.html", "cv.html", ...writeups]) {
    const html = read(f);
    assert.match(html, new RegExp(`<link rel="canonical" href="${SITE.replace(/\./g, "\\.")}[^"]*">`), f);
    for (const p of ["og:title", "og:description", "og:url", "og:image", "og:type"]) assert.match(html, new RegExp(`property="${p}" content="[^"]+"`), `${f}: ${p}`);
    assert.match(html, /name="twitter:card" content="summary_large_image"/, f);
  }
  assert.match(read("writeups/hardening-this-site.html"), /property="og:type" content="article"/);
  assert.match(read("404.html"), /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(read("404.html"), /rel="canonical"/);
});

test("sitemap lists the indexable pages and nothing else", () => {
  const locs = [...read("sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(SITE, "/"));
  const writeups = readdirSync(new URL("../../writeups/", import.meta.url)).filter(f => f.endsWith(".html")).map(f => `/writeups/${f}`);
  assert.deepEqual([...locs].sort(), ["/", "/es/", "/ar/", "/cv.html", "/es/cv.html", ...writeups, ...writeups.map(w => `/es${w}`), ...writeups.map(w => `/ar${w}`)].sort());
  assert.match(read("robots.txt"), new RegExp(`^Sitemap: ${SITE}sitemap\\.xml$`, "m"));
});

test("feed has one entry per write-up, newest first", () => {
  const data = JSON.parse(read("data/site.json"));
  const ids = [...read("feed.xml").matchAll(/<entry>\s*<title>[^<]*<\/title>\s*<link href="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(ids, postList(data).map(p => new URL(p.url, SITE).href));
});

test("write-ups are listed newest first, whatever order they're stored in", () => {
  const data = JSON.parse(read("data/site.json"));
  const post = (title, date) => ({ title, date, tag: "", summary: "", url: "writeups/hardening-this-site.html" });
  data.posts = [post("Middle", "2026-05-01"), post("Oldest", "2025-01-01"), post("Newest", "2026-10-04")];
  const html = renderSite({ data }).get("index.html");
  assert.deepEqual([...html.matchAll(/<a[^>]*class="post"[^>]*>.*?<h3>([^<]+)<\/h3>/g)].map(m => m[1]), ["Newest", "Middle", "Oldest"]);
});

test("half-filled entries are left out instead of showing up empty", () => {
  const data = JSON.parse(read("data/site.json"));
  data.certs.push({ name: "", short: "", status: "earned" });
  data.skills.push({ group: " ", note: "", color: "teal", items: [""] });
  data.cv.languages.push("");
  data.cv.projects.push({ title: "" });
  data.courses.semesters.push({ name: "", status: "upcoming", courses: [{ name: "", ects: 5 }] });
  const out = renderSite({ data });
  for (const f of ["index.html", "cv.html"]) {
    assert.doesNotMatch(out.get(f), /<(h2|h3|li|b)>\s*<\/\1>|<b>:<\/b>/, `${f} has an empty element`);
  }
  assert.equal(out.get("index.html"), renderSite().get("index.html"), "blank entries shouldn't change the home page at all");
});

test("a Verify link shows only on earned certifications, and only for https links", () => {
  const data = JSON.parse(read("data/site.json"));
  data.certs = [
    { name: "Earned one", short: "E", status: "earned", verify: "https://www.credly.com/badges/abc" },
    { name: "Not yet", short: "N", status: "progress", verify: "https://www.credly.com/badges/def" },
    { name: "Bad link", short: "B", status: "earned", verify: "javascript:alert(1)" },
    { name: "Same site", short: "S", status: "earned", verify: "cv.html" },
    { name: "No link", short: "L", status: "earned", verify: "" }
  ];
  const out = renderSite({ data });
  const link = '<a href="https://www.credly.com/badges/abc" target="_blank" rel="noopener noreferrer" class="verify" aria-label="Verify Earned one">';
  // the home page shows it twice: in the certifications section and in the terminal's certs command
  for (const [f, count] of [["index.html", 2], ["cv.html", 1]]) {
    const links = [...out.get(f).matchAll(/<a [^>]*class="verify"[^>]*>/g)].map(m => m[0]);
    assert.deepEqual(links, Array(count).fill(link), f);
  }
});

test("the terminal's commands are built from the content, and say so when a section is empty", () => {
  const data = JSON.parse(read("data/site.json"));
  const html = d => renderSite({ data: d }).get("index.html");
  const block = (page, cmd) => new RegExp(`<div class="term-block" data-cmd="${cmd}"[^>]*>[^]*?\\n    </div>`).exec(page)?.[0] ?? "";
  data.skills = [{ group: "Group A", note: "", color: "teal", items: ["Alpha", "Beta"] }];
  data.cv.projects = [{ title: "Home lab", stack: "Proxmox", dates: "2027", bullets: ["Built a lab", ""] }];
  let page = html(data);
  assert.match(block(page, "skills"), /<dt>Group A<\/dt><dd>Alpha, Beta<\/dd>/);
  assert.match(block(page, "projects"), /<b>Home lab<\/b> <span class="term-dim">Proxmox<\/span>[^]*<li>Built a lab<\/li>/);
  assert.doesNotMatch(block(page, "projects"), /<li><\/li>/);
  for (const cmd of ["help", "whoami", "skills", "projects", "certs", "education", "experience", "writeups", "contact", "cv", "flags"]) {
    assert.ok(block(page, cmd), `no output block for ${cmd}`);
    assert.ok(page.includes(`data-run="${cmd}"`), `no button for ${cmd}`);
  }
  // emptied out: the commands still answer
  Object.assign(data.cv, { projects: [], experience: [], education: [] });
  Object.assign(data, { skills: [], certs: [], posts: [] });
  page = html(data);
  for (const cmd of ["skills", "projects", "certs", "education", "experience", "writeups"]) assert.match(block(page, cmd), /Nothing here yet\./, cmd);
  // only a few commands show without JavaScript
  assert.deepEqual([...page.matchAll(/data-cmd="(\w+)" data-static/g)].map(m => m[1]), ["whoami", "skills", "projects", "contact"]);
});

test("a semester studied abroad is marked in the course list", () => {
  const data = JSON.parse(read("data/site.json"));
  data.courses.semesters.forEach((s, i) => { s.abroad = i === 0 ? "GIU Berlin, Germany" : ""; });
  const html = renderSite({ data }).get("index.html");
  assert.equal([...html.matchAll(/<section class="sem [a-z]+ abroad">/g)].length, 1);
  assert.match(html, /<p class="sem-abroad"><svg[^>]*>.*?<\/svg><span>Abroad: <b>GIU Berlin, Germany<\/b><\/span><\/p>/);
});

test("CV sections appear when they get content and disappear when emptied", () => {
  const data = JSON.parse(read("data/site.json"));
  data.cv.languages = ["Arabic (native)"];
  data.cv.skills = [];
  assert.match(renderSite({ data }).get("cv.html"), /<h2>Skills<\/h2>\s*<ul class="skills">\s*<li><b>Spoken languages:<\/b> Arabic \(native\)<\/li>/);
  data.cv.languages = [];
  assert.doesNotMatch(renderSite({ data }).get("cv.html"), /<h2>Skills<\/h2>|Spoken languages/);
});

test("security.txt is valid and not about to expire", () => {
  const txt = read(".well-known/security.txt");
  assert.match(txt, /^Contact: (https|mailto):\S+$/m);
  assert.match(txt, /^Canonical: https:\/\/lectrik0\.github\.io\/\.well-known\/security\.txt$/m);
  const expires = Date.parse(/^Expires: (\S+)$/m.exec(txt)[1]);
  const days = (expires - Date.now()) / 864e5;
  assert.ok(days > 0, "security.txt has expired: set a new Expires date (at most a year ahead)");
  assert.ok(days <= 366, "RFC 9116 recommends an Expires date less than a year ahead");
  if (days < 30) console.log(`::warning file=.well-known/security.txt::security.txt expires in ${Math.floor(days)} days`);
});
