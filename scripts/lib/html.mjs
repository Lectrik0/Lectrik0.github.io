/*
 * Safe HTML building for the build step.
 *
 * Content from data/site.json only ever reaches a page through h(), which
 * - escapes every text child and attribute value,
 * - refuses event-handler and style attributes (CSP would block them anyway),
 * - passes every URL attribute through safeUrl(), dropping anything that isn't https:, mailto: or a same-site path.
 * raw() marks markup as already safe. It's only used for HTML that h() produced or for fixed strings in this repo.
 */

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ESCAPES[c]);

class SafeHtml {
  constructor(html) { this.html = html; }
  toString() { return this.html; }
}
export const raw = html => new SafeHtml(String(html));
export const isSafeHtml = value => value instanceof SafeHtml;

const SITE = "https://site.invalid";

// https: links, mailto: links, or paths on this site (returned root-relative, e.g. "cv.html" -> "/cv.html").
// Everything else (javascript:, data:, http:, garbage) returns null.
export function safeUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  let url;
  try { url = new URL(value.trim(), SITE + "/"); } catch { return null; }
  if (url.origin === SITE) return url.pathname + url.search + url.hash;
  if (url.protocol === "https:" || url.protocol === "mailto:") return url.href;
  return null;
}
export const isExternal = url => /^https:/i.test(url);

const VOID = new Set(["br", "hr", "img", "input", "link", "meta", "source", "wbr"]);
const URL_ATTRS = new Set(["href", "src", "action", "formaction", "poster", "xlink:href"]);

export function h(tag, attrs = {}, ...children) {
  if (!/^[a-z][a-z0-9-]*$/i.test(tag)) throw new Error(`Bad tag name: ${tag}`);
  let out = `<${tag}`;
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (!/^[a-z][a-z0-9:-]*$/i.test(name)) throw new Error(`Bad attribute name: ${name}`);
    if (/^on/i.test(name) || name.toLowerCase() === "style") throw new Error(`Attribute not allowed: ${name}`);
    if (value === true) { out += ` ${name}`; continue; }
    let text = String(value);
    if (URL_ATTRS.has(name.toLowerCase()) && !text.startsWith("#")) {
      text = safeUrl(text);
      if (text === null) continue;
    }
    out += ` ${name}="${escapeHtml(text)}"`;
  }
  out += ">";
  if (VOID.has(tag)) return raw(out);
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === "") continue;
    out += isSafeHtml(child) ? child.html : escapeHtml(child);
  }
  return raw(`${out}</${tag}>`);
}

// <a> for a URL from data: drops the link (returns null) when the URL isn't safe,
// and opens other sites in a new tab without giving them a handle on this one.
export function link(href, attrs, ...children) {
  const url = safeUrl(href);
  if (!url) return null;
  const external = isExternal(url) ? { target: "_blank", rel: "noopener noreferrer" } : {};
  return h("a", { href: url, ...external, ...attrs }, ...children);
}

// Several fragments, one per line, each indented to sit nicely inside the page source.
export const lines = (parts, indent = "") => raw(parts.filter(Boolean).map(p => indent + String(p)).join("\n"));
