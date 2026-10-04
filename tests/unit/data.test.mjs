import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = new URL("../../", import.meta.url);
const data = JSON.parse(readFileSync(new URL("data/site.json", root), "utf8"));
const schema = JSON.parse(readFileSync(new URL("data/site.schema.json", root), "utf8"));

test("data/site.json matches data/site.schema.json", () => {
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const ok = validate(data);
  const errors = (validate.errors || []).map(e => `  ${e.instancePath || "(root)"} ${e.message}${e.params?.additionalProperty ? `: ${e.params.additionalProperty}` : ""}`);
  assert.ok(ok, `site.json has problems:\n${errors.join("\n")}`);
});

test("the internship ends after it starts", () => {
  assert.ok(Date.parse(data.internship.end) > Date.parse(data.internship.start));
});

test("links to pages on this site point at files that exist", () => {
  const local = [data.profile.cv, ...data.posts.map(p => p.url)].filter(u => !/^https:/.test(u));
  for (const url of local) {
    const path = url.split(/[?#]/)[0].replace(/^\//, "");
    assert.ok(existsSync(new URL(path, root)), `${url} doesn't exist`);
  }
});
