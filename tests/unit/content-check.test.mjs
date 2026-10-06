// assets/content-check.js is what Backstage uses to refuse bad content before publishing.
// These tests keep it in step with Ajv, which CI uses, so the editor never lets through something CI rejects.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import "../../assets/content-check.js";

const { validate, crossCheck, localLinks, formatPath } = globalThis.ContentCheck;
const read = f => JSON.parse(readFileSync(new URL(`../../${f}`, import.meta.url), "utf8"));
const schema = read("data/site.schema.json");
const base = read("data/site.json");
const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const ajvValidate = ajv.compile(schema);

const pointer = path => path.map(p => `/${p}`).join("");
const clone = v => JSON.parse(JSON.stringify(v));
const ours = data => new Set(validate(schema, data).map(p => pointer(p.path)));
const theirs = data => (ajvValidate(data), new Set((ajvValidate.errors || []).map(e => e.instancePath)));

// Every way an edit could plausibly go wrong, applied to every field of the real content.
function* mutations(value, path = []) {
  const set = (v) => ({ path, value: v });
  if (Array.isArray(value)) {
    yield set([]);
    yield set([...value, value.length ? clone(value[0]) : ""]);
    yield set([...value, {}]);
    yield set([...value, ""]);
    yield set("not a list");
    for (let i = 0; i < value.length; i++) yield* mutations(value[i], [...path, i]);
  } else if (value && typeof value === "object") {
    yield set({ ...value, extra: "x" });
    yield set([]);
    for (const key of Object.keys(value)) {
      const { [key]: _, ...rest } = value;
      yield set(rest);
      yield* mutations(value[key], [...path, key]);
    }
  } else if (typeof value === "string") {
    for (const v of ["", "   ", "x", "LONGER", "javascript:alert(1)", "//evil.example", "https://ok.example/x", "http://insecure.example",
      "cv.html", "2026-02-30", "2026-10-04", "me@example.com", "not an email", "planned", "teal", "bogus", 7, null]) yield set(v);
  } else if (typeof value === "number") {
    for (const v of [0, -1, 61, 5.5, "5", null]) yield set(v);
  }
}

const apply = (data, { path, value }) => {
  if (!path.length) return clone(value);
  const copy = clone(data);
  let node = copy;
  for (const p of path.slice(0, -1)) node = node[p];
  node[path.at(-1)] = clone(value);
  return copy;
};

test("the real content passes both checkers", () => {
  assert.deepEqual([...ours(base)], []);
  assert.equal(ajvValidate(base), true, JSON.stringify(ajvValidate.errors));
});

test("Backstage's checker and CI's checker agree on every kind of edit", () => {
  let cases = 0, invalid = 0;
  for (const m of mutations(base)) {
    const data = apply(base, m);
    const a = ours(data), b = theirs(data);
    assert.deepEqual([...a].sort(), [...b].sort(), `disagree after setting ${pointer(m.path) || "(root)"} to ${JSON.stringify(m.value)?.slice(0, 60)}`);
    cases++;
    if (b.size) invalid++;
  }
  assert.ok(cases > 1000 && invalid > 500, `only ${cases} cases (${invalid} invalid) were tried`);
});

test("problems come with plain-language messages", () => {
  const data = clone(base);
  data.certs.push({ name: "", short: "TOO-LONG", status: "earned" });
  data.posts[0].date = "2026-13-01";
  data.posts[0].url = "javascript:alert(1)";
  data.profile.email = "not an email";
  data.profile.github = "http://github.com/x";
  data.story.pop();
  const n = data.certs.length - 1;
  const got = Object.fromEntries(validate(schema, data).map(p => [formatPath(p.path), p.message]));
  assert.deepEqual(got, {
    [`certs › #${n + 1} › name`]: "Can't be empty.",
    [`certs › #${n + 1} › short`]: "Can be at most 7 characters.",
    "posts › #1 › date": "Needs a date, like 2026-10-04.",
    "posts › #1 › url": "Needs an https:// link, or a page on this site such as cv.html or writeups/my-lab.html.",
    "profile › email": "Needs a valid email address, or leave it empty to hide it.",
    "profile › github": "Needs an https:// link.",
    "story": "Needs exactly 5 entries."
  });
});

test("a schema keyword the checker doesn't understand is an error, not a silent pass", () => {
  assert.throws(() => validate({ type: "object", oneOf: [] }, {}), /unsupported schema keyword "oneOf"/);
  assert.throws(() => validate({ type: "string", format: "uri" }, "x"), /unsupported format "uri"/);
});

test("cross-checks: the internship must end after it starts", () => {
  const data = clone(base);
  assert.deepEqual(crossCheck(data), []);
  data.internship = { start: "2027-01-16", end: "2026-07-16" };
  assert.deepEqual(crossCheck(data), [{ path: ["internship", "end"], message: "Needs to be after the start date." }]);
});

test("links to this site's own pages are listed so they can be checked", () => {
  const data = clone(base);
  data.profile.cv = "/cv.html#top";
  data.posts = [{ url: "writeups/a.html" }, { url: "https://example.com/b" }, { url: "writeups/" }, { url: "mailto:x@y.z" }];
  assert.deepEqual(localLinks(data), [
    { path: ["profile", "cv"], file: "cv.html" },
    { path: ["posts", 0, "url"], file: "writeups/a.html" },
    { path: ["posts", 2, "url"], file: "writeups/index.html" }
  ]);
});

test("CV versions need names that make distinct PDF file names", () => {
  const data = clone(base);
  data.cv.versions = [{ name: "SOC" }, { name: "soc!" }, { name: "!!!" }];
  assert.deepEqual(crossCheck(data).map(p => [formatPath(p.path), p.message]), [
    ["cv › versions › #2 › name", "Needs a different name from version #1."],
    ["cv › versions › #3 › name", "Needs at least one letter or number (it names the PDF)."]
  ]);
});
