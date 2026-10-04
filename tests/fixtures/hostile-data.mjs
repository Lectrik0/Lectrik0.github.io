// The real site content with an XSS payload in every text field and dangerous URLs in every link,
// i.e. what a compromised or careless edit of data/site.json could look like.
import { readFileSync } from "node:fs";

export const PAYLOAD = `"><img src=x onerror=alert(1)><script>alert(2)</script><svg onload=alert(3)>'`;
const BAD_URLS = ["javascript:alert(4)", "data:text/html,<script>alert(5)</script>", "  JaVaScRiPt:alert(6)", "http://insecure.example", "vbscript:msgbox(7)"];
const URL_KEYS = new Set(["github", "linkedin", "cv", "url", "verify"]);
const KEEP = new Set(["date", "start", "end", "status", "color", "ects"]);

export function hostileData() {
  const data = JSON.parse(readFileSync(new URL("../../data/site.json", import.meta.url), "utf8"));
  let n = 0;
  const walk = (value, key) => {
    if (Array.isArray(value)) return value.map(v => walk(v, key));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, k)]));
    if (typeof value !== "string" || KEEP.has(key)) return value;
    if (URL_KEYS.has(key)) return BAD_URLS[n++ % BAD_URLS.length];
    return `${value}${PAYLOAD}`;
  };
  const evil = walk(data);
  evil.profile.email = `me@example.com${PAYLOAD}`;
  // security.txt must have a contact, so the build (rightly) refuses to run without one valid link
  evil.profile.linkedin = "https://www.linkedin.com/in/aliahmed255";
  // an earned certification, so its Verify link is rendered (and must be dropped)
  evil.certs.push({ name: PAYLOAD, short: "XSS", status: "earned", verify: BAD_URLS[0] });
  // one write-up with a safe link but a hostile title, so the list isn't simply dropped
  evil.posts.push({ title: PAYLOAD, date: "2026-10-05", tag: PAYLOAD, summary: PAYLOAD, url: "writeups/hardening-this-site.html" });
  return evil;
}
