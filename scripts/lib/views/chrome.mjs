/*
 * Page chrome: navigation, footer and the <head> tags (canonical URL, social previews, feed, JSON-LD).
 */
import { h, raw, safeUrl } from "../html.mjs";
import { str, arr, obj, email, block } from "./shared.mjs";
import { isoDate } from "./dates.mjs";
import { ICON_PATHS } from "./icons.mjs";
import { t, jsStrings } from "./ui.mjs";
import { LANGS, langOfPath } from "../langs.mjs";

const NAV = ["story", "skills", "certs", "writeups", "terminal", "flags", "cv", "contact"];

// EN / ES / AR links: each goes to the same page in that language, and only languages that have it are listed.
function languageSwitch(data, page) {
  const links = LANGS.filter(l => page.alternates[l.code]);
  if (links.length < 2) return null;
  return block("div", { class: "lang", role: "group", "aria-label": t(data, "language") }, links.map(l =>
    h("a", { href: page.alternates[l.code], hreflang: l.code, title: l.name, "aria-current": l === page.lang ? "true" : null, "data-lang": l.code }, l.short)));
}

export function nav(data, page) {
  const lang = page.lang, home = page.path === lang.path;
  // the CV is only linked in a language that has one; otherwise the English CV
  const cvPath = page.known?.has(`${lang.path}cv.html`) ? `${lang.path}cv.html` : "/cv.html";
  const items = NAV.map(id => {
    const href = id === "cv" ? cvPath : `${home ? "" : lang.path}#${id}`;
    return h("li", {}, h("a", { href, "aria-current": page.path === cvPath && id === "cv" ? "page" : null }, t(data, id)));
  });
  return block("nav", { class: "nav", "aria-label": t(data, "navLabel") }, [
    block("div", { class: "wrap" }, [
      h("a", { class: "brand", href: home ? "#top" : lang.path }, str(obj(data.profile).name)),
      block("ul", {}, items),
      languageSwitch(data, page),
      h("button", { class: "toggle", id: "toggle", type: "button", "aria-label": t(data, "toNight"),
        "data-day": t(data, "day"), "data-night": t(data, "night"), "data-to-day": t(data, "toDay"), "data-to-night": t(data, "toNight") },
        h("svg", { viewBox: "0 0 16 16", "aria-hidden": "true" }, h("path", { id: "toggle-icon", fill: "currentColor", d: ICON_PATHS.moon })),
        h("span", { id: "toggle-label" }, t(data, "night")))
    ])
  ]);
}

export function footer(data) {
  const P = obj(data.profile);
  const city = str(P.location).split(",")[0].trim();
  // The year is filled in by main.js; this is the fallback without JavaScript.
  const years = [...arr(data.posts).map(p => p.date), obj(data.internship).start].map(isoDate).filter(Boolean).sort();
  const year = years.length ? years[years.length - 1].slice(0, 4) : "";
  return block("footer", {}, [
    block("div", { class: "wrap" }, [h("span", {}, [str(P.name), city].filter(Boolean).join(", ")), h("span", { id: "year" }, year)])
  ]);
}

/* ---------- <head>: canonical URL, social previews, feed ---------- */
export function meta(data, page, site) {
  const P = obj(data.profile);
  const tags = [];
  if (page.noindex) {
    tags.push(h("meta", { name: "robots", content: "noindex" }));
  } else {
    const url = new URL(page.path, site.url).href;
    const image = new URL("assets/og.png", site.url).href;
    tags.push(
      h("link", { rel: "canonical", href: url }),
      h("meta", { property: "og:type", content: page.article ? "article" : langOfPath(page.path) ? "profile" : "website" }),
      h("meta", { property: "og:site_name", content: str(P.name) }),
      h("meta", { property: "og:title", content: page.title }),
      h("meta", { property: "og:description", content: page.description }),
      h("meta", { property: "og:url", content: url }),
      h("meta", { property: "og:image", content: image }),
      h("meta", { property: "og:image:width", content: "1200" }),
      h("meta", { property: "og:image:height", content: "630" }),
      h("meta", { property: "og:image:alt", content: `${str(P.name)}: ${str(P.tagline)}` }),
      h("meta", { property: "og:locale", content: page.lang.ogLocale }),
      page.article && isoDate(page.article.date) ? h("meta", { property: "article:published_time", content: isoDate(page.article.date) }) : null,
      h("meta", { name: "twitter:card", content: "summary_large_image" })
    );
  }
  tags.push(h("link", { rel: "alternate", type: "application/atom+xml", title: `${str(P.name)}: write-ups`, href: "/feed.xml" }));
  // the same page in the other languages (each one lists all of them, itself included)
  const versions = Object.entries(page.alternates);
  if (versions.length > 1) {
    tags.push(...versions.map(([code, path]) => h("link", { rel: "alternate", hreflang: code, href: new URL(path, site.url).href })),
      h("link", { rel: "alternate", hreflang: "x-default", href: new URL(page.alternates.en, site.url).href }));
  }
  if (langOfPath(page.path)) tags.push(personJsonLd(data, site, page));
  return raw(tags.filter(Boolean).join("\n"));
}

// The words main.js shows, as a JSON data block (never executed, so CSP doesn't apply; "<" is escaped as below).
export const uiStrings = data =>
  raw(`<script type="application/json" id="ui-strings">${JSON.stringify(jsStrings(data)).replace(/</g, "\\u003c")}</script>`);

// schema.org data for search engines. A JSON data block is never executed, so CSP doesn't apply to it;
// "<" is escaped so the data can't close the element early.
function personJsonLd(data, site, page) {
  const P = obj(data.profile);
  const json = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: str(P.name),
    url: new URL(page.path, site.url).href,
    description: str(P.tagline),
    address: str(P.location) ? { "@type": "PostalAddress", addressLocality: str(P.location) } : undefined,
    email: email(data) ? `mailto:${email(data)}` : undefined,
    alumniOf: str(obj(data.courses).university) ? { "@type": "CollegeOrUniversity", name: str(obj(data.courses).university) } : undefined,
    sameAs: [P.linkedin, P.github].map(safeUrl).filter(u => u && u.startsWith("https:"))
  };
  const text = JSON.stringify(json).replace(/</g, "\\u003c");
  return raw(`<script type="application/ld+json">${text}</script>`);
}
