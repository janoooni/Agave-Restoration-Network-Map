(() => {
  "use strict";

  // ---------- Canvas geometry ----------
  // Everything is placed in Act 2's 2388x1668 canvas ("map units"). Act 1's art was
  // drawn zoomed out: a point u in USA.png's frame sits at FOCUS + (u - FOCUS) * ZOOM_END
  // in map units (measured from the state shapes, so Act 1 lands pixel-on-pixel on Act 2).
  const W = 2388, H = 1668;
  const ZOOM_END = 4.663;
  const FOCUS = { x: 685.4, y: 1142.2 };
  const toMap = (x, y) => ({ x: FOCUS.x + (x - FOCUS.x) * ZOOM_END, y: FOCUS.y + (y - FOCUS.y) * ZOOM_END });

  const STATES = [
    // name, centroid in USA.png's frame
    { name: "Arizona",         x: 689, y: 967 },
    { name: "New Mexico",      x: 780, y: 964 },
    { name: "Texas",           x: 878, y: 1022 },
    { name: "Coahuila",        x: 812, y: 1105 },
    { name: "Chihuahua",       x: 744, y: 1075 },
    { name: "Nuevo León",      x: 837, y: 1140 },
    { name: "San Luis Potosí", x: 820, y: 1200 },
    { name: "Sonora",          x: 674, y: 1044 },
    { name: "Zacatecas",       x: 786, y: 1186 },
  ].map((s) => ({ name: s.name, ...toMap(s.x, s.y) }));

  const LINES = [
    "Across nine states in the southwestern U.S. and northeastern Mexico lies a corridor shared by agave, nectar-feeding bats, and the people who tend this land.",
    "In Arizona, nectar-feeding bats begin their migration north each spring.",
    "In New Mexico, remnant wild agave populations mark the edge of the corridor.",
    "In Texas, border landscapes connect conservation efforts across the U.S.–Mexico line.",
    "In Coahuila, agave fields meet grazing lands at the edge of the Chihuahuan Desert.",
    "In Chihuahua, caves shelter the bat colonies that pollinate agave across the region.",
    "In Nuevo León, rural communities and private landowners steward the land season after season.",
    "In San Luis Potosí, local producers depend on the agave these bats help sustain.",
    "In Sonora, researchers track bat migration routes to guide restoration decisions.",
    "In Zacatecas, the corridor reaches its southern edge. Nine states, one shared landscape.",
    "No single actor can restore it alone. This is the network that makes it possible.",
  ];

  // ---------- Scroll timeline (in units of one viewport height) ----------
  // 0      intro line, all grey
  // 1..9   state k revealed at step k
  // 10     closing line
  // 10..12 narrative shrinks to bottom-right, Act 2 crossfades in
  const STEP_CLOSE = 10;
  const ZOOM_FROM = 0.35, ZOOM_TO = 10;
  const TRANS_FROM = 10.6, TRANS_TO = 12;
  const TOTAL_STEPS = 12;

  // What the camera must keep in view (map units)
  const u0 = toMap(21, 91), u1 = toMap(2387, 1510);           // whole continent (USA.png land)
  const VIEW_START = { x0: u0.x, y0: u0.y, x1: u1.x, y1: u1.y };
  const VIEW_END = { x0: 345, y0: 52, x1: 2080, y1: 1578 };    // the nine states + a small margin

  // Individual bats inside "Bats flying.png" (map units: x, y, w, h), found from its alpha channel.
  const BAT_SPRITES = [
    [1192, 297, 29, 34], [1194, 372, 34, 26], [1219, 280, 44, 22], [1220, 251, 44, 27],
    [1257, 264, 32, 24], [1363, 230, 60, 37], [1415, 191, 86, 60], [1459, 240, 98, 57],
    [1516, 277, 61, 26], [1576, 91, 129, 56], [1577, 180, 88, 82], [1655, 129, 89, 37],
    [1657, 188, 56, 37], [1734, 66, 86, 53],
  ];
  const BATS_LAYER = window.LAYERS.layers.bats; // cropped "Bats flying" art

  // Cut one bat out of the cropped bats image as a CSS sprite
  function batSprite(el, [x, y, w, h]) {
    const L = BATS_LAYER;
    el.style.backgroundImage = `url("${L.src}")`;
    el.style.backgroundSize = `${(L.w / w) * 100}% ${(L.h / h) * 100}%`;
    el.style.backgroundPosition = `${((x - L.x) / (L.w - w)) * 100}% ${((y - L.y) / (L.h - h)) * 100}%`;
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouch = window.matchMedia("(pointer: coarse)").matches;

  // ---------- DOM ----------
  const $ = (s) => document.querySelector(s);
  const track = $("#scroll-track");
  const svg = $("#act1");
  const stage = $("#stage");
  const labelsEl = $("#labels");
  const batsEl = $("#bats");
  const narrative = $("#narrative");
  const lineWrap = $(".line-wrap");
  const progressEl = $(".progress");
  const hint = $("#scroll-hint");
  const catNav = $("#cat-nav");
  const utils = $("#utils");

  // ---------- Act 1 vector map ----------
  const NS = "http://www.w3.org/2000/svg";
  const shapesG = $("#act1-shapes");
  // shapes are traced in USA.png's frame; this group places them in map units
  shapesG.setAttribute("transform",
    `translate(${FOCUS.x * (1 - ZOOM_END)} ${FOCUS.y * (1 - ZOOM_END)}) scale(${ZOOM_END})`);
  const usaPath = document.createElementNS(NS, "path");
  usaPath.setAttribute("d", window.ACT1_SHAPES.usa);
  usaPath.setAttribute("class", "usa");
  shapesG.appendChild(usaPath);
  const statePaths = window.ACT1_SHAPES.states.map((d) => {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("class", "state");
    shapesG.appendChild(p);
    return p;
  });

  // ---------- Act 2 layers: each file placed on the shared canvas from its crop box ----------
  document.querySelectorAll("[data-layer]").forEach((el) => {
    const L = window.LAYERS.layers[el.dataset.layer];
    el.src = L.src;
    el.style.left = `${(L.x / W) * 100}%`;
    el.style.top = `${(L.y / H) * 100}%`;
    el.style.width = `${(L.w / W) * 100}%`;
    el.style.height = `${(L.h / H) * 100}%`;
  });

  const labels = STATES.map((s) => {
    const el = document.createElement("div");
    el.className = "state-label";
    el.textContent = s.name;
    labelsEl.appendChild(el);
    return el;
  });

  STATES.forEach(() => progressEl.appendChild(document.createElement("li")));
  const dots = [...progressEl.children];

  // ---------- Helpers ----------
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = (t) => t * t * (3 - 2 * t);
  const range = (v, a, b) => clamp((v - a) / (b - a));
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------- Camera ----------
  // A view maps map units to screen px: screen = o + m * s.
  // Act 1 fits the map beside the narrative box; Act 2 fits it beside the category
  // buttons and below the top buttons, and fills the window wherever that's possible.
  let M = {}; // layout measurements, refreshed on resize

  function measure() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const gap = Math.max(14, vw * 0.02);
    M = {
      vw, vh, gap,
      narrW: narrative.offsetWidth,
      narrH: narrative.offsetHeight,
      navW: catNav.offsetWidth + (vw - catNav.getBoundingClientRect().right) + gap,
      topUI: utils.offsetTop + utils.offsetHeight + gap * 0.5,
      pad: vh * 0.03,
    };
    // narrative sits in its own column on the right, vertically centred
    narrative.style.left = `${vw - gap - M.narrW}px`;
    narrative.style.top = `${(vh - M.narrH) / 2}px`;
    M.narrCol = M.narrW + gap * 2;
    // panels use this to stay clear of the category circles
    $("#viewport").style.setProperty("--nav-w", `${M.navW}px`);
  }

  function fit(r, ax0, ay0, ax1, ay1) {
    // never let a squeezed or hidden window produce a zero or negative area
    const aw = Math.max(40, ax1 - ax0), ah = Math.max(40, ay1 - ay0);
    const rw = r.x1 - r.x0, rh = r.y1 - r.y0;
    const s = Math.min(aw / rw, ah / rh);
    return {
      s,
      ox: ax0 + aw / 2 - ((r.x0 + r.x1) / 2) * s,
      oy: ay0 + ah / 2 - ((r.y0 + r.y1) / 2) * s,
    };
  }

  // Act 1: zoom from the continent to the nine states. Sizes shrink geometrically and
  // the centre moves in step with the zoom, so it reads as one steady push-in.
  function act1View(p) {
    const A = VIEW_START, B = VIEW_END;
    const aw = A.x1 - A.x0, ah = A.y1 - A.y0, bw = B.x1 - B.x0, bh = B.y1 - B.y0;
    const rw = aw * Math.pow(bw / aw, p), rh = ah * Math.pow(bh / ah, p);
    const k = (aw - rw) / (aw - bw);
    const cx = lerp((A.x0 + A.x1) / 2, (B.x0 + B.x1) / 2, k);
    const cy = lerp((A.y0 + A.y1) / 2, (B.y0 + B.y1) / 2, k);
    const r = { x0: cx - rw / 2, x1: cx + rw / 2, y0: cy - rh / 2, y1: cy + rh / 2 };
    // the narrative's column opens up as the zoom begins, so states never sit under it
    const reserve = M.narrCol * smooth(range(p, 0, 0.3));
    return fit(r, 0, M.pad, M.vw - reserve, M.vh - M.pad);
  }

  // Act 2: whole map visible, clear of the UI; fill the window where the shape allows.
  function act2View() {
    const r = VIEW_END;
    const ax0 = 0, ay0 = M.topUI, ax1 = M.vw - M.navW, ay1 = M.vh;
    const v = fit(r, ax0, ay0, ax1, ay1);
    const s = Math.min(v.s, Math.max(M.vw / W, M.vh / H));
    const place = (centre, coverLo, coverHi, keepLo, keepHi) => {
      let o = clamp(centre, Math.min(coverLo, coverHi), Math.max(coverLo, coverHi)); // avoid bands
      return clamp(o, Math.min(keepLo, keepHi), Math.max(keepLo, keepHi));           // never hide the map
    };
    const ox = place((ax0 + ax1) / 2 - ((r.x0 + r.x1) / 2) * s, M.vw - W * s, 0, ax0 - r.x0 * s, ax1 - r.x1 * s);
    const oy = place((ay0 + ay1) / 2 - ((r.y0 + r.y1) / 2) * s, M.vh - H * s, 0, ay0 - r.y0 * s, ay1 - r.y1 * s);
    return { s, ox, oy };
  }

  function viewAt(f) {
    const v1 = act1View(smooth(range(f, ZOOM_FROM, ZOOM_TO)));
    const t = smooth(range(f, TRANS_FROM, TRANS_TO));
    if (t <= 0) return v1;
    const v2 = act2View();
    return { s: v1.s * Math.pow(v2.s / v1.s, t), ox: lerp(v1.ox, v2.ox, t), oy: lerp(v1.oy, v2.oy, t) };
  }

  function applyView(v) {
    const { s, ox, oy } = v;
    if (!(s > 0) || !isFinite(ox) || !isFinite(oy) || !(M.vw > 0) || !(M.vh > 0)) return;
    svg.setAttribute("viewBox", `${-ox / s} ${-oy / s} ${M.vw / s} ${M.vh / s}`);
    const sw = W * s, sh = H * s;
    stage.style.width = `${sw}px`;
    stage.style.height = `${sh}px`;
    stage.style.transform = `translate(${ox}px, ${oy}px)`;
    // where the map can't reach the window edge, fade that edge into the paper
    const fade = (gap) => (gap > 1 ? "5%" : "0%");
    stage.style.setProperty("--fl", fade(ox));
    stage.style.setProperty("--fr", fade(M.vw - ox - sw));
    stage.style.setProperty("--ft", fade(oy));
    stage.style.setProperty("--fb", fade(M.vh - oy - sh));
    window.AGAVE.view = v;
  }

  function sizeTrack() {
    track.style.height = `${(TOTAL_STEPS + 1) * window.innerHeight}px`;
  }

  // ---------- Narrative line swap ----------
  let lineIndex = -1;
  function setLine(i) {
    if (i === lineIndex) return;
    const old = lineWrap.querySelector(".line:not(.leave)");
    if (old) {
      old.classList.remove("enter");
      old.classList.add("leave");
      setTimeout(() => old.remove(), 300);
    }
    const p = document.createElement("p");
    p.className = "line" + (lineIndex === -1 ? "" : " enter");
    p.textContent = LINES[i];
    lineWrap.appendChild(p);
    lineIndex = i;
  }

  // ---------- State reveals ----------
  let revealed = 0;
  function setRevealed(n) {
    if (n === revealed) return;
    statePaths.forEach((p, i) => p.classList.toggle("on", i < n));
    dots.forEach((d, i) => d.classList.toggle("on", i < n));
    if (n > revealed) {
      // restart the one-shot "landing" animation on the newest state
      const p = statePaths[n - 1];
      p.classList.remove("fresh");
      p.getBoundingClientRect();
      p.classList.add("fresh");
    }
    if (n >= 1 && n <= 9 && n !== revealed) launchFlock();
    revealed = n;
  }

  // ---------- Bats ----------
  // Each bat is its own sprite cut from the shared bats image, so the art stays untouched.
  const bats = BAT_SPRITES.map((sp) => {
    const [x, y, w, h] = sp;
    const el = document.createElement("div");
    el.className = "bat";
    batSprite(el, sp);
    batsEl.appendChild(el);
    return {
      el, w, h,
      // position within the flock, relative to the flock's centre (fraction of the window)
      ox: (x + w / 2 - 1500) / W,
      oy: (y + h / 2 - 220) / H,
      flapHz: 5 + Math.random() * 3,
      phase: Math.random() * Math.PI * 2,
      wob: 0.01 + Math.random() * 0.02,
      lag: Math.random() * 0.12,
    };
  });

  function sizeBats() {
    const k = Math.max(M.vw, M.vh * 1.4) / W; // bats keep a natural size on any screen
    bats.forEach((b) => {
      b.el.style.width = `${b.w * k}px`;
      b.el.style.height = `${b.h * k}px`;
    });
  }

  let flight = null;
  let flightCount = 0;

  function launchFlock() {
    if (reduceMotion) return;
    const dir = flightCount++ % 2 === 0 ? 1 : -1; // alternate directions per state
    flight = {
      start: performance.now(),
      dur: 2600 + Math.random() * 600,
      dir,
      y0: 0.1 + Math.random() * 0.22,
      y1: 0.05 + Math.random() * 0.2,
      amp: 0.03 + Math.random() * 0.035,
      freq: 1.2 + Math.random() * 1.2,
      seed: Math.random() * 10,
    };
  }

  function drawBats(now) {
    if (!flight) return;
    const tAll = (now - flight.start) / flight.dur;
    if (tAll > 1.25) {
      bats.forEach((b) => (b.el.style.opacity = 0));
      flight = null;
      return;
    }
    const sw = M.vw, sh = M.vh;
    const k = Math.max(M.vw, M.vh * 1.4) / W;
    for (const b of bats) {
      const u = clamp(tAll - b.lag);
      if (u <= 0 || u >= 1) { b.el.style.opacity = 0; continue; }
      const travel = lerp(-0.25, 1.25, u);
      const xFrac = flight.dir > 0 ? travel : 1 - travel;
      // irregular, non-linear path: drift + two layered sine wobbles + per-bat jitter
      const yFrac =
        lerp(flight.y0, flight.y1, u) +
        Math.sin(u * Math.PI * 2 * flight.freq + flight.seed) * flight.amp +
        Math.sin(u * Math.PI * 7.3 + b.phase) * b.wob;
      const x = (xFrac + b.ox * flight.dir) * sw - (b.w * k) / 2;
      const y = (yFrac + b.oy) * sh - (b.h * k) / 2;
      // wing flap: squash vertically, plus slight bank that follows the wobble
      const flap = 0.45 + 0.55 * Math.abs(Math.cos((now / 1000) * b.flapHz * Math.PI + b.phase));
      const bank = Math.cos(u * Math.PI * 2 * flight.freq + flight.seed) * 12 * flight.dir;
      b.el.style.opacity = 1;
      b.el.style.transform =
        `translate3d(${x}px, ${y}px, 0) rotate(${bank}deg) scale(${flight.dir}, ${flap})`;
    }
  }

  // ---------- Per-frame update ----------
  let lastY = -1;
  let dirty = true;

  function update(now) {
    const vh = M.vh;
    const y = window.scrollY;
    const f = y / vh; // scroll position in steps

    if (y !== lastY || dirty) {
      lastY = y;
      dirty = false;

      const v = viewAt(f);
      applyView(v);

      // states + narrative
      const step = Math.floor(f + 0.001);
      setRevealed(clamp(step, 0, 9));
      setLine(clamp(step, 0, STEP_CLOSE));

      // state name: only the newest state, fades as the next one arrives
      const active = step >= 1 && step <= 9 && f < step + 0.85 ? step - 1 : -1;
      labels.forEach((el, i) => {
        el.classList.toggle("show", i === active);
        if (i === active || el.classList.contains("show")) {
          const s = STATES[i];
          el.style.transform = `translate3d(${v.ox + s.x * v.s}px, ${v.oy + s.y * v.s}px, 0) translate(-50%, -50%)`;
        }
      });

      // transition into Act 2: narrative shrinks into the bottom-right corner
      const t = smooth(range(f, TRANS_FROM, TRANS_TO));
      const margin = M.gap;
      const right = narrative.offsetLeft + narrative.offsetWidth;
      const bottom = narrative.offsetTop + narrative.offsetHeight;
      const dx = (M.vw - margin - right) * t;
      const dy = (M.vh - margin - bottom) * t;
      narrative.style.transform = `translate(${dx}px, ${dy}px) scale(${lerp(1, 0.42, t)})`;
      narrative.style.opacity = 1 - range(f, 11.4, 11.95);
      narrative.style.visibility = f >= 11.95 ? "hidden" : "visible";

      // Act 2 crossfades over the (now fully zoomed) Act 1 map
      const a2 = smooth(range(f, 10.8, 11.8));
      stage.style.opacity = a2;
      stage.style.visibility = a2 > 0 ? "visible" : "hidden"; // nothing to paint during Act 1
      svg.style.opacity = 1 - a2;
      svg.style.visibility = a2 < 1 ? "visible" : "hidden";
      const inAct2 = f >= 11.85;
      if (inAct2 !== document.body.classList.contains("act2")) {
        document.body.classList.toggle("act2", inAct2);
        window.dispatchEvent(new CustomEvent("act2change", { detail: inAct2 }));
      }

      hint.classList.toggle("hide", f > 0.15);
    }

    drawBats(now);
    requestAnimationFrame(update);
  }

  function relayout() {
    sizeTrack();
    measure();
    sizeBats();
    // centre the scroll hint under the map, not under the narrative
    hint.style.left = `${(M.vw - M.narrCol) / 2}px`;
    dirty = true;
  }

  // shared with act2.js
  window.AGAVE = { W, H, BAT_SPRITES, batSprite, reduceMotion, isTouch, relayout: () => relayout() };

  relayout();
  window.addEventListener("resize", relayout);
  window.addEventListener("orientationchange", () => setTimeout(relayout, 250));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
  setLine(0);
  requestAnimationFrame(update);
  // a first flight over the grey continent on load
  setTimeout(launchFlock, 700);
})();
