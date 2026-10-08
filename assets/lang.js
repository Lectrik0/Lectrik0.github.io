"use strict";
/*
 * First visit to the English home page: if the browser's preferred language is one the site is translated
 * into, go to that translation. A visitor who picked a language with the switcher (stored by main.js as
 * "aa-lang") is sent there instead, so choosing English stays English. Only the home page "/" is
 * affected: a link straight to /es/, /ar/ or any other page is never redirected.
 * It runs in <head> before the page paints, so there is no flash of the wrong language.
 */
(() => {
  const PAGES = { en: "/", es: "/es/", ar: "/ar/" };
  if (location.pathname !== "/" && location.pathname !== "/index.html") return;
  let saved = null;
  try { saved = localStorage.getItem("aa-lang"); } catch (e) { /* storage unavailable */ }
  const preferred = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language])
    .map(l => String(l).slice(0, 2).toLowerCase()).find(l => Object.hasOwn(PAGES, l));
  const lang = Object.hasOwn(PAGES, saved) ? saved : preferred;
  if (lang && lang !== "en") location.replace(PAGES[lang] + location.hash);
})();
