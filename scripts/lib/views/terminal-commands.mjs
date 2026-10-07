/*
 * The terminal's commands. Each one has a name, a one-line summary for `help`, whether it also shows when
 * JavaScript is off, and a render function that builds its output from the content.
 * Adding a command means adding an object to COMMANDS; terminal.mjs renders them.
 */
import { h, link } from "../html.mjs";
import { str, obj, named, texts, email, CvLayout, CERT_LABEL, verifyLink, cvFileName } from "./shared.mjs";
import { longDate } from "./dates.mjs";
import { postList } from "./posts.mjs";

// Every command's output is built here from the content, as plain HTML, so the section reads fine without
// JavaScript (the first few commands show as a transcript) and follows Backstage edits. main.js lifts the
// finished outputs out of the page and prints them when a visitor types the command or taps its button.
export const dl = pairs => pairs.length ? h("dl", { class: "term-kv" }, pairs.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])) : null;
// A list of the items that have something to show (a dropped link would otherwise leave an empty bullet).
const termList = (items, cls) => {
  const shown = items.filter(i => [i].flat(Infinity).some(Boolean));
  return shown.length ? h("ul", { class: cls }, shown.map(i => h("li", {}, i))) : null;
};
const termEntry = e => {
  const subtitle = [str(e.org), str(e.location), str(e.dates)].filter(Boolean).join(" · ");
  return h("div", { class: "term-item" },
    h("p", { class: "term-head" }, h("b", {}, str(e.title)), str(e.stack) && [" ", h("span", { class: "term-dim" }, str(e.stack))]),
    subtitle && h("p", { class: "term-dim" }, subtitle),
    str(e.details) && h("p", {}, str(e.details)),
    termList(texts(e.bullets), "term-bullets"));
};
const CERT_MARK = { earned: "[x]", progress: "[~]", planned: "[ ]" };

const joined = (parts, separator) => parts.filter(Boolean).join(separator);
const plainUrl = url => CvLayout.plainUrl(str(url));

// "Information Security Intern, Ebank (Aug 2026 – Jan 2027)"
const roleLine = e => joined([joined([str(e.title), str(e.org)], ", "), str(e.dates) && `(${str(e.dates)})`], " ");

const whoami = data => {
  const P = obj(data.profile), C = obj(data.courses), latest = named(obj(data.cv).experience, "title")[0];
  const degree = joined([str(C.degree), str(C.major) && `${str(C.major)} major`], ", ");
  return [dl([
    str(P.name) && ["name", str(P.name)],
    str(P.tagline) && ["about", str(P.tagline)],
    str(P.location) && ["based in", str(P.location)],
    latest && ["latest", roleLine(latest)],
    degree && ["studying", joined([degree, str(C.university)], " at ")]
  ].filter(Boolean))];
};

const skills = data => [dl(named(data.skills, "group").map(g => [str(g.group), texts(g.items).join(", ")]))];

const certs = data => [termList(named(data.certs, "name").map(c => {
  const status = CvLayout.certStatus(c), proof = verifyLink(c);
  return [h("span", { class: `term-mark ${status}`, "aria-hidden": "true" }, CERT_MARK[status]), " ", str(c.name), " ",
    h("span", { class: "term-dim" }, CERT_LABEL[status]), ...(proof ? [" · ", proof] : [])];
}), "term-certs")];

const writeups = data => [termList(postList(data).map(p => [
  link(p.url, {}, str(p.title)),
  str(p.date) && [" ", h("span", { class: "term-dim" }, longDate(p.date) || str(p.date))]
]), "term-posts")];

const contact = data => {
  const P = obj(data.profile), mail = email(data);
  return [dl([
    mail && ["email", link(`mailto:${mail}`, {}, mail)],
    str(P.linkedin) && ["linkedin", link(str(P.linkedin), {}, plainUrl(P.linkedin))],
    str(P.github) && ["github", link(str(P.github), {}, plainUrl(P.github))]
  ].filter(([, value]) => value))];
};

const cv = data => [
  h("p", {}, "One page, plain text, made for people and for ATS software."),
  termList([link(obj(data.profile).cv, {}, "Read it online"), h("a", { href: "cv.pdf", download: `${cvFileName(data)}-CV.pdf` }, "Download the PDF")], "term-links")
];

const flags = () => [h("p", {}, "There are flags hidden on this site. No spoilers here: the hints and the checker are in ",
  h("a", { href: "#flags" }, "Hidden flags"), ".")];

// `render` returns the output's parts; none left over means "nothing here yet" (terminal.mjs says so).
export const COMMANDS = [
  { name: "whoami", summary: "who I am", showsWithoutJs: true, render: whoami },
  { name: "skills", summary: "what I know, and what I'm learning", showsWithoutJs: true, render: skills },
  { name: "projects", summary: "things I've built", showsWithoutJs: true, render: data => named(obj(data.cv).projects, "title").map(termEntry) },
  { name: "certs", summary: "certifications", render: certs },
  { name: "education", summary: "where I study", render: data => named(obj(data.cv).education, "title").map(termEntry) },
  { name: "experience", summary: "where I've worked", render: data => named(obj(data.cv).experience, "title").map(termEntry) },
  { name: "writeups", summary: "things I've written", render: writeups },
  { name: "contact", summary: "how to reach me", showsWithoutJs: true, render: contact },
  { name: "cv", summary: "my one-page CV", render: cv },
  { name: "flags", summary: "a hint about the hidden flags", render: flags }
];
