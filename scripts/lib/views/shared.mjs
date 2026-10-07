/*
 * Pieces every view uses: the safe-HTML helpers, small readers for loosely typed content, and the CV layout
 * (shared with Backstage, see assets/cv-layout.js) bound to this build's escaping element factory.
 */
import { h, link, raw } from "../html.mjs";
import "../../../assets/cv-layout.js";

export const { CvLayout } = globalThis;
export const HTML = { h, block, link };

export const str = v => (typeof v === "string" || typeof v === "number") ? String(v).trim() : "";
export const arr = v => Array.isArray(v) ? v : [];
export const obj = v => (v && typeof v === "object" && !Array.isArray(v)) ? v : {};
// Entries whose main field is filled in. A half-filled entry (e.g. one just added in Backstage) is
// left out rather than rendered as an empty heading.
export const named = (list, key) => arr(list).filter(x => str(obj(x)[key]));
export const texts = list => arr(list).map(str).filter(Boolean);
// The profile email if it looks like one, else "" (which hides it everywhere).
export const email = data => CvLayout.email(data);

// One element per line, children indented, so the generated source stays readable.
export function block(tag, attrs, children) {
  const inner = children.filter(Boolean).map(c => "\n" + String(c).replace(/^/gm, "  ")).join("");
  return h(tag, attrs, raw(inner + "\n"));
}

export const { CERT_LABEL, certStatus } = CvLayout;
// The proof link (e.g. Credly) of an earned certification: https only, and only once it's earned.
export const verifyLink = c => CvLayout.verifyLink(c, HTML);
