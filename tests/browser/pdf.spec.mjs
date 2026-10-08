import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { cvPdf, pageCount } from "../../scripts/cv-pdf.mjs";
import { siteConfig } from "../../scripts/build.mjs";
import { cvSections } from "../../scripts/lib/views.mjs";
import { copyOfData, data, siteFrom } from "./helpers.mjs";

// The CV's "Download PDF" file: rendered from cv.html by scripts/cv-pdf.mjs (CI does it on main).
test("the CV renders to a one-page PDF that links to the live site, the same every time", async () => {
  test.setTimeout(60_000);
  const [first, second] = [await cvPdf(), await cvPdf()];
  expect(pageCount(first)).toBe(1);
  expect(first.equals(second), "rendering the same CV twice should give the same file").toBe(true);
  const uris = [...first.toString("latin1").matchAll(/\/URI \(([^)]*)\)/g)].map(m => m[1]);
  expect(uris).toContain(siteConfig().url);
  expect(uris.filter(u => /127\.0\.0\.1|localhost/.test(u))).toEqual([]);
});

test("the Spanish CV renders to one page too, and links to the live site", async () => {
  test.setTimeout(60_000);
  const pdf = await cvPdf({ page: "es/cv.html" });
  expect(pageCount(pdf)).toBe(1);
  expect(pdf.toString("latin1")).toContain(siteConfig().url);
});

/* ---------- ATS: what an applicant tracking system reads out of the PDF ---------- */

// The PDF's text in content order, with a new line wherever the baseline moves: roughly what ATS
// software extracts before it looks for sections, dates and keywords.
async function pdfText(pdf) {
  const task = getDocument({ data: new Uint8Array(pdf), isEvalSupported: false });
  const doc = await task.promise;
  let text = "";
  for (let n = 1; n <= doc.numPages; n++) {
    let lastY = null;
    for (const item of (await (await doc.getPage(n)).getTextContent()).items) {
      const y = item.transform?.[5];
      if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 1) text += "\n";
      text += item.str;
      if (y !== undefined) lastY = y;
    }
    text += "\n";
  }
  await task.destroy();
  return text;
}

const plain = u => { const x = new URL(u); return (x.host + x.pathname).replace(/^www\./, "").replace(/\/$/, ""); };
const STATUS = { earned: "Earned", progress: "In progress" };

// Everything the CV says, in the order a reader (or a parser) should meet it.
function expectedOrder(d) {
  const P = d.profile;
  const out = [d.cv.fullName || P.name, P.phone, P.email, plain(P.linkedin), plain(P.github), new URL(siteConfig().url).host,
    d.cv.military && `Military status: ${d.cv.military}`];
  for (const [title, items] of cvSections(d)) {
    out.push(title);
    for (const it of items) {
      if (title === "Profile") out.push(it);
      if (title === "Education") out.push(it.org, it.location, it.title, it.dates, it.details);
      if (title === "Experience") out.push(it.title, it.dates, it.org, it.location, ...(it.bullets ?? []));
      if (title === "Projects") out.push(it.title, it.stack, it.dates, ...(it.bullets ?? []));
      if (title === "Certifications & Training") out.push(it.name, it.status === "earned" && it.issued ? it.issued : STATUS[it.status]);
      if (title === "Skills") out.push(`${it.label}:`, it.text);
    }
  }
  return out.map(s => String(s ?? "").trim()).filter(Boolean);
}

// Each piece must appear whole (no words split apart by letter-spacing or small caps), in order
// (no column or sidebar text cutting in), ignoring case and line breaks.
function expectReadsInOrder(text, expected) {
  const norm = s => s.replace(/\s+/g, " ").trim().toLowerCase();
  const all = norm(text);
  let pos = 0;
  for (const piece of expected) {
    const at = all.indexOf(norm(piece), pos);
    expect(at, `"${piece}" should come next, whole, after: …${all.slice(Math.max(0, pos - 80), pos)}`).toBeGreaterThanOrEqual(pos);
    pos = at + norm(piece).length;
  }
}

test("an ATS reads the CV PDF in order, with every word whole", async () => {
  test.setTimeout(60_000);
  const text = await pdfText(await cvPdf());
  expectReadsInOrder(text, expectedOrder(data));
  // the words the old two-column CV used to break ("git hub.com/Lect rik0", "E ducation")
  for (const word of ["github.com/Lectrik0", "lectrik0.github.io", "GitHub Actions"]) expect(text).toContain(word);
  for (const heading of ["EDUCATION", "EXPERIENCE"]) expect(text.toUpperCase()).toContain(heading);
});

test("an ATS reads the CV in order after content edits too", async () => {
  test.setTimeout(60_000);
  const d = copyOfData();
  d.cv.experience.push({ title: "Volunteer", org: "Club", location: "Cairo, Egypt", dates: "2025", bullets: ["Helped run a security workshop"] });
  d.cv.projects.push({ title: "Home lab", stack: "Proxmox, pfSense", dates: "2027", bullets: ["Built a lab"] });
  d.certs.push({ name: "Test certificate", short: "TST", status: "earned", verify: "https://www.credly.com/badges/test" });
  const site = await siteFrom(d);
  try {
    expectReadsInOrder(await pdfText(await cvPdf({ root: site.root })), expectedOrder(d));
  } finally {
    site.close();
  }
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the Download PDF button gets the committed PDF", async ({ page }) => {
    await page.goto("/cv.html");
    const button = page.getByRole("link", { name: "Download PDF" });
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute("download", /\.pdf$/);
    const res = await page.request.get(new URL(await button.getAttribute("href"), page.url()).href);
    expect(res.headers()["content-type"]).toBe("application/pdf");
    const body = await res.body();
    expect(pageCount(body)).toBe(1);
    expect(body.equals(readFileSync(new URL("../../cv.pdf", import.meta.url)))).toBe(true);
  });

  test("the Spanish CV's Descargar PDF button gets its own committed PDF", async ({ page }) => {
    await page.goto("/es/cv.html");
    const button = page.getByRole("link", { name: "Descargar PDF" });
    await expect(button).toHaveAttribute("download", /-CV-ES\.pdf$/);
    const res = await page.request.get(new URL(await button.getAttribute("href"), page.url()).href);
    expect(res.headers()["content-type"]).toBe("application/pdf");
    const body = await res.body();
    expect(pageCount(body)).toBe(1);
    expect(body.equals(readFileSync(new URL("../../cv-es.pdf", import.meta.url)))).toBe(true);
  });
});
