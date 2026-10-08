/*
 * The languages the home page is published in. English is the template (index.html) and the content in
 * data/site.json; every other language has a translation in data/i18n/<code>.json and is generated into <code>/index.html.
 * Adding a language: add it here, add its translation file and its font rules in assets/style.css.
 */
export const LANGS = [
  { code: "en", name: "English", short: "EN", path: "/", dir: "ltr", ogLocale: "en_GB" },
  { code: "es", name: "Español", short: "ES", path: "/es/", dir: "ltr", ogLocale: "es_ES" },
  { code: "ar", name: "العربية", short: "AR", path: "/ar/", dir: "rtl", ogLocale: "ar_EG" }
];
export const langOfPath = path => LANGS.find(l => l.path === path) || null;
