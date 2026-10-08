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

// EN / ES / AR links, on the home pages only (the other pages exist in English only).
function languageSwitch(data, page) {
  const current = langOfPath(page.path);
  if (!current) return null;
  return block("div", { class: "lang", role: "group", "aria-label": t(data, "language") }, LANGS.map(l =>
    h("a", { href: l.path, hreflang: l.code, title: l.name, "aria-current": l === current ? "true" : null, "data-lang": l.code }, l.short)));
}

export function nav(data, page) {
  const home = !!langOfPath(page.path);
  const items = NAV.map(id => {
    const href = id === "cv" ? "/cv.html" : `${home ? "" : "/"}#${id}`;
    return h("li", {}, h("a", { href, "aria-current": page.path === "/cv.html" && id === "cv" ? "page" : null }, t(data, id)));
  });
  return block("nav", { class: "nav", "aria-label": t(data, "navLabel") }, [
    block("div", { class: "wrap" }, [
      h("a", { class: "brand", href: home ? "#top" : "/" }, str(obj(data.profile).name)),
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
      h("meta", { property: "og:locale", content: (langOfPath(page.path) || LANGS[0]).ogLocale }),
      page.article && isoDate(page.article.date) ? h("meta", { property: "article:published_time", content: isoDate(page.article.date) }) : null,
      h("meta", { name: "twitter:card", content: "summary_large_image" })
    );
  }
  tags.push(h("link", { rel: "alternate", type: "application/atom+xml", title: `${str(P.name)}: write-ups`, href: "/feed.xml" }));
  // the same page in the other languages (each one lists all of them, itself included)
  if (langOfPath(page.path)) {
    tags.push(...LANGS.map(l => h("link", { rel: "alternate", hreflang: l.code, href: new URL(l.path, site.url).href })),
      h("link", { rel: "alternate", hreflang: "x-default", href: new URL("/", site.url).href }));
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
