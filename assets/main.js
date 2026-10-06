"use strict";
/*
 * Progressive enhancement for the public pages.
 *
 * All content is already in the HTML: scripts/build.mjs renders it from data/site.json at build time.
 * This file only adds behaviour (day/night toggle, flag checker, course list, internship countdown,
 * motion), and every page works without it.
 *
 * Security notes
 * - The script never builds HTML: it only sets textContent, classes and attributes, and the page's
 *   CSP with Trusted Types would block innerHTML/eval anyway.
 * - The pages make no network requests from script (CSP connect-src 'none').
 * - Stored values (theme, found flags) are checked against allow-lists before use.
 * - Flags are compared as SHA-256 hashes, so this file doesn't give them away.
 */
(() => {
  const root = document.documentElement;
  root.classList.add("js");
  const $ = id => document.getElementById(id);
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ } }
  };

  /* ---------- day / night ---------- */
  function initTheme() {
    const btn = $("toggle");
    if (!btn) return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const MOON = "M6 .3a7.7 7.7 0 109.7 9.7A6.2 6.2 0 016 .3z";
    const SUN = "M8 4a4 4 0 100 8 4 4 0 000-8zM7 0h2v2.5H7zM7 13.5h2V16H7zM0 7h2.5v2H0zM13.5 7H16v2h-2.5zM2.1 3.5l1.4-1.4 1.8 1.8-1.4 1.4zM10.7 12.1l1.4-1.4 1.8 1.8-1.4 1.4zM2.1 12.5l1.8-1.8 1.4 1.4-1.8 1.8zM10.7 3.9l1.8-1.8 1.4 1.4-1.8 1.8z";
    const isDark = () => root.dataset.theme ? root.dataset.theme === "dark" : mq.matches;
    const sync = () => {
      const dark = isDark();
      $("toggle-label").textContent = dark ? "Day" : "Night";
      $("toggle-icon").setAttribute("d", dark ? SUN : MOON);
      btn.setAttribute("aria-label", dark ? "Switch to day mode" : "Switch to night mode");
    };
    const saved = store.get("aa-theme");
    if (saved === "light" || saved === "dark") root.dataset.theme = saved;
    btn.addEventListener("click", () => {
      root.dataset.theme = isDark() ? "light" : "dark";
      store.set("aa-theme", root.dataset.theme);
      sync();
    });
    mq.addEventListener("change", sync);
    sync();
  }

  /* ---------- Chapter 2: internship countdown (the HTML shows the date range) ---------- */
  function initInternship() {
    const bar = $("intern-bar");
    if (!bar) return;
    const start = Date.parse(bar.dataset.start), end = Date.parse(bar.dataset.end);
    if (!(end > start)) return;
    const now = Date.now();
    const pct = Math.round(Math.min(1, Math.max(0, (now - start) / (end - start))) * 100);
    const days = Math.max(0, Math.ceil((end - now) / 864e5));
    $("intern-left").textContent = pct >= 100 ? "Complete" : `${days} days left`;
    bar.setAttribute("aria-valuenow", String(pct));
    $("intern-fill").style.setProperty("--p", pct + "%");
  }

  /* ---------- Chapter 1: course list ---------- */
  function initCourses() {
    const dlg = $("courses-dialog");
    if (!dlg) return;
    const open = () => { if (!dlg.open) dlg.showModal(); };
    // The buttons open and close the dialog through their command attributes, with no script needed.
    // Browsers without invoker commands get the same behaviour from here.
    if (!("command" in HTMLButtonElement.prototype)) {
      $("open-courses").addEventListener("click", open);
      $("close-courses").addEventListener("click", () => dlg.close());
    }
    const chapter = $("chapter-1");
    if (chapter) chapter.addEventListener("click", e => { if (!e.target.closest("a, button")) open(); });
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
  }

  /* ---------- hidden flags ---------- */
  function initFlags() {
    console.log("%cHey, you opened the console.", "font:600 14px sans-serif;color:#0D8784");
    console.log("Flag 2 of 4: AA{d3vt00ls_4r3_fr13nds}");
    const form = $("flag-form");
    if (!form) return;
    const HASHES = [
      "f058793998de95d9e9877b7e92108f914f8fa96c240003471df902344c9b2274",
      "adf672b700d5f6aca0e5d7c7d2b020c9719eebb2e0974bb37827aeee8d7a95d6",
      "cc42772e75a3717889546c90366411a5c98b7d9dbab654f7a6113745d57961a0",
      "72795df42713f7e9dceb0f7e6053a97de7cf7f0d8874238c0afea62febf59862"
    ];
    const KEY = "aa-flags";
    const found = new Set();
    try {
      const saved = JSON.parse(store.get(KEY) || "[]");
      if (Array.isArray(saved)) saved.filter(i => Number.isInteger(i) && i >= 0 && i < HASHES.length).forEach(i => found.add(i));
    } catch (e) { /* corrupted */ }
    const msg = $("flag-msg");
    const say = (text, state) => { msg.textContent = text; msg.dataset.state = state; };
    const render = () => {
      const pips = $("flag-pips").children;
      for (let i = 0; i < pips.length; i++) pips[i].classList.toggle("on", i < found.size);
      $("flag-count").textContent = `${found.size} of ${HASHES.length} found`;
      document.querySelectorAll("#hints li").forEach(li => li.classList.toggle("done", found.has(Number(li.dataset.flag))));
    };
    const sha256 = async text => {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("");
    };
    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      const input = $("flag-input");
      const value = input.value.trim().slice(0, 64);
      if (!/^AA\{[A-Za-z0-9_]{1,56}\}$/.test(value)) return say("Flags look like AA{...} with letters, numbers and underscores inside.", "bad");
      if (!window.crypto || !crypto.subtle) return say("Your browser can't check flags here. Try a recent Chrome, Firefox or Safari.", "bad");
      const idx = HASHES.indexOf(await sha256(value));
      if (idx === -1) {
        say("That's not one of the flags. Check for typos and try again.", "bad");
      } else if (found.has(idx)) {
        say(`You already found flag ${idx + 1}.`, "ok");
      } else {
        found.add(idx);
        store.set(KEY, JSON.stringify([...found]));
        say(found.size === HASHES.length
          ? "All four flags found. Message me on LinkedIn and tell me which one took longest."
          : `Flag ${idx + 1} found. ${HASHES.length - found.size} to go.`, "ok");
        input.value = "";
      }
      render();
    });
    render();
  }

  /* ---------- motion: hero parallax, panels settle in, loops pause off screen ---------- */
  function initMotion() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const hero = document.querySelector(".hero");
    const layers = Array.from(document.querySelectorAll(".layer"));
    if (hero && layers.length) {
      let heroOnScreen = true, ticking = false;
      new IntersectionObserver(([e]) => { heroOnScreen = e.isIntersecting; }).observe(hero);
      addEventListener("scroll", () => {
        if (ticking || !heroOnScreen) return;
        ticking = true;
        requestAnimationFrame(() => {
          const y = Math.min(scrollY, 900);
          layers.forEach(l => { l.style.transform = `translateY(${y * Number(l.dataset.depth || 0)}px)`; });
          ticking = false;
        });
      }, { passive: true });
    }

    const gate = new IntersectionObserver(entries => entries.forEach(e => e.target.classList.toggle("live", e.isIntersecting)), { rootMargin: "60px 0px" });
    document.querySelectorAll(".anim-gate").forEach(n => gate.observe(n));

    // Only panels that start below the fold wait to settle in, so nothing on screen jumps at load.
    const reveal = new IntersectionObserver(entries => entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.remove("wait");
      e.target.classList.add("seen");
      reveal.unobserve(e.target);
    }), { rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(".reveal").forEach(n => {
      if (n.getBoundingClientRect().top > innerHeight) n.classList.add("wait");
      reveal.observe(n);
    });
  }

  initTheme();
  initInternship();
  initCourses();
  initFlags();
  initMotion();
  document.querySelectorAll("#print-cv, [data-print]").forEach(b => b.addEventListener("click", () => window.print()));
  const year = $("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
