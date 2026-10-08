/*
 * The languages the site is published in. English is the source: index.html (the home page template) and
 * data/site.json. Every other language has a translation file, data/i18n/<code>.json, and a folder <code>/:
 *   <code>/index.html          the home page, generated from index.html (see i18n.mjs)
 *   <code>/cv.html, <code>/writeups/*.html   hand-written translations of those pages, where a language has them
 * Adding a language: add it here, add its translation file and its font rules in assets/style.css.
 */
export const LANGS = [
  { code: "en", name: "English", short: "EN", path: "/", dir: "ltr", ogLocale: "en_GB" },
  { code: "es", name: "Español", short: "ES", path: "/es/", dir: "ltr", ogLocale: "es_ES" },
  { code: "ar", name: "العربية", short: "AR", path: "/ar/", dir: "rtl", ogLocale: "ar_EG" }
];
export const langOfPath = path => LANGS.find(l => l.path === path) || null;

/** The language a page is in, by its folder (English for everything outside the language folders). */
export const pageLang = path => LANGS.find(l => l.code !== "en" && path.startsWith(l.path)) || LANGS[0];
/** "/es/cv.html" -> "cv.html" (the same page in every language shares this). */
export const pageKey = path => path.slice(pageLang(path).path.length - (pageLang(path).code === "en" ? 1 : 0)).replace(/^\//, "");
/** The same page in each language that has it: { en: "/cv.html", es: "/es/cv.html" }. `known` is the set of all page paths. */
export const alternatesOf = (path, known) => {
  const key = pageKey(path), out = {};
  for (const l of LANGS) {
    const candidate = l.code === "en" ? `/${key}` : `${l.path}${key}`;
    if (known.has(candidate)) out[l.code] = candidate;
  }
  return out;
};
