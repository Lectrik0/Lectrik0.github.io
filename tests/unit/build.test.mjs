import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build, renderSite } from "../../scripts/build.mjs";
import { hostileData, PAYLOAD } from "../fixtures/hostile-data.mjs";

const read = f => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

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
  for (const f of ["index.html", "cv.html", "writeups/hardening-this-site.html"]) {
    const html = read(f);
    assert.match(html, /<link rel="canonical" href="https:\/\/lectrik0\.github\.io\/[^"]*">/, f);
    for (const p of ["og:title", "og:description", "og:url", "og:image", "og:type"]) assert.match(html, new RegExp(`property="${p}" content="[^"]+"`), `${f}: ${p}`);
    assert.match(html, /name="twitter:card" content="summary_large_image"/, f);
  }
  assert.match(read("writeups/hardening-this-site.html"), /property="og:type" content="article"/);
  assert.match(read("404.html"), /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(read("404.html"), /rel="canonical"/);
});

test("sitemap lists the indexable pages and nothing else", () => {
  const locs = [...read("sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.deepEqual(locs, ["https://lectrik0.github.io/", "https://lectrik0.github.io/cv.html", "https://lectrik0.github.io/writeups/hardening-this-site.html"]);
  assert.match(read("robots.txt"), /^Sitemap: https:\/\/lectrik0\.github\.io\/sitemap\.xml$/m);
});

test("feed has one entry per write-up", () => {
  const data = JSON.parse(read("data/site.json"));
  const feed = read("feed.xml");
  assert.equal((feed.match(/<entry>/g) || []).length, data.posts.length);
  for (const p of data.posts) assert.ok(feed.includes(`<link href="https://lectrik0.github.io/${p.url}"`), p.url);
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
