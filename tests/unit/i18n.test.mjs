import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LANGS } from "../../scripts/lib/langs.mjs";
import { UI } from "../../scripts/lib/views/ui.mjs";
import { loadTranslation, merge } from "../../scripts/lib/i18n.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const read = f => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
const others = LANGS.filter(l => l.code !== "en");

for (const { code } of others) {
  test(`${code}: every UI string is translated, and nothing extra`, () => {
    const { ui } = loadTranslation(ROOT, code);
    const { locale, ...words } = ui;
    assert.ok(locale, "ui.locale is missing");
    assert.deepEqual(Object.keys(words).sort(), Object.keys(UI).sort());
  });

  test(`${code}: placeholders like {n} match the English text`, () => {
    const { ui } = loadTranslation(ROOT, code);
    const slots = s => (s.match(/\{\w+\}/g) || []).sort().join();
    for (const [k, v] of Object.entries(ui)) if (k in UI) assert.equal(slots(v), slots(UI[k]), k);
  });

  test(`${code}: the generated page has its language, direction and alternates`, () => {
    const html = read(`${code}/index.html`);
    const lang = LANGS.find(l => l.code === code);
    assert.match(html, new RegExp(`<html lang="${code}" dir="${lang.dir}">`));
    for (const l of LANGS) assert.match(html, new RegExp(`<link rel="alternate" hreflang="${l.code}" href="[^"]*${l.path}">`));
    assert.match(html, /hreflang="x-default"/);
    assert.match(html, new RegExp(`<link rel="canonical" href="[^"]*${lang.path}">`));
    assert.doesNotMatch(html, /(?:href|src)="assets\//, "assets must be absolute from a subfolder");
  });

  test(`${code}: the translated content keeps the same shape as the English`, () => {
    const data = JSON.parse(read("data/site.json"));
    const { data: over } = loadTranslation(ROOT, code);
    assert.equal(over.story.length, data.story.length);
    assert.equal(over.skills.length, data.skills.length);
    assert.deepEqual(over.skills.map(s => s.items.length), data.skills.map(s => s.items.length));
    assert.deepEqual(over.posts.map(p => p.url), data.posts.map(p => p.url));
    for (const k of ["education", "experience", "projects"]) assert.equal(over.cv[k].length, data.cv[k].length, k);
  });
}

test("merge replaces arrays and merges objects", () => {
  assert.deepEqual(merge({ a: { b: 1, c: 2 }, l: [1, 2] }, { a: { b: 3 }, l: [9] }), { a: { b: 3, c: 2 }, l: [9] });
});
