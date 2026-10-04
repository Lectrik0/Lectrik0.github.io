#!/usr/bin/env node
/*
 * Checks data/site.json with the same rules Backstage applies before publishing
 * (assets/content-check.js + data/site.schema.json), and prints any problem in plain words.
 * CI runs this first, so a content mistake fails with a message like
 *   certs › #5 › name: Can't be empty.
 * instead of a confusing error from a later step.
 *
 *   node scripts/check-content.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "../assets/content-check.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const { validate, crossCheck, localLinks, formatPath } = globalThis.ContentCheck;

export function checkContent(root = ROOT) {
  let data;
  try {
    data = JSON.parse(readFileSync(join(root, "data/site.json"), "utf8"));
  } catch (err) {
    return [{ path: [], message: `data/site.json isn't valid JSON: ${err.message}` }];
  }
  const schema = JSON.parse(readFileSync(join(root, "data/site.schema.json"), "utf8"));
  const missing = localLinks(data).filter(l => !existsSync(join(root, l.file)))
    .map(l => ({ path: l.path, message: `There's no page at ${l.file} on this site.` }));
  return [...validate(schema, data), ...crossCheck(data), ...missing];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = checkContent();
  if (!problems.length) {
    console.log("Content is OK.");
  } else {
    console.error(`data/site.json has ${problems.length} problem${problems.length === 1 ? "" : "s"}:`);
    for (const p of problems) {
      console.error(`  ${formatPath(p.path)}: ${p.message}`);
      if (process.env.GITHUB_ACTIONS) console.log(`::error file=data/site.json,title=Content problem::${formatPath(p.path)}: ${p.message}`);
    }
    process.exit(1);
  }
}
