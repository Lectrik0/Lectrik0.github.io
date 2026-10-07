/*
 * The terminal's commands: what each is called, what it says it does, and how its output is built from the content.
 * Adding a command means adding a row to COMMANDS; terminal.mjs renders them.
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
  const sub = [str(e.org), str(e.location), str(e.dates)].filter(Boolean).join(" · ");
  return h("div", { class: "term-item" }, h("p", { class: "term-head" }, h("b", {}, str(e.title)), str(e.stack) && [" ", h("span", { class: "term-dim" }, str(e.stack))]),
    sub && h("p", { class: "term-dim" }, sub), str(e.details) && h("p", {}, str(e.details)), termList(texts(e.bullets), "term-bullets"));
};
const CERT_MARK = { earned: "[x]", progress: "[~]", planned: "[ ]" };

// name, what it does, the output ([] = nothing to show yet), and whether it shows without JavaScript
export const COMMANDS = [
  ["whoami", "who I am", data => {
    const P = obj(data.profile), C = obj(data.courses), first = named(obj(data.cv).experience, "title")[0];
    const study = [str(C.degree), str(C.major) && `${str(C.major)} major`].filter(Boolean).join(", ");
    return [dl([
      str(P.name) && ["name", str(P.name)], str(P.tagline) && ["about", str(P.tagline)], str(P.location) && ["based in", str(P.location)],
      first && ["latest", [str(first.title), str(first.org)].filter(Boolean).join(", ") + (str(first.dates) ? ` (${str(first.dates)})` : "")],
      study && ["studying", [study, str(C.university)].filter(Boolean).join(" at ")]
    ].filter(Boolean))];
  }, true],
  ["skills", "what I know, and what I'm learning", data => [dl(named(data.skills, "group").map(g => [str(g.group), texts(g.items).join(", ")]))], true],
  ["projects", "things I've built", data => named(obj(data.cv).projects, "title").map(termEntry), true],
  ["certs", "certifications", data => [termList(named(data.certs, "name").map(c => {
    const status = CvLayout.certStatus(c), proof = verifyLink(c);
    return [h("span", { class: `term-mark ${status}`, "aria-hidden": "true" }, CERT_MARK[status]), " ", str(c.name), " ", h("span", { class: "term-dim" }, CERT_LABEL[status]), ...(proof ? [" · ", proof] : [])];
  }), "term-certs")]],
  ["education", "where I study", data => named(obj(data.cv).education, "title").map(termEntry)],
  ["experience", "where I've worked", data => named(obj(data.cv).experience, "title").map(termEntry)],
  ["writeups", "things I've written", data => [termList(postList(data).map(p =>
    [link(p.url, {}, str(p.title)), str(p.date) && [" ", h("span", { class: "term-dim" }, longDate(p.date) || str(p.date))]]), "term-posts")]],
  ["contact", "how to reach me", data => {
    const P = obj(data.profile), mail = email(data);
    const plain = u => CvLayout.plainUrl(str(u));
    return [dl([
      mail && ["email", link(`mailto:${mail}`, {}, mail)], str(P.linkedin) && ["linkedin", link(str(P.linkedin), {}, plain(P.linkedin))],
      str(P.github) && ["github", link(str(P.github), {}, plain(P.github))]
    ].filter(([, v]) => v))];
  }, true],
  ["cv", "my one-page CV", data => {
    const P = obj(data.profile);
    return [h("p", {}, "One page, plain text, made for people and for ATS software."),
      termList([link(P.cv, {}, "Read it online"), h("a", { href: "cv.pdf", download: `${cvFileName(data)}-CV.pdf` }, "Download the PDF")], "term-links")];
  }],
  ["flags", "a hint about the hidden flags", () => [h("p", {}, "There are flags hidden on this site. No spoilers here: the hints and the checker are in ",
    h("a", { href: "#flags" }, "Hidden flags"), ".")]]
];
