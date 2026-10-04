"use strict";
/*
 * Backstage: the site's content editor.
 *
 * How access works (nothing secret lives in this repo):
 * - The real key is a GitHub fine-grained token that can only write to this one repo.
 * - On first use, the token is encrypted in the browser with AES-GCM-256. The key is derived
 *   from the password with PBKDF2-SHA256 (600,000 rounds); the username is bound in as
 *   authenticated data. Only the ciphertext, salt and IV are stored, in this browser only.
 * - Unlocking decrypts the token into memory. Locking, closing the tab or 30 idle minutes forgets it.
 * - Edits are saved by committing data/site.json through the GitHub API. The CI workflow then checks
 *   the content, renders it into the pages and publishes them (.github/workflows/ci.yml).
 * - Like the public pages: no innerHTML, CSP + Trusted Types, and connect-src limited to GitHub's API.
 */
(() => {
  const OWNER = "Lectrik0", REPO = "Lectrik0.github.io", BRANCH = "main", PATH = "data/site.json", SCHEMA_PATH = "data/site.schema.json";
  const CHECKS_URL = `https://github.com/${OWNER}/${REPO}/actions`;
  const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
  const VAULT_KEY = "aa-backstage-vault";
  const ITERATIONS = 600000;
  const IDLE_MS = 30 * 60 * 1000;

  const $ = id => document.getElementById(id);
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  let token = null;        // only ever in memory
  let data = null;         // working copy
  let original = "";       // JSON of last published version
  let sha = null;          // blob sha for optimistic concurrency
  let schema = null;       // data/site.schema.json, the rules CI checks the content with
  let problems = null;     // what the last check found (null = no check shown yet)
  let tab = "profile";
  let idleTimer = null;

  /* ---------- tiny DOM helper (text only, never HTML) ---------- */
  function el(tag, attrs = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "text") n.textContent = String(v);
      else if (k === "on") for (const [ev, fn] of Object.entries(v)) n.addEventListener(ev, fn);
      else if (k === "value") n.value = v;
      else n.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of children) if (c !== null && c !== undefined && c !== false) n.append(c);
    return n;
  }
  const show = id => ["view-setup", "view-login", "view-editor"].forEach(v => { $(v).hidden = v !== id; });
  const say = (id, text, state) => { $(id).textContent = text; if (state) $(id).dataset.state = state; else delete $(id).dataset.state; };

  /* ================= vault ================= */
  async function deriveKey(password, salt) {
    const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function seal(username, password, secret) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(username) }, key, enc.encode(secret));
    return { v: 1, iter: ITERATIONS, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
  }
  async function open(vault, username, password) {
    const key = await deriveKey(password, unb64(vault.salt));
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(vault.iv), additionalData: enc.encode(username) }, key, unb64(vault.ct));
    return dec.decode(pt);
  }
  function readVault() {
    try {
      const v = JSON.parse(localStorage.getItem(VAULT_KEY) || "null");
      if (v && v.v === 1 && typeof v.salt === "string" && typeof v.iv === "string" && typeof v.ct === "string") return v;
    } catch (e) { /* unreadable */ }
    return null;
  }

  /* ================= GitHub API ================= */
  async function gh(path, opts = {}) {
    const r = await fetch(API + path, {
      ...opts,
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", Authorization: `Bearer ${token}`, ...(opts.headers || {}) }
    });
    if (!r.ok) {
      const err = new Error(`GitHub answered ${r.status}`);
      err.status = r.status;
      throw err;
    }
    return r.json();
  }
  const toB64Utf8 = text => { const bytes = enc.encode(text); let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const fromB64Utf8 = s => dec.decode(unb64(s.replace(/\s/g, "")));

  async function load() {
    const [f, s] = await Promise.all([
      gh(`/contents/${PATH}?ref=${BRANCH}`),
      gh(`/contents/${SCHEMA_PATH}?ref=${BRANCH}`).catch(() => null)
    ]);
    try { schema = s ? JSON.parse(fromB64Utf8(s.content)) : null; } catch (e) { schema = null; }
    sha = f.sha;
    original = JSON.stringify(JSON.parse(fromB64Utf8(f.content)), null, 1);
    data = JSON.parse(original);
  }
  async function publish() {
    const body = JSON.stringify(data, null, 1) + "\n";
    const res = await gh(`/contents/${PATH}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Update site content from Backstage", content: toB64Utf8(body), sha, branch: BRANCH })
    });
    sha = res.content.sha;
    original = JSON.stringify(data, null, 1);
    return res.commit && res.commit.html_url;
  }

  /* ================= what can be edited ================= */
  const T = (label, extra = {}) => ({ type: "text", label, ...extra });
  const A = (label, extra = {}) => ({ type: "textarea", label, ...extra });
  const STR_LIST = (label, extra = {}) => ({ type: "strings", label, ...extra });
  const LIST = (label, item, extra = {}) => ({ type: "list", label, item, ...extra });
  const SEL = (label, options, extra = {}) => ({ type: "select", label, options, ...extra });

  const TABS = [
    { id: "profile", label: "Profile", fields: [
      ["profile", { type: "object", label: "Profile", fields: {
        name: T("Name"), tagline: A("Tagline under your name"), location: T("Location"),
        linkedin: T("LinkedIn URL", { kind: "url" }), github: T("GitHub URL", { kind: "url" }),
        email: T("Email (shown on the home page, the CV and in security.txt; leave empty to hide)", { kind: "email" }), cv: T("CV link", { help: "cv.html, or a PDF like cv.pdf" }) } }],
      ["internship", { type: "object", label: "Internship progress bar", fields: {
        start: T("Start date", { kind: "date" }), end: T("End date", { kind: "date" }) } }]
    ] },
    { id: "story", label: "Story", fields: [
      ["story", LIST("Chapters", { title: T("Title"), text: A("Text") }, { fixed: true, name: (it, i) => `Chapter ${i + 1}`, help: "The five drawings are fixed, so chapters can be edited but not added or removed." })]
    ] },
    { id: "courses", label: "Courses", fields: [
      ["courses", { type: "object", label: "University", fields: {
        university: T("University"), degree: T("Degree"), major: T("Major"),
        semesters: LIST("Semesters", {
          name: T("Name"), status: SEL("Status", [["completed", "Completed"], ["current", "In progress"], ["upcoming", "Upcoming"]], { default: "upcoming" }),
          courses: LIST("Courses", { name: T("Course"), ects: T("ECTS", { kind: "number" }) }, { name: it => it.name || "New course", compact: true })
        }, { name: it => it.name || "New semester" }) } }]
    ] },
    { id: "skills", label: "Skills", fields: [
      ["skills", LIST("Skill groups", {
        group: T("Group name"), note: T("Short note"),
        color: SEL("Colour", [["teal", "Teal"], ["blue", "Blue"], ["purple", "Purple"], ["green", "Green"]]),
        items: STR_LIST("Skills", { placeholder: "Add a skill" }) }, { name: it => it.group || "New group" })]
    ] },
    { id: "certs", label: "Certifications", fields: [
      ["certs", LIST("Certifications", {
        name: T("Name"), short: T("Badge text (max 7 characters, e.g. AZ-900)", { max: 7 }),
        status: SEL("Status", [["earned", "Earned"], ["progress", "In progress"], ["planned", "Planned"]], { default: "planned" }) }, { name: it => it.name || "New certification" })]
    ] },
    { id: "posts", label: "Write-ups", fields: [
      ["posts", LIST("Write-ups", {
        title: T("Title"), date: T("Date", { kind: "date" }), tag: T("Tag"), summary: A("Summary"),
        url: T("Link", { help: "A page on this site like writeups/my-lab.html, or an https:// link" }) }, { name: it => it.title || "New write-up", help: "The site lists them newest first, by date." })]
    ] },
    { id: "cv", label: "CV", fields: [
      ["cv", { type: "object", label: "CV", fields: {
        headline: T("Headline"), summary: A("Profile summary"),
        education: LIST("Education", { title: T("Degree"), org: T("School"), dates: T("Dates"), details: A("Details") }, { name: it => it.title || "New entry" }),
        experience: LIST("Experience", { title: T("Role"), org: T("Company"), dates: T("Dates"), bullets: STR_LIST("Bullet points", { long: true, placeholder: "Add a bullet point" }) }, { name: it => [it.title, it.org].filter(Boolean).join(", ") || "New role" }),
        projects: LIST("Projects", { title: T("Project"), dates: T("Dates"), bullets: STR_LIST("Bullet points", { long: true, placeholder: "Add a bullet point" }) }, { name: it => it.title || "New project" }),
        skills: LIST("Skills lines", { label: T("Label"), text: T("Skills") }, { name: it => it.label || "New line", compact: true }),
        languages: STR_LIST("Languages", { placeholder: "e.g. Arabic (native)" }) } }]
    ] }
  ];

  /* ================= editor rendering ================= */
  let uid = 0;
  const nextId = () => `f${++uid}`;

  function blankFor(fields) {
    const o = {};
    for (const [k, f] of Object.entries(fields)) o[k] = f.type === "list" || f.type === "strings" ? [] : f.type === "select" ? (f.default ?? f.options[0][0]) : f.kind === "number" ? 0 : "";
    return o;
  }

  function fieldInput(obj, key, f) {
    const id = nextId();
    let input;
    if (f.type === "textarea") {
      input = el("textarea", { id, rows: 3, value: obj[key] ?? "" });
    } else if (f.type === "select") {
      input = el("select", { id }, ...f.options.map(([v, l]) => el("option", { value: v, text: l })));
      input.value = obj[key] ?? f.options[0][0];
    } else {
      const type = f.kind === "date" ? "date" : f.kind === "number" ? "number" : f.kind === "email" ? "email" : f.kind === "url" ? "url" : "text";
      input = el("input", { id, type, value: obj[key] ?? "", maxlength: f.max || null, min: f.kind === "number" ? 0 : null, inputmode: f.kind === "number" ? "numeric" : null });
    }
    input.addEventListener("input", () => {
      obj[key] = f.kind === "number" ? (input.value === "" ? 0 : Number(input.value)) : input.value;
      changed();
    });
    bindField(input, obj, key);
    return el("div", { class: `bs-field${f.type === "textarea" ? " wide" : ""}` },
      el("label", { for: id, text: f.label }), input, f.help ? el("small", { text: f.help }) : null);
  }

  function renderObject(obj, fields) {
    const wrap = el("div", { class: "bs-grid" });
    for (const [key, f] of Object.entries(fields)) {
      if (f.type === "list") { if (!Array.isArray(obj[key])) obj[key] = []; wrap.append(renderList(obj[key], f)); }
      else if (f.type === "strings") { if (!Array.isArray(obj[key])) obj[key] = []; wrap.append(renderStrings(obj[key], f)); }
      else wrap.append(fieldInput(obj, key, f));
    }
    return wrap;
  }

  // Reorder helper shared by drag-and-drop and the arrow buttons
  function move(list, from, to) {
    if (to < 0 || to >= list.length || from === to) return false;
    const [it] = list.splice(from, 1);
    list.splice(to, 0, it);
    changed();
    return true;
  }

  function makeDraggable(node, handle, list, index, rerender) {
    handle.addEventListener("pointerdown", () => { node.draggable = true; });
    node.addEventListener("dragstart", e => { e.stopPropagation(); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(index)); node.classList.add("dragging"); dragSource = { list, index }; });
    node.addEventListener("dragend", () => { node.draggable = false; node.classList.remove("dragging"); dragSource = null; });
    node.addEventListener("dragover", e => { if (dragSource && dragSource.list === list) { e.preventDefault(); e.stopPropagation(); node.classList.add("over"); } });
    node.addEventListener("dragleave", () => node.classList.remove("over"));
    node.addEventListener("drop", e => {
      node.classList.remove("over");
      if (!dragSource || dragSource.list !== list) return;
      e.preventDefault(); e.stopPropagation();
      if (move(list, dragSource.index, index)) rerender();
    });
  }
  let dragSource = null;

  function renderList(list, f) {
    const box = el("div", { class: `bs-list${f.item && Object.keys(f.item).length <= 2 && f.compact ? " compact" : ""}` });
    const draw = () => {
      const items = list.map((it, i) => {
        const titleEl = el("span", { class: "bs-item-title", text: f.name ? f.name(it, i) : `Item ${i + 1}` });
        titleEl._calc = () => (f.name ? f.name(it, i) : `Item ${i + 1}`);
        const handle = el("button", { type: "button", class: "bs-handle", "aria-label": "Drag to reorder", title: "Drag to reorder", text: "⋮⋮" });
        handle.addEventListener("click", e => e.preventDefault());
        if (f.fixed) handle.hidden = true;
        const body = renderObject(it, f.item);
        const details = el("details", { class: "bs-item", open: list.length <= 3 || f.compact ? true : null },
          el("summary", {}, handle, titleEl,
            el("span", { class: "bs-item-actions" },
              f.fixed ? null : el("button", { type: "button", class: "bs-icon", "aria-label": "Move up", title: "Move up", text: "↑", on: { click: e => { e.preventDefault(); if (move(list, i, i - 1)) draw(); } } }),
              f.fixed ? null : el("button", { type: "button", class: "bs-icon", "aria-label": "Move down", title: "Move down", text: "↓", on: { click: e => { e.preventDefault(); if (move(list, i, i + 1)) draw(); } } }),
              f.fixed ? null : el("button", { type: "button", class: "bs-icon danger", "aria-label": "Delete", title: "Delete", text: "✕", on: { click: e => { e.preventDefault(); const [gone] = list.splice(i, 1); changed(); draw(); toast(`Deleted. `, () => { list.splice(i, 0, gone); changed(); draw(); }); } } }))),
          body);
        if (!f.fixed) makeDraggable(details, handle, list, i, draw);
        // keep titles live while typing
        body.querySelectorAll("input, textarea, select").forEach(inp => inp.addEventListener("input", () => { titleEl.textContent = titleEl._calc(); }));
        return details;
      });
      const add = f.fixed ? null : el("button", { type: "button", class: "btn ghost bs-add", text: `Add ${singular(f.label)}`, on: { click: () => { list.push(blankFor(f.item)); changed(); draw(); const last = box.querySelectorAll(":scope > .bs-items > details"); if (last.length) { last[last.length - 1].open = true; last[last.length - 1].querySelector("input, textarea")?.focus(); } } } });
      box.replaceChildren(
        el("div", { class: "bs-list-head" }, el("h3", { text: f.label }), f.help ? el("small", { text: f.help }) : null),
        el("div", { class: "bs-items" }, ...items),
        add);
    };
    draw();
    return box;
  }

  function renderStrings(list, f) {
    const box = el("div", { class: "bs-strings" });
    const id = nextId();
    const draw = () => {
      const chips = list.map((s, i) => {
        const handle = el("span", { class: "bs-handle", "aria-hidden": "true", text: "⋮⋮" });
        const input = el("input", { type: "text", value: s, "aria-label": `${f.label} ${i + 1}`, class: f.long ? "long" : null });
        input.addEventListener("input", () => { list[i] = input.value; changed(); });
        bindField(input, list, i);
        const chip = el("div", { class: `bs-chip${f.long ? " long" : ""}` }, handle, input,
          el("button", { type: "button", class: "bs-icon", "aria-label": "Move up", title: "Move up", text: "↑", on: { click: () => { if (move(list, i, i - 1)) draw(); } } }),
          el("button", { type: "button", class: "bs-icon danger", "aria-label": `Delete ${s}`, title: "Delete", text: "✕", on: { click: () => { list.splice(i, 1); changed(); draw(); } } }));
        makeDraggable(chip, handle, list, i, draw);
        return chip;
      });
      const adder = el("input", { id, type: "text", placeholder: f.placeholder || "Add", class: f.long ? "long" : null });
      const addIt = () => { const v = adder.value.trim(); if (!v) return; list.push(v); changed(); draw(); box.querySelector(`#${id}`)?.focus(); };
      adder.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addIt(); } });
      box.replaceChildren(
        el("label", { for: id, text: f.label }),
        el("div", { class: `bs-chips${f.long ? " long" : ""}` }, ...chips),
        el("div", { class: "bs-adder" }, adder, el("button", { type: "button", class: "btn ghost", text: "Add", on: { click: addIt } })));
    };
    draw();
    return box;
  }

  const singular = label => ({ "Chapters": "chapter", "Semesters": "semester", "Courses": "course", "Skill groups": "skill group", "Certifications": "certification", "Write-ups": "write-up", "Education": "education entry", "Experience": "role", "Projects": "project", "Skills lines": "skills line" }[label] || "item");

  function renderTab() {
    $("tabs").replaceChildren(...TABS.map(t => el("button", { type: "button", class: "bs-tab", "aria-current": t.id === tab ? "page" : null, text: t.label,
      on: { click: () => { tab = t.id; renderTab(); } } })));
    const t = TABS.find(x => x.id === tab);
    const blocks = t.fields.map(([key, f]) => {
      if (f.type === "list") { if (!Array.isArray(data[key])) data[key] = []; return el("div", { class: "frame cut-a bs-block" }, el("div", { class: "in" }, renderList(data[key], f))); }
      if (!data[key] || typeof data[key] !== "object") data[key] = {};
      return el("div", { class: "frame cut-a bs-block" }, el("div", { class: "in" }, el("h2", { text: f.label }), renderObject(data[key], f.fields)));
    });
    $("panel").replaceChildren(...blocks);
    markInvalid();
  }

  /* ================= checks before publishing =================
     The same rules CI applies (assets/content-check.js + data/site.schema.json), so content that
     would fail on GitHub is caught here, with the field named, instead of failing silently later. */
  const fields = new WeakMap();   // input element → the {obj, key} it edits
  function bindField(input, obj, key) { fields.set(input, { obj, key }); input.dataset.field = ""; }

  // The input that edits the value at `path` (only on the tab that's showing), or null.
  function findInput(path) {
    let parent = data;
    for (const p of path.slice(0, -1)) parent = parent == null ? parent : parent[p];
    const key = path[path.length - 1];
    return [...document.querySelectorAll("#panel [data-field]")].find(n => {
      const f = fields.get(n);
      return f && f.obj === parent && f.key === key;
    }) || null;
  }

  // ["certs", 4, "name"] → "Certifications › #5 (New certification) › Name"
  function describe(path) {
    const t = TABS.find(x => x.fields.some(([k]) => k === path[0]));
    if (!t) return ContentCheck.formatPath(path);
    let f = t.fields.find(([k]) => k === path[0])[1], value = data[path[0]];
    const parts = [t.label];
    const short = label => label.replace(/\s*\(.*\)$/, "");
    for (const p of path.slice(1)) {
      if (f && f.type === "object") { f = f.fields[p]; parts.push(f ? short(f.label) : String(p)); value = value == null ? value : value[p]; }
      else if (f && f.type === "list") { const it = value && value[p]; parts.push(`#${p + 1}${f.name ? ` (${f.name(it || {}, p)})` : ""}`); f = { type: "object", fields: f.item }; value = it; }
      else if (f && f.type === "strings") { parts.push(`#${p + 1}`); f = null; }
      else parts.push(String(p));
    }
    if (f && f.type === "list" && parts.length === 1) parts.push(f.label);
    return parts.join(" › ");
  }

  const tabFor = path => (TABS.find(x => x.fields.some(([k]) => k === path[0])) || TABS[0]).id;
  const valueAt = path => path.reduce((v, p) => (v == null ? v : v[p]), data);
  let linkProblems = [];

  function contentProblems() {
    const found = [...(schema ? ContentCheck.validate(schema, data) : []), ...ContentCheck.crossCheck(data)];
    // a link problem stays until that link is edited (it's re-checked on the next publish)
    return [...found, ...linkProblems.filter(p => valueAt(p.path) === p.value)];
  }

  // Asks GitHub whether each link to a page on this site points at a file that exists.
  async function checkLinks() {
    const results = await Promise.all(ContentCheck.localLinks(data).map(async l => {
      try { await gh(`/contents/${l.file.split("/").map(encodeURIComponent).join("/")}?ref=${BRANCH}`); return null; }
      catch (e) { return e.status === 404 ? { path: l.path, value: valueAt(l.path), message: `There's no page at ${l.file} yet. Add that page first, or use an https:// link.` } : null; }
    }));
    linkProblems = results.filter(Boolean);
  }

  function markInvalid() {
    document.querySelectorAll("#panel [aria-invalid]").forEach(n => n.removeAttribute("aria-invalid"));
    for (const p of problems || []) { const n = findInput(p.path); if (n) n.setAttribute("aria-invalid", "true"); }
  }

  function showProblems() {
    const box = $("problems");
    box.hidden = !problems || !problems.length;
    $("problems-list").replaceChildren(...(problems || []).map(p => el("li", {},
      el("b", { text: describe(p.path) }), " ", el("span", { text: p.message }), " ",
      el("button", { type: "button", class: "linkish", text: "Show", on: { click: () => reveal(p.path) } }))));
    markInvalid();
  }

  function reveal(path) {
    if (tab !== tabFor(path)) { tab = tabFor(path); renderTab(); }
    const n = findInput(path);
    const target = n || $("panel");
    for (let d = target.closest("details"); d; d = d.parentElement.closest("details")) d.open = true;
    target.scrollIntoView({ block: "center" });
    if (n) n.focus();
  }

  /* ================= state + status ================= */
  function changed() {
    const dirty = JSON.stringify(data, null, 1) !== original;
    $("publish").disabled = !dirty;
    $("discard").disabled = !dirty;
    $("status").textContent = dirty ? "Unsaved changes" : "Up to date with the live site";
    $("status").dataset.state = dirty ? "dirty" : "clean";
    if (problems) { problems = contentProblems(); showProblems(); }   // keep the list current while fixing
  }
  let toastTimer = null;
  function toast(text, undo, link) {
    const t = $("toast");
    t.replaceChildren(document.createTextNode(text),
      undo ? el("button", { type: "button", class: "linkish", text: "Undo", on: { click: () => { undo(); t.hidden = true; } } }) : "",
      link ? el("a", { href: link.href, target: "_blank", rel: "noopener noreferrer", text: link.text }) : "");
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, undo || link ? 9000 : 5000);
  }

  function lock(reason) {
    token = null; data = null; original = ""; sha = null; schema = null; problems = null; linkProblems = [];
    showProblems();
    $("panel").replaceChildren();
    $("login-pass").value = "";
    say("login-msg", reason || "");
    show(readVault() ? "view-login" : "view-setup");
  }
  function touch() {
    clearTimeout(idleTimer);
    if (token) idleTimer = setTimeout(() => lock("Locked after 30 minutes without activity."), IDLE_MS);
  }
  ["pointerdown", "keydown"].forEach(ev => addEventListener(ev, touch, { passive: true }));
  addEventListener("beforeunload", e => { if (data && JSON.stringify(data, null, 1) !== original) { e.preventDefault(); e.returnValue = ""; } });

  async function enterEditor() {
    show("view-editor");
    $("status").textContent = "Loading from GitHub…";
    try {
      await load();
      renderTab();
      changed();
      touch();
    } catch (e) {
      lock(e.status === 401 ? "GitHub rejected the token. It may have expired: use “Forget this device” and set it up with a new token."
        : e.status === 404 || e.status === 403 ? "This token can't read the repo. Check it has Contents: Read and write on Lectrik0.github.io."
        : "Couldn't reach GitHub. Check your connection and try again.");
    }
  }

  /* ================= wiring ================= */
  if (!window.crypto || !crypto.subtle) {
    document.querySelector(".bs-wrap").replaceChildren(el("p", { text: "This browser can't run Backstage. Use a recent Chrome, Edge, Firefox or Safari over HTTPS." }));
    return;
  }

  $("setup-form").addEventListener("submit", async e => {
    e.preventDefault();
    const u = $("setup-user").value.trim(), p = $("setup-pass").value, p2 = $("setup-pass2").value, t = $("setup-token").value.trim();
    if (!u || !p || !t) return say("setup-msg", "Fill in all four fields.", "bad");
    if (p !== p2) return say("setup-msg", "The two passwords don't match.", "bad");
    if (p.length < 10) return say("setup-msg", "Use a password of at least 10 characters.", "bad");
    if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(t)) return say("setup-msg", "That doesn't look like a GitHub token. It should start with github_pat_.", "bad");
    say("setup-msg", "Checking the token with GitHub…");
    token = t;
    try {
      const repo = await gh("");
      if (!repo.permissions || !repo.permissions.push) throw Object.assign(new Error("no push"), { status: 403 });
    } catch (err) {
      token = null;
      return say("setup-msg", err.status === 401 ? "GitHub rejected this token." : "This token can't write to Lectrik0.github.io. Give it Contents: Read and write on that repo.", "bad");
    }
    say("setup-msg", "Encrypting…");
    try {
      localStorage.setItem(VAULT_KEY, JSON.stringify(await seal(u, p, t)));
    } catch (err) {
      token = null;
      return say("setup-msg", "This browser won't store data for this site (private window?). Use a normal window.", "bad");
    }
    $("setup-form").reset();
    say("setup-msg", "");
    enterEditor();
  });

  let failures = 0;
  $("login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const vault = readVault();
    if (!vault) return show("view-setup");
    const btn = e.submitter || $("login-form").querySelector("button");
    btn.disabled = true;
    say("login-msg", "Unlocking…");
    try {
      token = await open(vault, $("login-user").value.trim(), $("login-pass").value);
      failures = 0;
      $("login-pass").value = "";
      say("login-msg", "");
      enterEditor();
    } catch (err) {
      failures++;
      await new Promise(r => setTimeout(r, Math.min(failures, 10) * 1000));
      say("login-msg", "Wrong username or password.", "bad");
    } finally {
      btn.disabled = false;
    }
  });

  $("forget-device").addEventListener("click", () => {
    const b = $("forget-device");
    if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Click again to remove the saved token from this browser"; return; }
    try { localStorage.removeItem(VAULT_KEY); } catch (e) { /* ignore */ }
    b.dataset.armed = ""; b.textContent = "Forget this device";
    lock();
  });

  $("lock").addEventListener("click", () => {
    if (!$("publish").disabled) {
      const b = $("lock");
      if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Lock and lose changes?"; setTimeout(() => { b.dataset.armed = ""; b.textContent = "Lock"; }, 4000); return; }
    }
    lock();
  });

  $("discard").addEventListener("click", () => {
    data = JSON.parse(original); problems = null; linkProblems = [];
    showProblems(); renderTab(); changed(); toast("Changes discarded.");
  });

  $("publish").addEventListener("click", async () => {
    const b = $("publish");
    b.disabled = true;
    $("status").textContent = "Checking…";
    await checkLinks();
    problems = contentProblems();
    showProblems();
    if (problems.length) {
      b.disabled = false;
      $("status").textContent = `Fix ${problems.length} problem${problems.length === 1 ? "" : "s"} before publishing`;
      $("status").dataset.state = "dirty";
      $("problems-h").focus();
      return;
    }
    problems = null;
    showProblems();
    $("status").textContent = "Publishing…";
    try {
      await publish();
      changed();
      toast("Published. GitHub now checks the content and rebuilds the site; it's live in a few minutes. ", null,
        { href: CHECKS_URL, text: "Follow the checks" });
    } catch (e) {
      b.disabled = false;
      $("status").textContent = "Unsaved changes";
      toast(e.status === 409 ? "The file changed on GitHub since you opened it. Copy your edits, lock, unlock and redo them."
        : e.status === 401 ? "GitHub rejected the token. It may have expired."
        : "Publishing failed. Check your connection and try again.");
    }
  });

  show(readVault() ? "view-login" : "view-setup");
})();
