/*
 * The home page: hero and contact buttons, internship, skills, certifications and write-ups.
 */
import { h, link, raw } from "../html.mjs";
import { str, obj, named, texts, email, block, CERT_LABEL, certStatus, verifyLink } from "./shared.mjs";
import { isoDate, shortDate, monthYear } from "./dates.mjs";
import { postList } from "./posts.mjs";
import { icon } from "./icons.mjs";

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

const CERT_COLOR = { earned: "teal", progress: "blue", planned: "muted" };
// Badge text shrinks to stay inside the hexagon: exam codes like AZ-900 or CLF-C02 fit.
const badgeClass = text => text.length > 5 ? "hex-t longer" : text.length > 4 ? "hex-t long" : "hex-t";

export const certs = data => raw(named(data.certs, "name").map(c => {
  const status = certStatus(c), badge = str(c.short).slice(0, 7);
  return block("div", { class: `frame cut-c cert ${status} c-${CERT_COLOR[status]}` }, [
    block("div", { class: "in" }, [
      h("svg", { viewBox: "0 0 72 80", "aria-hidden": "true" },
        h("path", { class: "hex", d: "M36 4 L66 21 V59 L36 76 L6 59 V21z" }),
        h("text", { class: badgeClass(badge), x: "36", y: "45" }, badge)),
      h("div", {}, h("h3", {}, str(c.name)), h("p", {}, CERT_LABEL[status], ...(verifyLink(c) ? [" · ", verifyLink(c)] : [])))
    ])
  ]);
}).join("\n"));

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
