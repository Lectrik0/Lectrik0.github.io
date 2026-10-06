#!/usr/bin/env node
/**
 * Makes assets/qr-cv.svg: a QR code that opens the CV page, printed on the job-fair cards (card.html).
 * Uses a dev tool (@paulmillr/qr, no dependencies of its own), so it isn't part of the build: run
 * `npm run qr` only if the site's address changes. A unit test checks the file still decodes to the CV.
 *
 * The SVG is one path (each run of dark modules is a rectangle), black on white with a quiet zone,
 * medium error correction, so it scans from a printed card or a phone screen.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import encodeQR from "@paulmillr/qr";
import { siteConfig } from "./build.mjs";

export const qrTarget = () => `${siteConfig().url}cv.html`;

export function qrSvg(text) {
  const m = encodeQR(text, "raw", { ecc: "medium", border: 4 });
  const n = m.length;
  let d = "";
  m.forEach((row, y) => {
    for (let x = 0; x < n; x++) {
      if (!row[x]) continue;
      let w = 1;
      while (x + w < n && row[x + w]) w++;
      d += `M${x} ${y}h${w}v1h-${w}z`;
      x += w - 1;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">` +
    `<rect width="${n}" height="${n}" fill="#fff"/><path fill="#000" d="${d}"/></svg>\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(new URL("../assets/qr-cv.svg", import.meta.url), qrSvg(qrTarget()));
  console.log(`assets/qr-cv.svg → ${qrTarget()}`);
}
