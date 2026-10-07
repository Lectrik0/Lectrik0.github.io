/*
 * Page chrome: navigation, footer and the <head> tags (canonical URL, social previews, feed, JSON-LD).
 */
import { h, raw, safeUrl } from "../html.mjs";
import { str, arr, obj, email, block } from "./shared.mjs";
import { isoDate } from "./dates.mjs";
import { ICON_PATHS } from "./icons.mjs";

const NAV = [["story", "Story"], ["skills", "Skills"], ["certs", "Certifications"], ["writeups", "Write-ups"], ["terminal", "Terminal"], ["flags", "Flags"], ["cv", "CV"], ["contact", "Contact"]];

export function nav(data, page) {
  const home = page.path === "/";
  const items = NAV.map(([id, label]) => {
    const href = id === "cv" ? "/cv.html" : `${home ? "" : "/"}#${id}`;
    return h("li", {}, h("a", { href, "aria-current": page.path === "/cv.html" && id === "cv" ? "page" : null }, label));
  });
  return block("nav", { class: "nav", "aria-label": "Main" }, [
    block("div", { class: "wrap" }, [
      h("a", { class: "brand", href: home ? "#top" : "/" }, str(obj(data.profile).name)),
      block("ul", {}, items),
      h("button", { class: "toggle", id: "toggle", type: "button", "aria-label": "Switch to night mode" },
        h("svg", { viewBox: "0 0 16 16", "aria-hidden": "true" }, h("path", { id: "toggle-icon", fill: "currentColor", d: ICON_PATHS.moon })),
        h("span", { id: "toggle-label" }, "Night"))
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
      h("meta", { property: "og:type", content: page.article ? "article" : page.path === "/" ? "profile" : "website" }),
      h("meta", { property: "og:site_name", content: str(P.name) }),
      h("meta", { property: "og:title", content: page.title }),
      h("meta", { property: "og:description", content: page.description }),
      h("meta", { property: "og:url", content: url }),
      h("meta", { property: "og:image", content: image }),
      h("meta", { property: "og:image:width", content: "1200" }),
      h("meta", { property: "og:image:height", content: "630" }),
      h("meta", { property: "og:image:alt", content: `${str(P.name)}: ${str(P.tagline)}` }),
      h("meta", { property: "og:locale", content: "en_GB" }),
      page.article && isoDate(page.article.date) ? h("meta", { property: "article:published_time", content: isoDate(page.article.date) }) : null,
      h("meta", { name: "twitter:card", content: "summary_large_image" })
    );
  }
  tags.push(h("link", { rel: "alternate", type: "application/atom+xml", title: `${str(P.name)}: write-ups`, href: "/feed.xml" }));
  if (page.path === "/") tags.push(personJsonLd(data, site));
  return raw(tags.filter(Boolean).join("\n"));
}

// schema.org data for search engines. A JSON data block is never executed, so CSP doesn't apply to it;
// "<" is escaped so the data can't close the element early.
function personJsonLd(data, site) {
  const P = obj(data.profile);
  const json = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: str(P.name),
    url: site.url,
    description: str(P.tagline),
    address: str(P.location) ? { "@type": "PostalAddress", addressLocality: str(P.location) } : undefined,
    email: email(data) ? `mailto:${email(data)}` : undefined,
    alumniOf: str(obj(data.courses).university) ? { "@type": "CollegeOrUniversity", name: str(obj(data.courses).university) } : undefined,
    sameAs: [P.linkedin, P.github].map(safeUrl).filter(u => u && u.startsWith("https:"))
  };
  const text = JSON.stringify(json).replace(/</g, "\\u003c");
  return raw(`<script type="application/ld+json">${text}</script>`);
}
