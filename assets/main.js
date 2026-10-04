"use strict";
/*
 * Security notes
 * - No HTML strings are ever parsed: everything is built with createElement / textContent.
 *   The page's CSP enforces this with Trusted Types (any innerHTML/eval would throw).
 * - Every link is checked by safeUrl(): only https: or same-site paths are allowed,
 *   so a "javascript:" or "data:" URL can never end up in an href.
 * - External links open with rel="noopener noreferrer".
 * - Stored values (theme, found flags) are checked against allow-lists before use.
 * - Flags are compared as SHA-256 hashes, so this file doesn't give them away.
 *
 * All content lives in data/site.json. Edit it there, or use the admin page.
 */

(() => {
  const root = document.documentElement;
  root.classList.add("js");
  const $ = id => document.getElementById(id);
  const SVG_NS = "http://www.w3.org/2000/svg";
  const now = new Date();
  const SCRIPT_URL = document.currentScript ? document.currentScript.src : location.href;
  const DATA_URL = new URL("../data/site.json", SCRIPT_URL).href;
  const SITE_ROOT = new URL("../", SCRIPT_URL).href;

  /* ---------- safe building blocks ---------- */
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "text") node.textContent = String(v);
      else if (k.startsWith("on")) throw new Error("Inline handlers are not allowed");
      else node.setAttribute(k, String(v));
    }
    for (const c of children) if (c) node.append(c);
    return node;
  }
  function svg(tag, attrs = {}, ...children) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "text") node.textContent = String(v);
      else node.setAttribute(k, String(v));
    }
    for (const c of children) if (c) node.append(c);
    return node;
  }
  // Only https: links or paths on this same site. Everything else is dropped.
  function safeUrl(value, base = SITE_ROOT) {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      const u = new URL(value, base);
      if (u.protocol === "https:") return u.href;
      if (u.origin === location.origin && (u.protocol === "http:" || u.protocol === "file:")) return u.href;
    } catch (e) { /* invalid URL */ }
    return null;
  }
  function link(href, attrs, ...children) {
    const url = safeUrl(href);
    if (!url) return null;
    const external = new URL(url).origin !== location.origin;
    return el("a", { href: url, ...(external ? { target: "_blank", rel: "noopener noreferrer" } : {}), ...attrs }, ...children);
  }
  const str = v => (typeof v === "string" || typeof v === "number") ? String(v) : "";
  const arr = v => Array.isArray(v) ? v : [];
  const COLORS = { teal: "var(--teal)", blue: "var(--blue)", purple: "var(--purple)", green: "var(--green)", muted: "var(--muted)" };

  /* ---------- icons (static path data, no HTML parsing) ---------- */
  const ICON_PATHS = {
    gh: "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z",
    li: "M0 1.15C0 .52.52 0 1.18 0h13.64C15.48 0 16 .52 16 1.15v13.7c0 .63-.52 1.15-1.18 1.15H1.18C.52 16 0 15.48 0 14.85V1.15zM4.94 13.4V6.17H2.54v7.23h2.4zM3.74 5.18c.84 0 1.36-.56 1.36-1.25-.02-.71-.52-1.25-1.34-1.25-.82 0-1.36.54-1.36 1.25 0 .69.52 1.25 1.33 1.25h.01zM6.27 13.4h2.4V9.36c0-.22.02-.43.08-.59.17-.43.57-.88 1.23-.88.87 0 1.21.66 1.21 1.63v3.88h2.4V9.25c0-2.22-1.18-3.25-2.76-3.25-1.28 0-1.84.7-2.16 1.2v.03h-.02l.02-.03V6.17h-2.4c.03.68 0 7.23 0 7.23z",
    cv: "M3 0h7l3 3v13H3zM9 1v3h3M5 7h6v1.5H5zm0 3h6v1.5H5zm0 3h4v1.5H5z"
  };
  const icon = name => svg("svg", { viewBox: "0 0 16 16", "aria-hidden": "true" }, svg("path", { fill: "currentColor", "fill-rule": "evenodd", d: ICON_PATHS[name] }));

  /* ================= rendering from data ================= */
  function render(data) {
    const P = data.profile || {};

    // hero + buttons
    if ($("hero-location") && str(P.location)) $("hero-location").textContent = str(P.location);
    if ($("hero-tagline") && str(P.tagline)) $("hero-tagline").textContent = str(P.tagline);
    const buttonRow = primary => {
      const cv = link(P.cv, { class: primary === "cv" ? "btn" : "btn ghost" }, icon("cv"), "View CV");
      const li = link(P.linkedin, { class: primary === "li" ? "btn" : "btn ghost" }, icon("li"), "LinkedIn");
      const gh = link(P.github, { class: "btn ghost" }, icon("gh"), "GitHub");
      return (primary === "li" ? [li, gh, cv] : [cv, li, gh]).filter(Boolean);
    };
    if ($("hero-btns")) $("hero-btns").replaceChildren(...buttonRow("cv"));
    if ($("end-btns")) $("end-btns").replaceChildren(...buttonRow("li"));

    // story text (the drawings stay fixed; titles and text come from data)
    arr(data.story).forEach((ch, i) => {
      const t = document.querySelector(`[data-story-title="${i}"]`);
      const p = document.querySelector(`[data-story-text="${i}"]`);
      if (t && str(ch.title)) t.textContent = str(ch.title);
      if (p && str(ch.text)) p.textContent = str(ch.text);
    });

    // internship meter
    if ($("intern-bar") && data.internship) {
      const s = new Date(data.internship.start), e = new Date(data.internship.end);
      const p = Math.max(0, Math.min(100, Math.round((now - s) / (e - s) * 100))) || 0;
      const days = Math.max(0, Math.ceil((e - now) / 864e5));
      $("intern-left").textContent = p >= 100 ? "Complete" : `${days} days left`;
      $("intern-bar").setAttribute("aria-valuenow", String(p));
      $("intern-fill").style.setProperty("--p", p + "%");
    }

    // skills
    if ($("skills-grid")) $("skills-grid").replaceChildren(...arr(data.skills).map(g => {
      const col = el("div", { class: "frame cut-a skill-col" },
        el("div", { class: "in" },
          el("h3", {}, el("i"), document.createTextNode(str(g.group))),
          el("p", { text: str(g.note) }),
          el("ul", { class: "chips" }, ...arr(g.items).map(i => el("li", { text: str(i) })))
        ));
      col.style.setProperty("--c", COLORS[g.color] || COLORS.teal);
      return col;
    }));

    // certifications
    const CERT_LABEL = { earned: "Earned", progress: "In progress", planned: "Planned" };
    const CERT_COLOR = { earned: "teal", progress: "blue", planned: "muted" };
    const certStatus = c => CERT_LABEL[c.status] ? c.status : "planned";
    if ($("certs-grid")) $("certs-grid").replaceChildren(...arr(data.certs).map(c => {
      const status = certStatus(c);
      const card = el("div", { class: `frame cut-c cert ${status}` },
        el("div", { class: "in" },
          svg("svg", { viewBox: "0 0 72 80", "aria-hidden": "true" },
            svg("path", { class: "hex", d: "M36 4 L66 21 V59 L36 76 L6 59 V21z" }),
            svg("text", { class: "hex-t", x: 36, y: 45, text: str(c.short).slice(0, 4) })),
          el("div", {}, el("h3", { text: str(c.name) }), el("p", { text: CERT_LABEL[status] }))
        ));
      card.style.setProperty("--c", COLORS[CERT_COLOR[status]]);
      return card;
    }));

    // write-ups
    if ($("posts")) {
      const posts = arr(data.posts).map(p => {
        const d = new Date(p.date);
        const time = el("time", { datetime: isNaN(d) ? null : d.toISOString().slice(0, 10),
          text: isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) });
        return link(p.url, { class: "post" }, time,
          el("div", {}, el("h3", { text: str(p.title) }), el("p", { text: str(p.summary) })),
          el("span", { class: "tag", text: str(p.tag) }));
      }).filter(Boolean);
      $("posts").replaceChildren(...posts);
      $("posts").hidden = posts.length === 0;
      if ($("posts-empty")) $("posts-empty").hidden = posts.length > 0;
    }

    // courses dialog
    if ($("semesters") && data.courses) {
      const C = data.courses;
      const STATUS = { completed: "Completed", current: "In progress", upcoming: "Upcoming" };
      const sems = arr(C.semesters);
      const total = sems.reduce((a, s) => a + arr(s.courses).reduce((b, c) => b + (Number(c.ects) || 0), 0), 0);
      const done = sems.filter(s => s.status === "completed").reduce((a, s) => a + arr(s.courses).reduce((b, c) => b + (Number(c.ects) || 0), 0), 0);
      const count = sems.reduce((a, s) => a + arr(s.courses).length, 0);
      $("courses-uni").textContent = str(C.university);
      $("courses-sub").textContent = [str(C.degree), str(C.major) && `${str(C.major)} major`].filter(Boolean).join(", ");
      $("courses-summary").replaceChildren(
        el("span", {}, el("b", { text: String(count) }), " courses"),
        el("span", {}, el("b", { text: String(done) }), ` of ${total} ECTS completed`),
        el("span", {}, el("b", { text: String(sems.length) }), " semesters"));
      $("semesters").replaceChildren(...sems.map(s => {
        const st = STATUS[s.status] ? s.status : "upcoming";
        const ects = arr(s.courses).reduce((b, c) => b + (Number(c.ects) || 0), 0);
        return el("section", { class: `sem ${st}` },
          el("div", { class: "sem-head" }, el("h3", { text: str(s.name) }), el("span", { class: "sem-state", text: STATUS[st] })),
          el("ul", { class: "sem-list" }, ...arr(s.courses).map(c =>
            el("li", {}, el("span", { text: str(c.name) }), el("span", { class: "ects", text: c.ects ? `${Number(c.ects)} ECTS` : "" })))),
          el("p", { class: "sem-total", text: `${ects} ECTS` }));
      }));
    }

    // CV page
    if ($("cv-main")) renderCV(data, certStatus, CERT_LABEL);
  }

  function renderCV(data, certStatus, CERT_LABEL) {
    const P = data.profile || {}, CV = data.cv || {};
    if (str(P.name)) $("cv-name").textContent = str(P.name);
    if (str(CV.headline)) $("cv-headline").textContent = str(CV.headline);
    const plain = u => { try { const x = new URL(u); return (x.host + x.pathname).replace(/^www\./, "").replace(/\/$/, ""); } catch (e) { return u; } };
    const contact = [
      str(P.location) && el("li", { text: str(P.location) }),
      str(P.email) && el("li", { class: "selectable", text: str(P.email) }),
      safeUrl(P.linkedin) && el("li", {}, link(P.linkedin, {}, plain(P.linkedin))),
      safeUrl(P.github) && el("li", {}, link(P.github, {}, plain(P.github))),
      el("li", {}, link("index.html", {}, location.host || "lectrik0.github.io"))
    ].filter(Boolean);
    $("cv-contact").replaceChildren(...contact);

    const section = (title, ...kids) => el("section", {}, el("h2", { text: title }), ...kids);
    const item = (title, dates, ...kids) => el("div", { class: "item" },
      el("div", { class: "item-top" }, el("b", { text: title }), el("span", { text: dates })), ...kids);
    const bullets = list => arr(list).length ? el("ul", {}, ...arr(list).map(b => el("li", { text: str(b) }))) : null;

    const main = [section("Profile", el("p", { text: str(CV.summary) }))];
    if (arr(CV.education).length) main.push(section("Education", ...arr(CV.education).map(e =>
      item([str(e.title), str(e.org)].filter(Boolean).join(", "), str(e.dates), str(e.details) ? el("p", { text: str(e.details) }) : null))));
    if (arr(CV.experience).length) main.push(section("Experience", ...arr(CV.experience).map(e =>
      item([str(e.title), str(e.org)].filter(Boolean).join(", "), str(e.dates), bullets(e.bullets)))));
    if (arr(CV.projects).length) main.push(section("Projects", ...arr(CV.projects).map(p =>
      item(str(p.title), str(p.dates), bullets(p.bullets)))));
    $("cv-main").replaceChildren(...main);

    const side = [];
    if (arr(data.certs).length) side.push(section("Certifications", el("ul", { class: "side-list" },
      ...arr(data.certs).map(c => el("li", {}, el("b", { text: str(c.name) }), el("br"), CERT_LABEL[certStatus(c)])))));
    if (arr(CV.skills).length) side.push(section("Skills", el("ul", { class: "side-list" },
      ...arr(CV.skills).map(s => el("li", {}, el("b", { text: `${str(s.label)}:` }), " ", str(s.text))))));
    if (arr(CV.languages).length) side.push(section("Languages", el("ul", { class: "side-list" },
      ...arr(CV.languages).map(l => el("li", { text: str(l) })))));
    $("cv-side").replaceChildren(...side);
  }

  fetch(DATA_URL, { cache: "no-cache", credentials: "same-origin" })
    .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(render)
    .catch(err => {
      console.warn("Couldn't load site content:", err.message);
      if ($("cv-summary")) $("cv-summary").textContent = "The CV couldn't load. Refresh the page to try again.";
    });

  /* ---------- courses dialog ---------- */
  const dlg = $("courses-dialog");
  if (dlg && typeof dlg.showModal === "function") {
    const open = () => { if (!dlg.open) dlg.showModal(); };
    $("open-courses").addEventListener("click", e => { e.stopPropagation(); open(); });
    const ch1 = $("chapter-1");
    if (ch1) ch1.addEventListener("click", e => { if (!e.target.closest("a, button")) open(); });
    $("close-courses").addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
  } else if ($("open-courses")) {
    $("open-courses").hidden = true;
  }

  /* ---------- hidden flags ---------- */
  console.log("%cHey, you opened the console.", "font:600 14px sans-serif;color:#0D8784");
  console.log("Flag 2 of 4: AA{d3vt00ls_4r3_fr13nds}");
  if ($("flag-form")) {
    const HASHES = [
      "f058793998de95d9e9877b7e92108f914f8fa96c240003471df902344c9b2274",
      "adf672b700d5f6aca0e5d7c7d2b020c9719eebb2e0974bb37827aeee8d7a95d6",
      "cc42772e75a3717889546c90366411a5c98b7d9dbab654f7a6113745d57961a0",
      "72795df42713f7e9dceb0f7e6053a97de7cf7f0d8874238c0afea62febf59862"
    ];
    const KEY = "aa-flags";
    const found = new Set();
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "[]");
      if (Array.isArray(saved)) saved.filter(i => Number.isInteger(i) && i >= 0 && i < HASHES.length).forEach(i => found.add(i));
    } catch (e) { /* storage unavailable or corrupted */ }
    const msg = $("flag-msg");
    const renderFlags = () => {
      const pips = $("flag-pips").children;
      for (let i = 0; i < pips.length; i++) pips[i].classList.toggle("on", i < found.size);
      $("flag-count").textContent = `${found.size} of ${HASHES.length} found`;
      document.querySelectorAll("#hints li").forEach(li => li.classList.toggle("done", found.has(Number(li.dataset.flag))));
    };
    async function sha256(text) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("");
    }
    $("flag-form").addEventListener("submit", async ev => {
      ev.preventDefault();
      const input = $("flag-input");
      const value = input.value.trim().slice(0, 64);
      if (!/^AA\{[A-Za-z0-9_]{1,56}\}$/.test(value)) {
        msg.textContent = "Flags look like AA{...} with letters, numbers and underscores inside.";
        msg.dataset.state = "bad";
        return;
      }
      if (!window.crypto || !crypto.subtle) {
        msg.textContent = "Your browser can't check flags here. Try a recent Chrome, Firefox or Safari.";
        msg.dataset.state = "bad";
        return;
      }
      const idx = HASHES.indexOf(await sha256(value));
      if (idx === -1) {
        msg.textContent = "That's not one of the flags. Check for typos and try again.";
        msg.dataset.state = "bad";
      } else if (found.has(idx)) {
        msg.textContent = `You already found flag ${idx + 1}.`;
        msg.dataset.state = "ok";
      } else {
        found.add(idx);
        try { localStorage.setItem(KEY, JSON.stringify([...found])); } catch (e) { /* ignore */ }
        msg.textContent = found.size === HASHES.length
          ? "All four flags found. Message me on LinkedIn and tell me which one took longest."
          : `Flag ${idx + 1} found. ${HASHES.length - found.size} to go.`;
        msg.dataset.state = "ok";
        input.value = "";
      }
      renderFlags();
    });
    renderFlags();
  }

  /* ---------- print button (CV page) ---------- */
  if ($("print-cv")) $("print-cv").addEventListener("click", () => window.print());
  if ($("year")) $("year").textContent = String(now.getFullYear());

  /* ---------- day / night ---------- */
  if ($("toggle")) {
    const btn = $("toggle");
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const MOON = "M6 .3a7.7 7.7 0 109.7 9.7A6.2 6.2 0 016 .3z";
    const SUN = "M8 4a4 4 0 100 8 4 4 0 000-8zM7 0h2v2.5H7zM7 13.5h2V16H7zM0 7h2.5v2H0zM13.5 7H16v2h-2.5zM2.1 3.5l1.4-1.4 1.8 1.8-1.4 1.4zM10.7 12.1l1.4-1.4 1.8 1.8-1.4 1.4zM2.1 12.5l1.8-1.8 1.4 1.4-1.8 1.8zM10.7 3.9l1.8-1.8 1.4 1.4-1.8 1.8z";
    const ALLOWED = ["light", "dark"];
    const isDark = () => root.dataset.theme ? root.dataset.theme === "dark" : mq.matches;
    const sync = () => {
      const d = isDark();
      $("toggle-label").textContent = d ? "Day" : "Night";
      $("toggle-icon").setAttribute("d", d ? SUN : MOON);
      btn.setAttribute("aria-label", d ? "Switch to day mode" : "Switch to night mode");
    };
    try {
      const saved = localStorage.getItem("aa-theme");
      if (ALLOWED.includes(saved)) root.dataset.theme = saved;
    } catch (e) { /* storage unavailable */ }
    btn.addEventListener("click", () => {
      root.dataset.theme = isDark() ? "light" : "dark";
      try { localStorage.setItem("aa-theme", root.dataset.theme); } catch (e) { /* ignore */ }
      sync();
    });
    if (mq.addEventListener) mq.addEventListener("change", sync);
    sync();
  }

  /* ---------- motion: hero parallax + panels settle in ---------- */
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const layers = Array.from(document.querySelectorAll(".layer"));
    if (layers.length) {
      let ticking = false;
      addEventListener("scroll", () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          const y = Math.min(scrollY, 900);
          layers.forEach(l => { l.style.transform = `translateY(${y * Number(l.dataset.depth || 0)}px)`; });
          ticking = false;
        });
      }, { passive: true });
    }
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add("seen"); io.unobserve(e.target); }
    }), { rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(".reveal").forEach(n => io.observe(n));
  }
})();
