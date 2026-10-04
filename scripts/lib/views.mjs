/*
 * Views: turn data/site.json into HTML fragments for the build step.
 * Every function is pure (data in, SafeHtml out) and goes through h()/link(), so nothing from the
 * data is ever written into a page unescaped. Missing or malformed fields are skipped, not fatal.
 */
import { h, link, raw, safeUrl } from "./html.mjs";

export const str = v => (typeof v === "string" || typeof v === "number") ? String(v).trim() : "";
export const arr = v => Array.isArray(v) ? v : [];
const obj = v => (v && typeof v === "object" && !Array.isArray(v)) ? v : {};
// Entries whose main field is filled in. A half-filled entry (e.g. one just added in Backstage) is
// left out rather than rendered as an empty heading.
const named = (list, key) => arr(list).filter(x => str(obj(x)[key]));
const texts = list => arr(list).map(str).filter(Boolean);
// The profile email if it looks like one, else "" (which hides it everywhere).
export const email = data => {
  const e = str(obj(data.profile).email);
  return /^[^\s@<>"'()\\,;:]+@[^\s@<>"'()\\,;:]+\.[^\s@<>"'()\\,;:]+$/.test(e) ? e : "";
};

// One element per line, children indented, so the generated source stays readable.
export function block(tag, attrs, children) {
  const inner = children.filter(Boolean).map(c => "\n" + String(c).replace(/^/gm, "  ")).join("");
  return h(tag, attrs, raw(inner + "\n"));
}

/* ---------- dates ---------- */
const parseDate = v => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(v));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 ? d : null;
};
export const isoDate = v => { const d = parseDate(v); return d ? d.toISOString().slice(0, 10) : null; };
const fmt = (d, opts) => d.toLocaleDateString("en-GB", { timeZone: "UTC", ...opts });
export const longDate = v => { const d = parseDate(v); return d ? fmt(d, { day: "numeric", month: "long", year: "numeric" }) : ""; };
const shortDate = v => { const d = parseDate(v); return d ? fmt(d, { day: "numeric", month: "short", year: "numeric" }) : ""; };
const monthYear = v => { const d = parseDate(v); return d ? fmt(d, { month: "short", year: "numeric" }) : ""; };

/* ---------- icons (fixed path data) ---------- */
const ICON_PATHS = {
  gh: "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z",
  li: "M0 1.15C0 .52.52 0 1.18 0h13.64C15.48 0 16 .52 16 1.15v13.7c0 .63-.52 1.15-1.18 1.15H1.18C.52 16 0 15.48 0 14.85V1.15zM4.94 13.4V6.17H2.54v7.23h2.4zM3.74 5.18c.84 0 1.36-.56 1.36-1.25-.02-.71-.52-1.25-1.34-1.25-.82 0-1.36.54-1.36 1.25 0 .69.52 1.25 1.33 1.25h.01zM6.27 13.4h2.4V9.36c0-.22.02-.43.08-.59.17-.43.57-.88 1.23-.88.87 0 1.21.66 1.21 1.63v3.88h2.4V9.25c0-2.22-1.18-3.25-2.76-3.25-1.28 0-1.84.7-2.16 1.2v.03h-.02l.02-.03V6.17h-2.4c.03.68 0 7.23 0 7.23z",
  cv: "M3 0h7l3 3v13H3zM9 1v3h3M5 7h6v1.5H5zm0 3h6v1.5H5zm0 3h4v1.5H5z",
  mail: "M0 2h16v12H0zM1.5 3.5v.6L8 8.7l6.5-4.6v-.6zm13 2.4L8 10.5 1.5 5.9v6.6h13z",
  moon: "M6 .3a7.7 7.7 0 109.7 9.7A6.2 6.2 0 016 .3z"
};
const icon = name => h("svg", { viewBox: "0 0 16 16", "aria-hidden": "true" },
  h("path", { fill: "currentColor", "fill-rule": "evenodd", d: ICON_PATHS[name] }));

/* ---------- site chrome ---------- */
const NAV = [["story", "Story"], ["skills", "Skills"], ["certs", "Certifications"], ["writeups", "Write-ups"], ["flags", "Flags"], ["cv", "CV"], ["contact", "Contact"]];

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

/* ---------- home page ---------- */
function contactLinks(data, order) {
  const P = obj(data.profile);
  const all = {
    cv: cls => link(P.cv, { class: cls }, icon("cv"), "View CV"),
    li: cls => link(P.linkedin, { class: cls }, icon("li"), "LinkedIn"),
    gh: cls => link(P.github, { class: cls }, icon("gh"), "GitHub"),
    mail: cls => email(data) ? link(`mailto:${email(data)}`, { class: cls }, icon("mail"), "Email") : null
  };
  // the first link that survives is the primary button
  return order.filter(k => all[k]("btn")).map((k, i) => all[k](i === 0 ? "btn" : "btn ghost"));
}
// Email lives in the contact section and on the CV; a fourth hero button would wrap onto its own row.
export const heroButtons = data => raw(contactLinks(data, ["cv", "li", "gh"]).join("\n"));
export const contactButtons = data => raw(contactLinks(data, ["li", "mail", "gh", "cv"]).join("\n"));

