/*
 * Translations of the home page. The English page (index.html + data/site.json) is the source of truth.
 * A translation file (data/i18n/<code>.json) has three parts:
 *   ui    the words the views write themselves (see views/ui.mjs), plus "locale" for dates
 *   data  fields of data/site.json to replace in this language (objects merge, arrays are replaced whole)
 *   text  the hand-written text in index.html: English source (as it appears in the file) -> translation
 * The build turns that into <code>/index.html. Every key in "text" has to match the template, so the English
 * page can't change without the build telling you which translations need a look.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LANGS } from "./langs.mjs";

const isObject = v => v && typeof v === "object" && !Array.isArray(v);

export function merge(base, over) {
  if (!isObject(base) || !isObject(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = merge(base[k], v);
  return out;
}

export function loadTranslation(root, code) {
  const file = join(root, "data/i18n", `${code}.json`);
  if (!existsSync(file)) throw new Error(`Missing translation file data/i18n/${code}.json`);
  const tr = JSON.parse(readFileSync(file, "utf8"));
  return { ui: {}, data: {}, text: {}, ...tr };
}

/** data/site.json in this language. */
export const localizedData = (data, tr) => merge(merge(data, tr.data), { ui: tr.ui });

const escapeAttr = s => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** Turns the English index.html into this language's page (before the build fills in its regions). */
export function localizeTemplate(html, tr, lang) {
  const meta = LANGS.find(l => l.code === lang);
  if (!meta) throw new Error(`Unknown language "${lang}"`);
  html = html.replace('<html lang="en">', `<html lang="${meta.code}" dir="${meta.dir}">`);
  // the page lives one folder down, so relative links to the site's files become absolute
  html = html.replace(/((?:href|src)=")(assets\/)/g, "$1/$2");
  for (const [source, target] of Object.entries(tr.text)) {
    let found = 0;
    // element text (the whole contents of an element, tags included) and attribute values
    const asText = `>${source}<`, asAttr = `="${escapeAttr(source)}"`;
    html = html.replaceAll(asText, () => { found++; return `>${target}<`; });
    html = html.replaceAll(asAttr, () => { found++; return `="${escapeAttr(target)}"`; });
    if (!found) throw new Error(`${lang}: translation key not found in index.html: ${source.slice(0, 70)}`);
  }
  return html;
}
