import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, h, link, raw, safeUrl } from "../../scripts/lib/html.mjs";

test("escapeHtml escapes everything that can break out of text or an attribute", () => {
  assert.equal(escapeHtml(`<a href="x" onclick='y'>&</a>`), "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
});

test("safeUrl allows https, mailto and same-site paths only", () => {
  assert.equal(safeUrl("https://github.com/Lectrik0"), "https://github.com/Lectrik0");
  assert.equal(safeUrl("mailto:me@example.com"), "mailto:me@example.com");
  assert.equal(safeUrl("cv.html"), "/cv.html");
  assert.equal(safeUrl("writeups/x.html#part"), "/writeups/x.html#part");
  assert.equal(safeUrl("/feed.xml"), "/feed.xml");
  for (const bad of ["javascript:alert(1)", " JaVaScRiPt:alert(1)", "java\tscript:alert(1)", "data:text/html,<script>", "vbscript:x", "http://example.com", "file:///etc/passwd", "", "   ", null, 42, {}]) {
    assert.equal(safeUrl(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test("h escapes text and attributes", () => {
  assert.equal(String(h("p", { title: `"><script>` }, "<b>hi</b>")), `<p title="&quot;&gt;&lt;script&gt;">&lt;b&gt;hi&lt;/b&gt;</p>`);
  assert.equal(String(h("p", {}, raw("<b>trusted</b>"))), "<p><b>trusted</b></p>");
  assert.equal(String(h("br")), "<br>");
});

test("h refuses event handlers, inline styles and odd names", () => {
  assert.throws(() => h("img", { onerror: "alert(1)" }));
  assert.throws(() => h("img", { OnLoad: "alert(1)" }));
  assert.throws(() => h("div", { style: "color:red" }));
  assert.throws(() => h("div", { 'a"b': "x" }));
  assert.throws(() => h("scr ipt"));
});

test("h drops unsafe URLs from URL attributes", () => {
  assert.equal(String(h("a", { href: "javascript:alert(1)" }, "x")), "<a>x</a>");
  assert.equal(String(h("img", { src: "data:image/svg+xml,<svg onload=alert(1)>" })), "<img>");
  assert.equal(String(h("a", { href: "#flags" }, "x")), `<a href="#flags">x</a>`);
});

test("link opens other sites safely and skips unsafe links entirely", () => {
  assert.equal(String(link("https://example.com", { class: "btn" }, "x")),
    `<a href="https://example.com/" target="_blank" rel="noopener noreferrer" class="btn">x</a>`);
  assert.equal(String(link("cv.html", {}, "CV")), `<a href="/cv.html">CV</a>`);
  assert.equal(link("javascript:alert(1)", {}, "x"), null);
});
