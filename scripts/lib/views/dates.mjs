/*
 * Dates: content dates are ISO (YYYY-MM-DD) and shown in UTC, so the output never depends on where the build runs.
 */
import { str } from "./shared.mjs";

const parseDate = v => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(v));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 ? d : null;
};
export const isoDate = v => { const d = parseDate(v); return d ? d.toISOString().slice(0, 10) : null; };
const fmt = (d, opts, locale = "en-GB") => d.toLocaleDateString(locale, { timeZone: "UTC", ...opts });
export const longDate = (v, locale) => { const d = parseDate(v); return d ? fmt(d, { day: "numeric", month: "long", year: "numeric" }, locale) : ""; };
export const shortDate = (v, locale) => { const d = parseDate(v); return d ? fmt(d, { day: "numeric", month: "short", year: "numeric" }, locale) : ""; };
export const monthYear = (v, locale) => { const d = parseDate(v); return d ? fmt(d, { month: "short", year: "numeric" }, locale) : ""; };