export function internship(data) {
  const I = obj(data.internship);
  const start = isoDate(I.start), end = isoDate(I.end);
  const range = start && end ? `${monthYear(start)} – ${monthYear(end)}` : "";
  return block("div", { class: "meter" }, [
    h("div", { class: "meter-top" }, h("span", {}, "Internship"), h("span", { id: "intern-left" }, range)),
    // main.js fills the bar and the "days left" from these dates; without JavaScript the date range above stays.
    h("div", { class: "bar", role: "progressbar", "aria-label": "Internship progress", "aria-valuemin": "0", "aria-valuemax": "100",
      id: "intern-bar", "data-start": start, "data-end": end }, h("i", { id: "intern-fill" }))
  ]);
}

const COLORS = ["teal", "blue", "purple", "green"];
export const skills = data => raw(named(data.skills, "group").map(g => {
  const color = COLORS.includes(g.color) ? g.color : "teal";
  return block("div", { class: `frame cut-a skill-col c-${color}` }, [
    block("div", { class: "in" }, [
      h("h3", {}, h("i", {}), str(g.group)),
      h("p", {}, str(g.note)),
      h("ul", { class: "chips" }, texts(g.items).map(i => h("li", {}, i)))
    ])
  ]);
}).join("\n"));

const CERT_LABEL = { earned: "Earned", progress: "In progress", planned: "Planned" };
const CERT_COLOR = { earned: "teal", progress: "blue", planned: "muted" };
const certStatus = c => CERT_LABEL[c.status] ? c.status : "planned";
// Badge text shrinks to stay inside the hexagon: exam codes like AZ-900 or CLF-C02 fit.
const badgeClass = text => text.length > 5 ? "hex-t longer" : text.length > 4 ? "hex-t long" : "hex-t";

export const certs = data => raw(named(data.certs, "name").map(c => {
  const status = certStatus(c), badge = str(c.short).slice(0, 7);
  return block("div", { class: `frame cut-c cert ${status} c-${CERT_COLOR[status]}` }, [
    block("div", { class: "in" }, [
      h("svg", { viewBox: "0 0 72 80", "aria-hidden": "true" },
        h("path", { class: "hex", d: "M36 4 L66 21 V59 L36 76 L6 59 V21z" }),
        h("text", { class: badgeClass(badge), x: "36", y: "45" }, badge)),
      h("div", {}, h("h3", {}, str(c.name)), h("p", {}, CERT_LABEL[status]))
    ])
  ]);
}).join("\n"));

// Write-ups with a title and a usable link, newest first (undated ones last, in their original order).
export const postList = data => named(data.posts, "title").filter(p => safeUrl(p.url))
  .map((p, i) => ({ p, i, day: isoDate(p.date) || "" }))
  .sort((a, b) => (a.day < b.day) - (a.day > b.day) || a.i - b.i)
  .map(x => x.p);

export function posts(data) {
  const list = postList(data);
  if (!list.length) {
    return block("div", { class: "frame cut-b empty" }, [
      block("div", { class: "in" }, [
        h("div", {}, h("h3", {}, "First write-up coming soon"),
          h("p", {}, "AWS labs, CTF notes and cloud security write-ups will show up here as I finish them. In the meantime, my work in progress is on GitHub.")),
        raw('<svg viewBox="0 0 200 140" aria-hidden="true"><rect x="20" y="16" width="120" height="110" class="f-panel ink"/><path d="M38 44 h84 M38 64 h84 M38 84 h56" class="ink-thin" stroke-width="3"/><path d="M150 40 l20 20 l-60 60 h-20 v-20z" class="f-purple ink"/><path d="M144 46 l20 20" class="ink"/></svg>')
      ])
    ]);
  }
  return block("div", { class: "posts" }, list.map(p => {
    const date = isoDate(p.date);
    return link(p.url, { class: "post" },
      h("time", { datetime: date }, date ? shortDate(date) : ""),
      h("div", {}, h("h3", {}, str(p.title)), h("p", {}, str(p.summary))),
      h("span", { class: "tag" }, str(p.tag)));
  }));
}

/* ---------- Chapter 1: course list ---------- */
const SEM_STATUS = { completed: "Completed", current: "In progress", upcoming: "Upcoming" };
const courseList = s => named(s.courses, "name");
const ects = s => courseList(s).reduce((sum, c) => sum + (Number(c.ects) || 0), 0);
const semesterList = data => named(obj(data.courses).semesters, "name");

