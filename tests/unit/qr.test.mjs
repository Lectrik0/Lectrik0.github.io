// The job-fair cards carry a QR code (assets/qr-cv.svg, made by scripts/qr.mjs). This reads the committed
// file back into modules, as a phone camera would, and checks it opens the CV.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import decodeQR from "@paulmillr/qr/decode.js";
import { qrSvg, qrTarget } from "../../scripts/qr.mjs";

const svg = readFileSync(new URL("../../assets/qr-cv.svg", import.meta.url), "utf8");

function decodeSvg(text, scale = 6) {
  const n = Number(/viewBox="0 0 (\d+) \1"/.exec(text)[1]), W = n * scale;
  const data = new Uint8Array(W * W * 3).fill(255);
  for (const [, x, y, w] of text.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g))
    for (let dy = 0; dy < scale; dy++) data.fill(0, ((+y * scale + dy) * W + +x * scale) * 3, ((+y * scale + dy) * W + (+x + +w) * scale) * 3);
  return decodeQR({ width: W, height: W, data });
}

test("the card's QR code opens the CV page", () => {
  assert.equal(decodeSvg(svg), qrTarget());
});

test("the committed QR code is up to date with the site's address (npm run qr)", () => {
  assert.equal(svg, qrSvg(qrTarget()));
});
