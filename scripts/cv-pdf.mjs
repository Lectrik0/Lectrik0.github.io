#!/usr/bin/env node
/**
 * Renders cv.html into cv.pdf (A4, with the print stylesheet), the file behind the CV's
 * "Download PDF" button. Needs the dev tools (npm install) for Chromium; run it after the build.
 * CI does this on every update of main and publishes the result with the pages.
 *
 *   node scripts/cv-pdf.mjs            write cv.pdf
 *
 * The output is stable: the same CV gives the same bytes, so an unchanged CV never makes a commit.
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { siteConfig } from "./build.mjs";
import { serve } from "./serve.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function cvPdf({ root = ROOT } = {}) {
  const server = await serve({ root, port: 0 });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/cv.html`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    // Links in the PDF point at the live site, not at this local preview.
    await page.evaluate(site => {
      for (const a of document.querySelectorAll("a[href]")) a.href = new URL(a.getAttribute("href"), site).href;
    }, siteConfig().url);
    return stable(await page.pdf({ format: "A4", preferCSSPageSize: true, printBackground: true, tagged: true }));
  } finally {
    await browser.close();
    server.close();
  }
}

// Chromium stamps each PDF with the time it was made and a random document ID. Replace both with
// values of the same length (so the file's byte offsets stay valid): a fixed date, and an ID
// derived from the rest of the file.
const FIXED_DATE = "20000101000000";
export function stable(pdf) {
  let text = Buffer.from(pdf).toString("latin1")
    .replace(/\/(CreationDate|ModDate) \(D:([^)]*)\)/g, (_, key, date) => {
      let i = 0;
      return `/${key} (D:${date.replace(/\d/g, () => FIXED_DATE[i++] ?? "0")})`;
    });
  const id = createHash("sha256").update(text.replace(/\/ID \[[^\]]*\]/g, "")).digest("hex");
  text = text.replace(/\/ID \[<([0-9A-Fa-f]+)> <([0-9A-Fa-f]+)>\]/g, (_, a, b) =>
    `/ID [<${id.slice(0, a.length).toUpperCase()}> <${id.slice(0, b.length).toUpperCase()}>]`);
  return Buffer.from(text, "latin1");
}

export const pageCount = pdf => (Buffer.from(pdf).toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pdf = await cvPdf();
  writeFileSync(join(ROOT, "cv.pdf"), pdf);
  console.log(`cv.pdf: ${pageCount(pdf)} page(s), ${Math.round(pdf.length / 1024)} KB`);
}
