/*
 * Which write-ups to show, and in what order. Shared by the home page, the feed and the terminal.
 */
import { safeUrl } from "../html.mjs";
import { named } from "./shared.mjs";
import { isoDate } from "./dates.mjs";

// Write-ups with a title and a usable link, newest first (undated ones last, in their original order).
export const postList = data => named(data.posts, "title").filter(p => safeUrl(p.url))
  .map((p, i) => ({ p, i, day: isoDate(p.date) || "" }))
  .sort((a, b) => (a.day < b.day) - (a.day > b.day) || a.i - b.i)
  .map(x => x.p);
