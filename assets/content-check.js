"use strict";
/*
 * Content checks shared by Backstage (in the browser) and CI (scripts/check-content.mjs).
 *
 * validate(schema, data) checks data/site.json against data/site.schema.json — the same file CI checks
 * with Ajv — so Backstage can refuse to publish content that CI would reject, and say why in plain words.
 * It understands exactly the JSON Schema keywords that schema uses and throws on any other, so a schema
 * change it can't follow fails the tests (tests/unit/content-check.test.mjs) instead of passing silently.
 * A failing string field reports the schema's own `description` as its message.
 *
 * crossCheck(data) adds the rules a schema can't express, and localLinks(data) lists the links to pages
 * on this site, which the caller checks exist (Backstage asks GitHub; CI looks on disk).
 *
 * Each problem is { path: ["certs", 4, "name"], message: "Can't be empty." }.
 */
(() => {
  const KNOWN = new Set(["$schema", "$id", "$defs", "title", "description", "type", "required", "properties",
    "additionalProperties", "items", "minItems", "maxItems", "minLength", "maxLength", "pattern", "enum",
    "const", "anyOf", "$ref", "format", "minimum", "maximum"]);
  // Same rules as Ajv's "full" formats (ajv-formats).
  const FORMATS = {
    date: v => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
      if (!m) return false;
      const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
    },
    email: v => /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(v)
  };
  const typeOf = v => Array.isArray(v) ? "array" : v === null ? "null" : typeof v === "number" ? (Number.isFinite(v) ? "number" : "nan") : typeof v;
  const KIND = { array: "a list", object: "a group of fields", string: "text", number: "a number", boolean: "yes or no" };
  const chars = n => `${n} character${n === 1 ? "" : "s"}`;
  const entries = n => `${n} ${n === 1 ? "entry" : "entries"}`;

  function validate(schema, data) {
    const resolve = ref => {
      const m = /^#\/\$defs\/([\w-]+)$/.exec(ref);
      if (!m || !schema.$defs || !schema.$defs[m[1]]) throw new Error(`content-check: can't resolve ${ref}`);
      return schema.$defs[m[1]];
    };

    function check(node, value, path) {
      for (const k of Object.keys(node)) if (!KNOWN.has(k)) throw new Error(`content-check: unsupported schema keyword "${k}"`);
      const problems = [];
      const add = message => problems.push({ path, message });

      if (node.$ref) problems.push(...check(resolve(node.$ref), value, path));
      if (node.anyOf) {
        const tries = node.anyOf.map(n => check(n, value, path));
        if (!tries.some(t => !t.length)) problems.push(...tries.reduce((a, b) => (b.length <= a.length ? b : a)));
      }
      if ("const" in node && value !== node.const) add(`Should be ${JSON.stringify(node.const)}.`);
      if (node.enum && !node.enum.includes(value)) add(`Should be one of: ${node.enum.join(", ")}.`);

      const t = typeOf(value);
      if (node.type && node.type !== t) {
        add(`Should be ${KIND[node.type] || node.type}.`);
      } else if (t === "string") {
        const length = [...value].length;
        if (node.minLength !== undefined && length < node.minLength) add(node.minLength === 1 ? "Can't be empty." : `Needs at least ${chars(node.minLength)}.`);
        if (node.maxLength !== undefined && length > node.maxLength) add(`Can be at most ${chars(node.maxLength)}.`);
        if (node.pattern !== undefined && !new RegExp(node.pattern, "u").test(value)) add("Isn't in the expected format.");
        if (node.format !== undefined) {
          if (!FORMATS[node.format]) throw new Error(`content-check: unsupported format "${node.format}"`);
          if (!FORMATS[node.format](value)) add(node.format === "date" ? "Needs a date, like 2026-10-04." : "Isn't a valid email address.");
        }
      } else if (t === "number") {
        if (node.minimum !== undefined && value < node.minimum) add(`Can't be less than ${node.minimum}.`);
        if (node.maximum !== undefined && value > node.maximum) add(`Can't be more than ${node.maximum}.`);
      } else if (t === "array") {
        if (node.minItems !== undefined && node.minItems === node.maxItems) {
          if (value.length !== node.minItems) add(`Needs exactly ${entries(node.minItems)}.`);
        } else {
          if (node.minItems !== undefined && value.length < node.minItems) add(`Needs at least ${entries(node.minItems)}.`);
          if (node.maxItems !== undefined && value.length > node.maxItems) add(`Can have at most ${entries(node.maxItems)}.`);
        }
        if (node.items) value.forEach((v, i) => problems.push(...check(node.items, v, [...path, i])));
      } else if (t === "object") {
        for (const key of node.required || []) if (!(key in value)) add(`Missing "${key}".`);
        const props = node.properties || {};
        for (const [key, v] of Object.entries(value)) {
          if (props[key]) problems.push(...check(props[key], v, [...path, key]));
          else if (node.additionalProperties === false) add(`Unknown field "${key}".`);
        }
      }

      // A failing text-like field reports its schema description instead of the raw rule it broke.
      const leaf = !node.type || (node.type !== "object" && node.type !== "array");
      const own = problems.filter(p => p.path === path);
      if (leaf && node.description && own.length) return [{ path, message: node.description }, ...problems.filter(p => p.path !== path)];
      return problems;
    }

    return check(schema, data, []);
  }

  function crossCheck(data) {
    const problems = [];
    const i = (data && data.internship) || {};
    if (FORMATS.date(String(i.start)) && FORMATS.date(String(i.end)) && i.end <= i.start) {
      problems.push({ path: ["internship", "end"], message: "Needs to be after the start date." });
    }
    // each CV version gets its own PDF, named after it (cv-<name>.pdf), so names must differ in letters/numbers
    const seen = new Map();
    ((data && data.cv && Array.isArray(data.cv.versions)) ? data.cv.versions : []).forEach((v, n) => {
      const name = v && typeof v.name === "string" ? v.name.trim() : "";
      if (!name) return;
      const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      if (!key) problems.push({ path: ["cv", "versions", n, "name"], message: "Needs at least one letter or number (it names the PDF)." });
      else if (seen.has(key)) problems.push({ path: ["cv", "versions", n, "name"], message: `Needs a different name from version #${seen.get(key) + 1}.` });
      else seen.set(key, n);
    });
    return problems;
  }

  // Links to pages on this site, as [{ path, file }]: the file each one needs, relative to the site root.
  function localLinks(data) {
    const out = [];
    const add = (path, value) => {
      if (typeof value !== "string" || !value.trim() || /^[a-z][a-z0-9+.-]*:/i.test(value.trim()) || value.trim().startsWith("//")) return;
      const file = value.trim().split(/[?#]/)[0].replace(/^\/+/, "");
      out.push({ path, file: !file || file.endsWith("/") ? `${file}index.html` : file });
    };
    add(["profile", "cv"], data && data.profile && data.profile.cv);
    ((data && data.posts) || []).forEach((p, n) => add(["posts", n, "url"], p && p.url));
    return out;
  }

  // ["certs", 4, "name"] → "certs › #5 › name"
  const formatPath = path => path.map(p => typeof p === "number" ? `#${p + 1}` : p).join(" › ") || "(whole file)";

  globalThis.ContentCheck = { validate, crossCheck, localLinks, formatPath };
})();
