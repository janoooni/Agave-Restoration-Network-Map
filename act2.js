(() => {
  "use strict";

  const { W, H, BAT_SPRITES, BAT_SRC, reduceMotion } = window.AGAVE;

  // ---------- Content (placeholder copy: to be replaced with final text) ----------
  const GENERIC = {
    title: "Agave Restoration Network",
    text: "This is the Agave Restoration Network, a living map of everyone working to restore agave habitat and protect the bats that depend on it across nine states in the U.S. and Mexico. Explore the icons on the right to learn who's involved and how they contribute.",
  };

  const IMAGES = [1, 2, 3, 4, 5, 6, 7].map((n) => `assets/Images/placeholder-${n}.png`);

  // focus: the illustration's centre, used as the origin of its hover "pop" (canvas px)
  const CATS = [
    {
      id: "landowners", title: "Landowners", pop: 1.015,
      focus: { x: 655, y: 470, s: 270 },
      text: "Ranchers, ejidos and rural families who live and work on this land. By planting agave and letting it flower, they create the nectar corridor that migrating bats follow each season.",
      partners: ["Partner 1", "Partner 2", "Partner 3"],
    },
    {
      id: "ngos", title: "NGOs", pop: 1.03,
      focus: { x: 1230, y: 455, s: 310 },
      text: "Conservation organizations like Bat Conservation International connect the network: monitoring roosts, running restoration projects, and bringing every other partner to the same table.",
      partners: ["Partner 1", "Partner 2", "Partner 3", "Partner 4"],
    },
    {
      id: "private", title: "Private & Regional Sector", pop: 1.04,
      focus: { x: 1790, y: 570, s: 310 },
      text: "Agave spirits producers, distilleries and regional businesses. Bat-friendly sourcing, such as leaving some agave to flower, lets the industry help sustain the landscape it depends on.",
      partners: ["Partner 1", "Partner 2", "Partner 3"],
    },
    {
      id: "government", title: "Government", pop: 1.04,
      focus: { x: 1366, y: 880, s: 230 },
      text: "Federal, state and municipal agencies on both sides of the border set land-use policy, protect critical habitat and make cross-border cooperation possible.",
      partners: ["Partner 1", "Partner 2"],
    },
    {
      id: "academia", title: "Academia & Research", pop: 1.06,
      focus: { x: 1222, y: 1300, s: 190 },
      text: "Universities and research institutes track bat migration, study wild agave populations and measure restoration outcomes. That evidence guides where the network acts next.",
      partners: ["Partner 1", "Partner 2", "Partner 3"],
    },
    {
      id: "donors", title: "Foundations & Donors", pop: 1.04,
      focus: { x: 1395, y: 640, s: 240 },
      text: "Foundations and individual donors fund nurseries, seed collection and community programs, turning restoration plans into plants in the ground.",
      partners: ["Partner 1", "Partner 2", "Partner 3"],
    },
  ];
  const byId = Object.fromEntries(CATS.map((c) => [c.id, c]));

  // Hit-test priority: small, on-top illustrations before large ones.
  const HIT_ORDER = ["academia", "government", "donors", "private", "ngos", "cave", "landowners"];

  // ---------- DOM ----------
  const $ = (s) => document.querySelector(s);
  const stage = $("#stage");
  const mapHit = $("#map-hit");
  const nav = $("#cat-nav");
  const panel = $("#panel");
  const typed = panel.querySelector(".typed");
  const titleEl = panel.querySelector(".panel-title");
  const bodyEl = panel.querySelector(".panel-body");
  const textEl = panel.querySelector(".panel-text");
  const partnersEl = panel.querySelector(".partners");
  const plus = $("#plus");
  const lightbox = $("#lightbox");
  const lbImg = $("#lb-img");
  const lbCaption = $("#lb-caption");
  const lbCount = $("#lb-count");
  const partnerEl = $("#partner");
  const cave = $("#cave");
  const batPath = $("#bat-path");
  const ngoBatsEl = $("#ngo-bats");

  const actors = {};
  document.querySelectorAll(".actor").forEach((el) => (actors[el.dataset.cat] = el));

  // ---------- Hit masks (precomputed from each PNG's alpha channel) ----------
  const masks = {};
  (() => {
    const M = window.HIT_MASKS;
    for (const [k, b64] of Object.entries(M.masks)) {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      masks[k] = bytes;
    }
    masks.cell = M.cell; masks.w = M.w; masks.h = M.h;
  })();

  function hitAt(clientX, clientY) {
    const r = stage.getBoundingClientRect();
    const cx = Math.floor((((clientX - r.left) / r.width) * W) / masks.cell);
    const cy = Math.floor((((clientY - r.top) / r.height) * H) / masks.cell);
    if (cx < 0 || cy < 0 || cx >= masks.w || cy >= masks.h) return null;
    const i = cy * masks.w + cx;
    for (const k of HIT_ORDER) {
      if (masks[k][i >> 3] & (0x80 >> (i & 7))) return k;
    }
    return null;
  }

  // ---------- State ----------
  const state = {
    hover: { button: null, map: null },
    active: null,         // category shown in the panel (null = generic)
    panelOpen: false,
    lit: new Set(),       // categories that stay "lit" once clicked
    mode: null,           // null | "lightbox" | "partner"
    lbIndex: 0,
  };

  // ---------- Category buttons ----------
  const buttons = {};
  CATS.forEach((c) => {
    const actor = actors[c.id];
    // pop each illustration from its own centre
    actor.style.setProperty("--pop", c.pop);
    actor.querySelectorAll(".layer").forEach((img) => {
      img.style.transformOrigin = `${(c.focus.x / W) * 100}% ${(c.focus.y / H) * 100}%`;
    });

    const b = document.createElement("button");
    b.type = "button";
    b.className = "cat-btn";
    b.dataset.cat = c.id;
    b.setAttribute("aria-label", c.title);
    b.innerHTML = `
      <span class="disc"><span>${c.title}</span></span>
      <svg class="ring" viewBox="0 0 100 100" aria-hidden="true">
        <defs><mask id="m-${c.id}"><circle class="reveal" cx="50" cy="50" r="49" pathLength="100"/></mask></defs>
        <circle class="dash" cx="50" cy="50" r="49" mask="url(#m-${c.id})"/>
      </svg>`;
    b.addEventListener("pointerenter", () => setHover("button", c.id));
    b.addEventListener("pointerleave", () => setHover("button", null));
    b.addEventListener("focus", () => setHover("button", c.id));
    b.addEventListener("blur", () => setHover("button", null));
    b.addEventListener("click", (e) => { e.stopPropagation(); selectCategory(c.id); });
    nav.appendChild(b);
    buttons[c.id] = b;
  });
  cave.style.transformOrigin = `${(978 / W) * 100}% ${(842 / H) * 100}%`;
  cave.style.setProperty("--pop", 1.025);

  // ---------- Hover ----------
  function setHover(source, id) {
    state.hover[source] = id;
    renderHover();
  }

  function renderHover() {
    const ids = new Set([state.hover.button, state.hover.map].filter(Boolean));
    CATS.forEach((c) => {
      const on = ids.has(c.id) && !state.mode;
      actors[c.id].classList.toggle("is-hover", on);
      buttons[c.id].classList.toggle("is-hover", on);
    });
    cave.classList.toggle("is-hover", ids.has("cave") && !state.mode);
    caveFlock.active = ids.has("cave") && !state.mode;
    updateNgoBats();
  }

  mapHit.addEventListener("pointermove", (e) => {
    const k = hitAt(e.clientX, e.clientY);
    if (k !== state.hover.map) {
      state.hover.map = k;
      mapHit.classList.toggle("pointer", !!k);
      renderHover();
    }
  });
  mapHit.addEventListener("pointerleave", () => {
    state.hover.map = null;
    mapHit.classList.remove("pointer");
    renderHover();
  });

  // ---------- Panel ----------
  let typeTimer = null;
  function typeTitle(text) {
    clearTimeout(typeTimer);
    titleEl.classList.remove("done");
    bodyEl.classList.add("pending");
    typed.textContent = "";
    let i = 0;
    const step = () => {
      typed.textContent = text.slice(0, ++i);
      if (i < text.length) typeTimer = setTimeout(step, reduceMotion ? 0 : 55);
      else {
        titleEl.classList.add("done");
        bodyEl.classList.remove("pending");
      }
    };
    typeTimer = setTimeout(step, reduceMotion ? 0 : 160);
  }

  function fillPanel(id) {
    const c = id ? byId[id] : null;
    panel.classList.toggle("generic", !c);
    textEl.textContent = c ? c.text : GENERIC.text;
    partnersEl.innerHTML = "";
    if (c) {
      c.partners.forEach((name, i) => {
        const d = document.createElement("button");
        d.type = "button";
        d.className = "partner-dot";
        d.textContent = initials(name);
        d.title = name;
        d.setAttribute("aria-label", `Partner: ${name}`);
        d.addEventListener("click", (e) => { e.stopPropagation(); openPartner(c, name, i); });
        partnersEl.appendChild(d);
      });
    }
    typeTitle(c ? c.title : GENERIC.title);
  }

  function openPanel(id) {
    const wasOpen = state.panelOpen;
    state.active = id;
    state.panelOpen = true;
    plus.setAttribute("aria-expanded", "true");
    panel.setAttribute("aria-hidden", "false");
    if (wasOpen) {
      fillPanel(id); // swap in place, typewriter re-runs
    } else {
      // + rotates back to rest, then the panel unfolds out of it
      plus.classList.add("settle");
      setTimeout(() => {
        fillPanel(id);
        panel.classList.add("open");
      }, reduceMotion ? 0 : 200);
    }
    renderActive();
  }

  function closePanel() {
    if (!state.panelOpen) return;
    clearTimeout(typeTimer);
    state.panelOpen = false;
    state.active = null;
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    plus.setAttribute("aria-expanded", "false");
    renderActive();
  }

  function renderActive() {
    nav.classList.toggle("has-active", !!state.active);
    CATS.forEach((c) => {
      buttons[c.id].classList.toggle("is-active", state.active === c.id);
      const lit = state.lit.has(c.id);
      actors[c.id].classList.toggle("is-lit", lit);
      buttons[c.id].classList.toggle("is-lit", lit);
    });
    updateNgoBats();
  }

  function selectCategory(id) {
    if (state.mode) return;
    state.lit.add(id);
    if (id === "ngos") ngoArrive();
    openPanel(id);
  }

  plus.addEventListener("pointerleave", () => plus.classList.remove("settle"));
  plus.addEventListener("click", (e) => {
    e.stopPropagation();
    if (state.mode) return;
    if (state.panelOpen) closePanel();
    else openPanel(null);
  });

  // ---------- Lightbox ----------
  function lbShow(i, animate = true) {
    const c = byId[state.active];
    const n = IMAGES.length;
    state.lbIndex = (i + n) % n;
    const offset = CATS.indexOf(c); // rotate the placeholder set per category
    const src = IMAGES[(state.lbIndex + offset) % n];
    const apply = () => {
      lbImg.src = src;
      lbImg.alt = `${c.title}, placeholder image ${state.lbIndex + 1}`;
      lbCaption.textContent = `${c.title}: placeholder photo, caption to come.`;
      lbCount.textContent = `${String(state.lbIndex + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}`;
      lbImg.classList.remove("swap");
    };
    if (animate && !reduceMotion) {
      lbImg.classList.add("swap");
      setTimeout(apply, 200);
    } else apply();
  }

  function openLightbox() {
    if (!state.active) return;
    setMode("lightbox");
    lbShow(0, false);
    lightbox.classList.add("open");
    lightbox.setAttribute("aria-hidden", "false");
    $("#lb-close").focus({ preventScroll: true });
  }
  function closeLightbox() {
    lightbox.classList.remove("open");
    lightbox.setAttribute("aria-hidden", "true");
    setMode(null);
  }

  $("#btn-images").addEventListener("click", (e) => { e.stopPropagation(); openLightbox(); });
  $("#lb-prev").addEventListener("click", (e) => { e.stopPropagation(); lbShow(state.lbIndex - 1); });
  $("#lb-next").addEventListener("click", (e) => { e.stopPropagation(); lbShow(state.lbIndex + 1); });
  $("#lb-close").addEventListener("click", (e) => { e.stopPropagation(); closeLightbox(); });

  // ---------- Partner takeover ----------
  function openPartner(c, name) {
    setMode("partner");
    partnerEl.querySelector(".partner-logo").textContent = initials(name);
    partnerEl.querySelector(".partner-name").textContent = name;
    partnerEl.querySelector(".partner-text").textContent =
      `Placeholder description of ${name} and how they contribute to the network as part of ${c.title}. Logo and website link to come.`;
    partnerEl.classList.add("open");
    partnerEl.setAttribute("aria-hidden", "false");
  }
  function closePartner() {
    partnerEl.classList.remove("open");
    partnerEl.setAttribute("aria-hidden", "true");
    setMode(null);
  }
  $("#partner-link").addEventListener("click", (e) => {
    e.stopPropagation();
    if ($("#partner-link").getAttribute("href") === "#") e.preventDefault(); // no real URL yet
  });

  function setMode(m) {
    state.mode = m;
    document.body.classList.toggle("mode-lightbox", m === "lightbox");
    document.body.classList.toggle("mode-partner", m === "partner");
    renderHover();
  }

  // ---------- Outside clicks: each one retraces a single step ----------
  $("#viewport").addEventListener("click", (e) => {
    if (!document.body.classList.contains("act2")) return;
    if (state.mode === "lightbox") {
      if (!lightbox.contains(e.target)) closeLightbox();
      return;
    }
    if (state.mode === "partner") {
      if (!partnerEl.contains(e.target)) closePartner();
      return;
    }
    if (e.target === mapHit) {
      const k = hitAt(e.clientX, e.clientY);
      if (k && k !== "cave") return selectCategory(k);
      if (k === "cave") return; // the cave only plays the bats
    }
    if (state.panelOpen && !panel.contains(e.target)) closePanel();
  });

  document.addEventListener("keydown", (e) => {
    if (!document.body.classList.contains("act2")) return;
    if (e.key === "Escape") {
      if (state.mode === "lightbox") closeLightbox();
      else if (state.mode === "partner") closePartner();
      else closePanel();
    } else if (state.mode === "lightbox" && e.key === "ArrowLeft") lbShow(state.lbIndex - 1);
    else if (state.mode === "lightbox" && e.key === "ArrowRight") lbShow(state.lbIndex + 1);
  });

  // ---------- Reset / back to start ----------
  function resetMap() {
    if (state.mode === "lightbox") closeLightbox();
    if (state.mode === "partner") closePartner();
    closePanel();
    state.lit.clear();
    plus.classList.remove("settle");
    ngo.restSince = null;
    renderActive();
  }
  $("#btn-reset").addEventListener("click", (e) => { e.stopPropagation(); resetMap(); });
  $("#btn-start").addEventListener("click", (e) => {
    e.stopPropagation();
    resetMap();
    window.scrollTo({ top: 0, behavior: "instant" });
  });

  window.addEventListener("act2change", (e) => {
    if (!e.detail) {
      // scrolled back into Act 1: fold the UI away, keep what has been explored
      if (state.mode === "lightbox") closeLightbox();
      if (state.mode === "partner") closePartner();
      closePanel();
      state.hover.map = state.hover.button = null;
      renderHover();
    }
  });

  // ---------- NGO bats flying out of the cave along the pathway ----------
  // centreline of "Bats Pathway.png", from the cave mouth up to the top right (canvas px)
  const PATH = [
    [1214, 380], [1232, 310], [1290, 278], [1400, 272], [1500, 250],
    [1600, 200], [1700, 140], [1800, 95], [1905, 92],
  ];
  const pathPts = sampleCatmull(PATH, 240);

  const ngoBats = BAT_SPRITES.map(([x, y, w, h]) => {
    const el = document.createElement("div");
    el.className = "bat";
    el.style.width = `${(w / W) * 100}%`;
    el.style.height = `${(h / H) * 100}%`;
    el.style.backgroundImage = `url("${BAT_SRC}")`;
    el.style.backgroundSize = `${(W / w) * 100}% ${(H / h) * 100}%`;
    el.style.backgroundPosition = `${(x / (W - w)) * 100}% ${(y / (H - h)) * 100}%`;
    ngoBatsEl.appendChild(el);
    const home = { x: x + w / 2, y: y + h / 2 };
    // where along the path this bat's drawn position sits
    let best = 0, bestD = Infinity;
    pathPts.forEach((p, i) => {
      const d = (p[0] - home.x) ** 2 + (p[1] - home.y) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    });
    const s = best / (pathPts.length - 1);
    const anchor = pathPts[best];
    return {
      el, w, h, home, s,
      off: { x: home.x - anchor[0], y: home.y - anchor[1] },
      phase: Math.random() * Math.PI * 2,
      flapHz: 5 + Math.random() * 3,
      loopOffset: Math.random(),
      wob: 6 + Math.random() * 10,
    };
  });

  const ngo = { mode: "off", restSince: null };

  function ngoArrive() { ngo.restSince = performance.now(); }

  function updateNgoBats() {
    const ids = [state.hover.button, state.hover.map];
    const hovered = !state.mode && ids.includes("ngos");
    const lit = state.lit.has("ngos");
    const mode = hovered ? "loop" : lit ? "rest" : "off";
    if (mode === "rest" && ngo.mode === "loop") ngoArrive(); // fly back in to rest
    if (mode === "rest" && ngo.restSince == null) ngoArrive();
    if (mode === "off") ngo.restSince = null;
    ngo.mode = mode;
    batPath.classList.toggle("show", mode !== "off");
  }

  function pathAt(u) {
    const f = clamp(u) * (pathPts.length - 1);
    const i = Math.floor(f), t = f - i;
    const a = pathPts[i], b = pathPts[Math.min(i + 1, pathPts.length - 1)];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  const LOOP_MS = 3400;
  const ARRIVE_MS = 1900;

  function drawNgoBats(now) {
    const k = stage.clientWidth / W;
    for (const b of ngoBats) {
      let x, y, op = 1, flapAmt = 1, bank = 0;
      if (ngo.mode === "off" || reduceMotion) {
        if (ngo.mode === "rest" || (ngo.mode === "loop" && reduceMotion)) {
          x = b.home.x; y = b.home.y; flapAmt = 0;
        } else { b.el.style.opacity = 0; continue; }
      } else if (ngo.mode === "loop") {
        // continuous stream out of the cave and off along the pathway
        const u = ((now / LOOP_MS) + b.loopOffset) % 1;
        const p = pathAt(u);
        const spread = Math.min(1, u * 3);
        x = p[0] + b.off.x * spread + Math.sin(now / 260 + b.phase) * b.wob * spread;
        y = p[1] + b.off.y * spread + Math.cos(now / 310 + b.phase) * b.wob * 0.6 * spread;
        op = Math.min(1, u * 8) * Math.min(1, (1 - u) * 6);
        bank = Math.sin(now / 400 + b.phase) * 10;
      } else {
        // one pass out of the cave, settling on the drawn position
        const t = clamp((now - (ngo.restSince || 0)) / (ARRIVE_MS * (0.6 + b.s * 0.6)));
        const e = 1 - Math.pow(1 - t, 3);
        const p = pathAt(b.s * e);
        const wob = Math.sin(now / 240 + b.phase) * b.wob * (1 - e);
        x = p[0] + b.off.x * e + wob;
        y = p[1] + b.off.y * e + wob * 0.5;
        op = Math.min(1, t * 6);
        flapAmt = 1 - e * 0.85;
      }
      const flap = 1 - flapAmt * 0.55 * (1 - Math.abs(Math.cos((now / 1000) * b.flapHz * Math.PI + b.phase)));
      b.el.style.opacity = op;
      b.el.style.transform =
        `translate(${(x - b.w / 2) * k}px, ${(y - b.h / 2) * k}px) rotate(${bank}deg) scale(1, ${flap})`;
    }
    requestAnimationFrame(drawNgoBats);
  }
  requestAnimationFrame(drawNgoBats);

  // ---------- Bats flying out of the cave (Cave.png) ----------
  // Each bat emerges small from the cave mouth, grows as it comes out, and
  // flutters away on its own wavering path. Loops while the cave is hovered;
  // when hover ends, bats already in the air finish their flight.
  const CAVE_MOUTH = { x: 975, y: 742 };
  const caveFlock = { active: false };
  const caveBatsEl = $("#cave-bats");

  const caveBats = BAT_SPRITES.map(([x, y, w, h], i) => {
    const el = document.createElement("div");
    el.className = "bat";
    el.style.width = `${(w / W) * 100}%`;
    el.style.height = `${(h / H) * 100}%`;
    el.style.backgroundImage = `url("${BAT_SRC}")`;
    el.style.backgroundSize = `${(W / w) * 100}% ${(H / h) * 100}%`;
    el.style.backgroundPosition = `${(x / (W - w)) * 100}% ${(y / (H - h)) * 100}%`;
    caveBatsEl.appendChild(el);
    return { el, w, h, idx: i, start: null };
  });

  function launchCaveBat(b, now, stagger) {
    const ang = (-90 + (Math.random() * 2 - 1) * 70) * (Math.PI / 180); // mostly upward fan
    b.start = now + stagger;
    b.dur = 2200 + Math.random() * 1400;
    b.dist = 420 + Math.random() * 380;
    b.dx = Math.cos(ang);
    b.dy = Math.sin(ang);
    b.wob = 18 + Math.random() * 30;
    b.wobHz = 1.2 + Math.random() * 1.6;
    b.phase = Math.random() * Math.PI * 2;
    b.flapHz = 6 + Math.random() * 3;
    b.size = 0.55 + Math.random() * 0.4; // sprites vary a lot in size; keep them modest
  }

  function drawCaveBats(now) {
    const k = stage.clientWidth / W;
    for (const b of caveBats) {
      if (b.start == null || now - b.start > b.dur) {
        if (caveFlock.active && !reduceMotion) {
          // first launch of a hover is staggered so they pour out one after another
          launchCaveBat(b, now, b.start == null ? b.idx * 140 : Math.random() * 500);
        } else {
          b.start = null;
          b.el.style.opacity = 0;
          continue;
        }
      }
      const t = (now - b.start) / b.dur;
      if (t < 0) { b.el.style.opacity = 0; continue; }
      const e = 1 - Math.pow(1 - t, 1.6);
      // perpendicular wobble for an irregular, fluttering line
      const side = Math.sin(t * Math.PI * 2 * b.wobHz + b.phase) * b.wob * Math.min(1, t * 3);
      const x = CAVE_MOUTH.x + b.dx * b.dist * e - b.dy * side;
      const y = CAVE_MOUTH.y + b.dy * b.dist * e + b.dx * side;
      const grow = b.size * (0.25 + 0.75 * Math.min(1, t * 2.2));
      const flap = 0.45 + 0.55 * Math.abs(Math.cos((now / 1000) * b.flapHz * Math.PI + b.phase));
      const facing = b.dx < 0 ? -1 : 1;
      b.el.style.opacity = Math.min(1, t * 10) * Math.min(1, (1 - t) * 4);
      b.el.style.transform =
        `translate(${(x - b.w / 2) * k}px, ${(y - b.h / 2) * k}px) scale(${grow * facing}, ${grow * flap})`;
    }
    requestAnimationFrame(drawCaveBats);
  }
  requestAnimationFrame(drawCaveBats);

  // ---------- Water: waves rolling against the shore ----------
  // Shore.png is redrawn into a canvas in thin strips, each nudged by travelling
  // sine waves (rows sideways, then columns up/down), plus a slow swell. The waves
  // are pure functions of time, so the loop never has a seam or a jump.
  const shoreSrc = $("#shore-src");
  const shoreCanvas = $("#shore");
  const act2El = $("#act2");
  const shoreCtx = shoreCanvas.getContext("2d");
  const base = document.createElement("canvas");
  const pass = document.createElement("canvas");
  let shoreReady = false;

  function sizeShore() {
    if (!shoreSrc.complete || !shoreSrc.naturalWidth) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.round(stage.clientWidth * dpr), h = Math.round(stage.clientHeight * dpr);
    for (const c of [shoreCanvas, base, pass]) { c.width = w; c.height = h; }
    base.getContext("2d").drawImage(shoreSrc, 0, 0, w, h);
    shoreReady = true;
  }
  shoreSrc.complete ? sizeShore() : shoreSrc.addEventListener("load", sizeShore);
  window.addEventListener("resize", sizeShore);

  let lastWave = 0;
  function drawWaves(now) {
    requestAnimationFrame(drawWaves);
    if (!shoreReady || !(parseFloat(act2El.style.opacity) > 0)) return;
    // the stage is resized as Act 1 zooms; keep the canvas at display resolution
    const dprNow = Math.min(window.devicePixelRatio || 1, 1.5);
    if (Math.abs(stage.clientWidth * dprNow - shoreCanvas.width) > 4) sizeShore();
    if (now - lastWave < 1000 / 40) return; // ~40fps is plenty for slow water
    lastWave = now;
    const w = shoreCanvas.width, h = shoreCanvas.height;
    const u = w / W;               // canvas px per art px
    const amp = 1.6 * u;           // ripple size in art px (kept subtle)
    const strip = Math.max(2, Math.round(2 * u));
    const t = reduceMotion ? 0 : now / 1000;
    const swell = Math.sin(t * 0.5) * 1.0 * u; // slow push toward / away from the coast

    const p = pass.getContext("2d");
    p.clearRect(0, 0, w, h);
    for (let y = 0; y < h; y += strip) {
      const yy = y / u;
      const dx = amp * Math.sin(yy / 38 - t * 1.1) + amp * 0.5 * Math.sin(yy / 91 + t * 0.7) + swell;
      p.drawImage(base, 0, y, w, strip, dx, y, w, strip);
    }
    shoreCtx.clearRect(0, 0, w, h);
    for (let x = 0; x < w; x += strip) {
      const xx = x / u;
      const dy = amp * Math.sin(xx / 42 - t * 0.95) + amp * 0.5 * Math.sin(xx / 103 - t * 0.6) + swell * 0.6;
      shoreCtx.drawImage(pass, x, 0, strip, h, x, dy, strip, h);
    }
  }
  requestAnimationFrame(drawWaves);

  // ---------- helpers ----------
  function clamp(v, a = 0, b = 1) { return Math.min(b, Math.max(a, v)); }
  function initials(name) {
    return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase();
  }
  function sampleCatmull(pts, n) {
    const out = [];
    for (let j = 0; j <= n; j++) {
      const f = (j / n) * (pts.length - 1);
      const i = Math.min(Math.floor(f), pts.length - 2), t = f - i;
      const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
      const c = (a, b, c2, d) =>
        0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t * t + (-a + 3 * b - 3 * c2 + d) * t * t * t);
      out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
    }
    return out;
  }
})();
