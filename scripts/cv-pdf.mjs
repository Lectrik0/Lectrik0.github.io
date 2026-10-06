#!/usr/bin/env node
/**
 * Renders cv.html into cv.pdf (A4, with the print stylesheet), the file behind the CV's
 * "Download PDF" button, and each other version of the CV (data/site.json → cv.versions) into
 * cv-<slug>.pdf. Needs the dev tools (npm install) for Chromium; run it after the build.
 * CI does this on every update of main and publishes the result with the pages.
 *
 *   node scripts/cv-pdf.mjs            write cv.pdf and cv-*.pdf (and delete PDFs of removed versions)
 *
 * The output is stable: the same CV gives the same bytes, so an unchanged CV never makes a commit.
 */
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { build, siteConfig } from "./build.mjs";
import "../assets/cv-layout.js";
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

// Every version's PDF, as [file name, bytes]: cv.pdf from the site as built, then each other version
// rendered from a copy of the site built with that version's content.
export async function cvPdfs({ root = ROOT } = {}) {
  const data = JSON.parse(readFileSync(join(root, "data/site.json"), "utf8"));
  const out = [["cv.pdf", await cvPdf({ root })]];
  for (const v of globalThis.CvLayout.versions(data)) {
    const dir = mkdtempSync(join(tmpdir(), "cv-version-"));
    try {
      cpSync(root, dir, { recursive: true, filter: src => !/[\\/](node_modules|\.git|test-results)([\\/]|$)/.test(src.slice(root.length)) });
      build({ root: dir, data: v.data });
      out.push([`cv-${v.slug}.pdf`, await cvPdf({ root: dir })]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return out;
}

export const pageCount = pdf => (Buffer.from(pdf).toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pdfs = await cvPdfs();
  for (const [file, pdf] of pdfs) {
    writeFileSync(join(ROOT, file), pdf);
    console.log(`${file}: ${pageCount(pdf)} page(s), ${Math.round(pdf.length / 1024)} KB`);
  }
  for (const file of readdirSync(ROOT).filter(f => /^cv-.+\.pdf$/.test(f) && !pdfs.some(([name]) => name === f))) {
    unlinkSync(join(ROOT, file));
    console.log(`${file}: removed (no such version any more)`);
  }
}