export function coursesSummary(data) {
  const sems = semesterList(data);
  const total = sems.reduce((a, s) => a + ects(s), 0);
  const done = sems.filter(s => s.status === "completed").reduce((a, s) => a + ects(s), 0);
  const count = sems.reduce((a, s) => a + courseList(s).length, 0);
  return raw([
    h("span", {}, h("b", {}, String(count)), " courses"),
    h("span", {}, h("b", {}, String(done)), ` of ${total} ECTS completed`),
    h("span", {}, h("b", {}, String(sems.length)), " semesters")
  ].join("\n"));
}

export const semesters = data => raw(semesterList(data).map(s => {
  const status = SEM_STATUS[s.status] ? s.status : "upcoming";
  return block("section", { class: `sem ${status}` }, [
    h("div", { class: "sem-head" }, h("h3", {}, str(s.name)), h("span", { class: "sem-state" }, SEM_STATUS[status])),
    block("ul", { class: "sem-list" }, courseList(s).map(c =>
      h("li", {}, h("span", {}, str(c.name)), h("span", { class: "ects" }, Number(c.ects) ? `${Number(c.ects)} ECTS` : "")))),
    h("p", { class: "sem-total" }, `${ects(s)} ECTS`)
  ]);
}).join("\n"));

/* ---------- CV page ---------- */
const plainUrl = u => { try { const x = new URL(u); return (x.host + x.pathname).replace(/^www\./, "").replace(/\/$/, ""); } catch { return u; } };

export function cvContact(data, site) {
  const P = obj(data.profile);
  return raw([
    str(P.location) && h("li", {}, str(P.location)),
    email(data) && h("li", {}, link(`mailto:${email(data)}`, {}, email(data))),
    safeUrl(P.linkedin) && h("li", {}, link(P.linkedin, {}, plainUrl(P.linkedin))),
    safeUrl(P.github) && h("li", {}, link(P.github, {}, plainUrl(P.github))),
    h("li", {}, h("a", { href: "/" }, new URL(site.url).host))
  ].filter(Boolean).join("\n"));
}

const section = (title, ...kids) => block("section", {}, [h("h2", {}, title), ...kids]);
const item = (title, dates, ...kids) => block("div", { class: "item" }, [
  h("div", { class: "item-top" }, h("b", {}, title), h("span", {}, dates)), ...kids]);
const bullets = list => texts(list).length ? block("ul", {}, texts(list).map(b => h("li", {}, b))) : null;
const titleOrg = e => [str(e.title), str(e.org)].filter(Boolean).join(", ");

// The CV's sections, in order, each only when it has something to show.
export function cvSections(data) {
  const CV = obj(data.cv);
  return {
    main: [
      ["Profile", [str(CV.summary)].filter(Boolean)],
      ["Education", named(CV.education, "title")],
      ["Experience", named(CV.experience, "title")],
      ["Projects", named(CV.projects, "title")]
    ].filter(([, items]) => items.length),
    side: [
      ["Certifications", named(data.certs, "name")],
      ["Skills", named(CV.skills, "label")],
      ["Languages", texts(CV.languages)]
    ].filter(([, items]) => items.length)
  };
}

const CV_MAIN = {
  Profile: summary => h("p", {}, summary),
  Education: e => item(titleOrg(e), str(e.dates), str(e.details) ? h("p", {}, str(e.details)) : null),
  Experience: e => item(titleOrg(e), str(e.dates), bullets(e.bullets)),
  Projects: p => item(str(p.title), str(p.dates), bullets(p.bullets))
};
const CV_SIDE = {
  Certifications: c => h("li", {}, h("b", {}, str(c.name)), h("br"), CERT_LABEL[certStatus(c)]),
  Skills: s => h("li", {}, h("b", {}, `${str(s.label)}:`), " ", str(s.text)),
  Languages: l => h("li", {}, l)
};

export const cvMain = data => raw(cvSections(data).main
  .map(([title, items]) => section(title, ...items.map(CV_MAIN[title]))).join("\n"));
export const cvSide = data => raw(cvSections(data).side
  .map(([title, items]) => section(title, block("ul", { class: "side-list" }, items.map(CV_SIDE[title])))).join("\n"));

/* ---------- single text values, for elements marked data-bind="..." ---------- */
export function bindings(data) {
  const P = obj(data.profile), C = obj(data.courses), CV = obj(data.cv);
  const values = {
    "profile.name": str(P.name),
    "profile.location": str(P.location),
    "profile.tagline": str(P.tagline),
    "cv.headline": str(CV.headline),
    "courses.university": str(C.university),
    "courses.subtitle": [str(C.degree), str(C.major) && `${str(C.major)} major`].filter(Boolean).join(", ")
  };
  arr(data.story).forEach((ch, i) => {
    values[`story.${i}.title`] = str(obj(ch).title);
    values[`story.${i}.text`] = str(obj(ch).text);
  });
  return values;
}
