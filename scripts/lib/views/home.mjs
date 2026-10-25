/*
 * The home page: hero and contact buttons, internship, skills, certifications and write-ups.
 */
import { h, link, raw } from "../html.mjs";
import { str, obj, named, texts, email, block, certStatus, verifyLink } from "./shared.mjs";
import { isoDate, shortDate, monthYear } from "./dates.mjs";
import { postList } from "./posts.mjs";
import { icon } from "./icons.mjs";
import { t, localeOf } from "./ui.mjs";

function contactLinks(data, order) {
  const P = obj(data.profile);
  const all = {
    cv: cls => link(P.cv, { class: cls }, icon("cv"), t(data, "viewCv")),
    li: cls => link(P.linkedin, { class: cls }, icon("li"), "LinkedIn"),
    gh: cls => link(P.github, { class: cls }, icon("gh"), "GitHub"),
    cve: cls => link(P.cveChecker, { class: cls }, icon("ext"), t(data, "cveChecker")),
    mail: cls => email(data) ? link(`mailto:${email(data)}`, { class: cls }, icon("mail"), t(data, "email")) : null
  };
  // the first link that survives is the primary button
  return order.filter(k => all[k]("btn")).map((k, i) => all[k](i === 0 ? "btn" : "btn ghost"));
}
// Email lives in the contact section and on the CV. The CVE Checker (a separate site) only shows once its link is set.
export const heroButtons = data => raw(contactLinks(data, ["cv", "li", "gh", "cve"]).join("\n"));
export const contactButtons = data => raw(contactLinks(data, ["li", "mail", "gh", "cv"]).join("\n"));

export function internship(data) {
  const I = obj(data.internship);
  const start = isoDate(I.start), end = isoDate(I.end);
  const range = start && end ? `${monthYear(start, localeOf(data))} – ${monthYear(end, localeOf(data))}` : "";
  return block("div", { class: "meter" }, [
    h("div", { class: "meter-top" }, h("span", {}, t(data, "internship")), h("span", { id: "intern-left" }, range)),
    // main.js fills the bar and the "days left" from these dates; without JavaScript the date range above stays.
    h("div", { class: "bar", role: "progressbar", "aria-label": t(data, "internshipProgress"), "aria-valuemin": "0", "aria-valuemax": "100",
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

const CERT_COLOR = { earned: "teal", progress: "blue", planned: "muted" };
// Badge text shrinks to stay inside the hexagon: exam codes like AZ-900 or CLF-C02 fit.
const badgeClass = text => text.length > 5 ? "hex-t longer" : text.length > 4 ? "hex-t long" : "hex-t";

// The picture in a certification's badge: simple flat drawings on a 24 × 24 grid, painted by CSS (.hex-i).
// Shapes that should be outlines carry fill="none".
const spokes = (angles, d) => angles.map(a => `<path d="${d}" fill="none" stroke-width="2.2" stroke-linecap="round" transform="rotate(${a} 12 12)"/>`).join("");
const teeth = angles => angles.map(a => `<rect x="10.7" y="1.8" width="2.6" height="4.4" rx=".6" stroke="none" transform="rotate(${a} 12 12)"/>`).join("");
const BADGE_ICONS = {
  cloud: '<path d="M7 18.5a4.6 4.6 0 0 1-.7-9.1A6.2 6.2 0 0 1 18.2 8.6a5 5 0 0 1-.7 9.9z"/>',
  blocks: '<path d="M3 20.5h5.2v-5.5H3zM9.4 20.5h5.2v-9.5H9.4zM15.8 20.5H21V6.5h-5.2z" stroke="none"/><path d="M15.8 6.5V2.5l4 1.5-4 1.4" stroke-width="1.2"/>',
  layers: '<path d="M12 3 3 8l9 5 9-5z"/><path d="M3 12.4l9 5 9-5M3 16.6l9 5 9-5" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  gears: `<circle cx="12" cy="12" r="4.4" fill="none" stroke-width="2.6"/>${teeth([0, 45, 90, 135, 180, 225, 270, 315])}`,
  helm: `<circle cx="12" cy="12" r="6.2" fill="none" stroke-width="2"/><circle cx="12" cy="12" r="2.2" stroke="none"/>${spokes([0, 45, 90, 135, 180, 225, 270, 315], "M12 2.2v6")}`,
  shield: '<path d="M12 2.5 20 5.6v6c0 5-3.3 8.4-8 10-4.7-1.6-8-5-8-10v-6z"/>',
  award: '<path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5-5.9-3.1-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/>'
};

export const certs = data => raw(named(data.certs, "name").map(c => {
  const status = certStatus(c), badge = str(c.short).slice(0, 7);
  return block("div", { class: `frame cut-c cert ${status} c-${CERT_COLOR[status]}` }, [
    block("div", { class: "in" }, [
      h("svg", { viewBox: "0 0 72 80", "aria-hidden": "true" },
        h("path", { class: "hex", d: "M36 4 L66 21 V59 L36 76 L6 59 V21z" }),
        BADGE_ICONS[str(c.icon)]
          ? [raw(`<g class="hex-i" transform="translate(21 13) scale(1.25)">${BADGE_ICONS[str(c.icon)]}</g>`), h("text", { class: "hex-t under", x: "36", y: "64" }, badge)]
          : h("text", { class: badgeClass(badge), x: "36", y: "45" }, badge)),
      h("div", {}, h("h3", {}, str(c.name)), h("p", {}, t(data, status), ...(verifyLink(c, data) ? [" · ", verifyLink(c, data)] : [])))
    ])
  ]);
}).join("\n"));

export function posts(data) {
  const list = postList(data);
  if (!list.length) {
    return block("div", { class: "frame cut-b empty" }, [
      block("div", { class: "in" }, [
        h("div", {}, h("h3", {}, t(data, "noPosts")),
          h("p", {}, "AWS labs, CTF notes and cloud and security write-ups will show up here as I finish them. In the meantime, my work in progress is on GitHub.")),
        raw('<svg viewBox="0 0 200 140" aria-hidden="true"><rect x="20" y="16" width="120" height="110" class="f-panel ink"/><path d="M38 44 h84 M38 64 h84 M38 84 h56" class="ink-thin" stroke-width="3"/><path d="M150 40 l20 20 l-60 60 h-20 v-20z" class="f-purple ink"/><path d="M144 46 l20 20" class="ink"/></svg>')
      ])
    ]);
  }
  return block("div", { class: "posts" }, list.map(p => {
    const date = isoDate(p.date);
    return link(p.url, { class: "post" },
      h("time", { datetime: date }, date ? shortDate(date, localeOf(data)) : ""),
      h("div", {}, h("h3", {}, str(p.title)), h("p", {}, str(p.summary))),
      h("span", { class: "tag" }, str(p.tag)));
  }));
}
