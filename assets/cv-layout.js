"use strict";
/*
 * The CV's layout, shared by the build and Backstage so the two can never disagree:
 * - scripts/lib/views.mjs renders it to HTML for cv.html (and so for the PDF);
 * - Backstage renders it to DOM nodes, off screen at the printed page's width, to check an edit
 *   still fits on one A4 page before publishing.
 *
 * One column, in the style of Jake's Resume, so it reads top to bottom for people and for ATS software
 * alike: plain-text contact line, standard section names, each entry's dates on the same line as its title.
 *
 * Each function takes the content and an element factory `f`:
 *   f.h(tag, attrs, ...children)       an element (children: text, elements, nulls to skip, arrays)
 *   f.block(tag, attrs, children)      the same, for elements whose children sit on their own lines
 *   f.link(href, attrs, ...children)   a link, or null when the URL isn't safe
 * Loaded as a classic script in the browser and imported for its side effect in Node; sets globalThis.CvLayout.
 */
(function (root) {
  const str = v => (typeof v === "string" || typeof v === "number") ? String(v).trim() : "";
  const arr = v => Array.isArray(v) ? v : [];
  const obj = v => (v && typeof v === "object" && !Array.isArray(v)) ? v : {};
  // Entries whose main field is filled in: a half-filled entry is left out rather than shown empty.
  const named = (list, key) => arr(list).filter(x => str(obj(x)[key]));
  const texts = list => arr(list).map(str).filter(Boolean);

  // The profile email if it looks like one, else "" (which hides it everywhere).
  const email = data => {
    const e = str(obj(data.profile).email);
    return /^[^\s@<>"'()\\,;:]+@[^\s@<>"'()\\,;:]+\.[^\s@<>"'()\\,;:]+$/.test(e) ? e : "";
  };
  const plainUrl = u => { try { const x = new URL(u); return (x.host + x.pathname).replace(/^www\./, "").replace(/\/$/, ""); } catch { return u; } };

  const CERT_LABEL = { earned: "Earned", progress: "In progress", planned: "Planned" };
  const certStatus = c => CERT_LABEL[obj(c).status] ? c.status : "planned";
  // The proof link (e.g. Credly) of an earned certification: https only, and only once it's earned.
  const verifyLink = (c, f) => certStatus(c) === "earned" && /^https:\/\//i.test(str(c.verify))
    ? f.link(str(c.verify), { class: "verify", "aria-label": `Verify ${str(c.name)}` }, "Verify", f.h("span", { "aria-hidden": "true" }, " ↗"))
    : null;

  // The contact line's items, in order (location, phone, email, LinkedIn, GitHub, this site).
  // The phone shows with non-breaking spaces, so it never wraps, and links as tel: (digits only).
  function contact(data, f, host) {
    const P = obj(data.profile), tel = str(P.phone), mail = email(data);
    return [
      str(P.location) && f.h("span", {}, str(P.location)),
      tel && (f.link(`tel:${tel.replace(/[^\d+]/g, "")}`, {}, tel.replace(/ /g, " ")) || f.h("span", {}, tel)),
      mail && f.link(`mailto:${mail}`, {}, mail),
      str(P.linkedin) && f.link(str(P.linkedin), {}, plainUrl(str(P.linkedin))),
      str(P.github) && f.link(str(P.github), {}, plainUrl(str(P.github))),
      f.h("a", { href: "/" }, host)
    ].filter(Boolean);
  }
  const separator = f => f.h("span", { class: "sep", "aria-hidden": "true" }, " | ");

  // Personal details under the contact line (as Egyptian employers expect), only when filled in.
  const personal = (data, f) => {
    const military = str(obj(data.cv).military);
    return military ? f.h("p", { class: "sheet-personal" }, `Military status: ${military}`) : null;
  };

  // The whole header, as cv.html has it (name and headline come from its data-bind fields there).
  function header(data, f, host) {
    const P = obj(data.profile), CV = obj(data.cv);
    const items = contact(data, f, host);
    return f.block("header", { class: "sheet-head" }, [
      f.h("h1", {}, str(CV.fullName) || str(P.name)),
      str(CV.headline) && f.h("p", { class: "sheet-headline" }, str(CV.headline)),
      f.h("p", { class: "sheet-contact" }, items.flatMap((item, i) => i ? [separator(f), item] : [item])),
      personal(data, f)
    ]);
  }

  // The sections, in order, each only when it has something to show. Planned certifications stay
  // on the home page: on a CV they could read as held.
  function sections(data) {
    const CV = obj(data.cv);
    const languages = texts(CV.languages);
    return [
      ["Profile", [str(CV.summary)].filter(Boolean)],
      ["Education", named(CV.education, "title")],
      ["Experience", named(CV.experience, "title")],
      ["Projects", named(CV.projects, "title")],
      ["Certifications & Training", named(data.certs, "name").filter(c => certStatus(c) !== "planned")],
      ["Skills", [...named(CV.skills, "label"), ...(languages.length ? [{ label: "Spoken languages", text: languages.join(", ") }] : [])]]
    ].filter(([, items]) => items.length);
  }

  function body(data, f) {
    // A line with text on the left and, optionally, on the right (dates, location, status).
    const row = (cls, left, right) => f.h("div", { class: cls }, left, right ? f.h("span", {}, right) : "");
    const entry = (rows, ...kids) => f.block("div", { class: "entry" }, [...rows.filter(Boolean), ...kids]);
    const bullets = list => texts(list).length ? f.block("ul", {}, texts(list).map(b => f.h("li", {}, b))) : null;
    const SECTION = {
      Profile: items => items.map(summary => f.h("p", {}, summary)),
      // School | location, then degree | dates
      Education: items => items.map(e => {
        const [school, degree] = str(e.org) ? [str(e.org), str(e.title)] : [str(e.title), ""];
        return entry([
          row("row", f.h("b", {}, school), str(e.location)),
          (degree || str(e.dates)) && row("row sub", f.h("i", {}, degree), str(e.dates))
        ], str(e.details) ? f.h("p", { class: "note" }, str(e.details)) : null);
      }),
      // Role | dates, then company | location
      Experience: items => items.map(e => entry([
        row("row", f.h("b", {}, str(e.title)), str(e.dates)),
        (str(e.org) || str(e.location)) && row("row sub", f.h("i", {}, str(e.org)), str(e.location))
      ], bullets(e.bullets))),
      // Project | tech used, then dates on the right
      Projects: items => items.map(p => entry([
        row("row", f.h("span", {}, f.h("b", {}, str(p.title)), ...(str(p.stack) ? [" | ", f.h("i", {}, str(p.stack))] : [])), str(p.dates))
      ], bullets(p.bullets))),
      // Name (| Verify), then the issue date of an earned one, else its status
      "Certifications & Training": items => [f.block("div", { class: "entry" }, items.map(c => {
        const verify = verifyLink(c, f);
        return row("row", f.h("span", {}, f.h("b", {}, str(c.name)), ...(verify ? [" | ", verify] : [])),
          certStatus(c) === "earned" && str(c.issued) ? str(c.issued) : CERT_LABEL[certStatus(c)]);
      }))],
      Skills: items => [f.block("ul", { class: "skills" }, items.map(s => f.h("li", {}, f.h("b", {}, `${str(s.label)}:`), " ", str(s.text))))]
    };
    return sections(data).map(([title, items]) => f.block("section", {}, [f.h("h2", {}, title), ...SECTION[title](items)]));
  }

  root.CvLayout = { email, plainUrl, contact, separator, personal, header, sections, body, certStatus, verifyLink, CERT_LABEL };
})(globalThis);
