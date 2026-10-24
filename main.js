(() => {
  "use strict";

  // ---------- Canvas + camera geometry ----------
  // All PNGs share one 2388x1668 canvas. The nine Act 1 states (in USA.png's frame)
  // line up with Act 2's States.png when the Act 1 stack is scaled by ZOOM_END
  // around FOCUS, measured from the shapes' bounding boxes, so the final Act 1
  // frame and the Act 2 base land pixel-on-pixel.
  const W = 2388, H = 1668;
  const ZOOM_END = 4.663;
  const FOCUS = { x: 685.4, y: 1142.2 }; // canvas px

  const STATES = [
    // name, centroid in USA.png canvas px
    { name: "Arizona",         x: 689, y: 967 },
    { name: "New Mexico",      x: 780, y: 964 },
    { name: "Texas",           x: 878, y: 1022 },
    { name: "Coahuila",        x: 812, y: 1105 },
    { name: "Chihuahua",       x: 744, y: 1075 },
    { name: "Nuevo León",      x: 837, y: 1140 },
    { name: "San Luis Potosí", x: 820, y: 1200 },
    { name: "Sonora",          x: 674, y: 1044 },
    { name: "Zacatecas",       x: 786, y: 1186 },
  ];

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
  // 10..12 narrative shrinks to bottom-right, Act 2 base crossfades in
  const STEP_CLOSE = 10;
  const ZOOM_FROM = 0.35, ZOOM_TO = 10;
  const TRANS_FROM = 10.6, TRANS_TO = 12;
  const TOTAL_STEPS = 12;

  // Individual bats inside "Bats flying.png" (canvas px: x, y, w, h), found from its alpha channel.
  const BAT_SPRITES = [
    [1192, 297, 29, 34], [1194, 372, 34, 26], [1219, 280, 44, 22], [1220, 251, 44, 27],
    [1257, 264, 32, 24], [1363, 230, 60, 37], [1415, 191, 86, 60], [1459, 240, 98, 57],
    [1516, 277, 61, 26], [1576, 91, 129, 56], [1577, 180, 88, 82], [1655, 129, 89, 37],
    [1657, 188, 56, 37], [1734, 66, 86, 53],
  ];
  const BAT_SRC = "assets/Background 2/Interactive elements/NGOs/Bats flying.png";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- DOM ----------
  const $ = (s) => document.querySelector(s);
  const track = $("#scroll-track");
  const stage = $("#stage");
  const camera = $("#camera");
  const act2 = $("#act2");
  const stateImgs = [...document.querySelectorAll("#camera .state")];
  const labelsEl = $("#labels");
  const batsEl = $("#bats");
  const narrative = $("#narrative");
  const lineWrap = $(".line-wrap");
  const progressEl = $(".progress");
  const hint = $("#scroll-hint");

  camera.style.transformOrigin = `${(FOCUS.x / W) * 100}% ${(FOCUS.y / H) * 100}%`;

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

  // ---------- Fitting the canvas to the window ----------
  // The stage fills the window when it can, but never crops the part of the map
  // that matters: the whole continent at the start of Act 1, and the nine
  // illustrated states (clear of the category buttons) by Act 2. If the window's
  // shape makes that impossible, thin paper-coloured bands appear instead.
  const SAFE_START = { x0: 21, y0: 91, x1: 2387, y1: 1510 };  // USA.png land
  const SAFE_END = { x0: 345, y0: 52, x1: 2080, y1: 1578 };   // States.png + a small margin
  const catNav = document.querySelector("#cat-nav");

  function layoutStage(p) {
    const vw = window.innerWidth, vh = window.innerHeight;
    // keep the map clear of the button column once Act 2's UI is there
    const navW = catNav.offsetWidth ? catNav.offsetWidth + vw * 0.024 + 12 : 0;
    const reserve = navW * p;
    const r = {
      x0: lerp(SAFE_START.x0, SAFE_END.x0, p), y0: lerp(SAFE_START.y0, SAFE_END.y0, p),
      x1: lerp(SAFE_START.x1, SAFE_END.x1, p), y1: lerp(SAFE_START.y1, SAFE_END.y1, p),
    };
    const sFit = Math.min((vw - reserve) / (r.x1 - r.x0), vh / (r.y1 - r.y0));
    const sCover = Math.max(vw / W, vh / H);
    const s = Math.min(sFit, sCover);
    const sw = W * s, sh = H * s;
    // centre the safe area in the space left of the buttons, then pull the
    // stage back over any edge it would otherwise leave uncovered
    const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
    const fitX = (a, lo, hi) => Math.min(Math.max(a, Math.min(lo, hi)), Math.max(lo, hi));
    const left = fitX((vw - reserve) / 2 - cx * s, 0, vw - sw);
    const top = fitX(vh / 2 - cy * s, 0, vh - sh);
    stage.style.width = `${sw}px`;
    stage.style.height = `${sh}px`;
    stage.style.left = `${left}px`;
    stage.style.top = `${top}px`;
    // where a band shows, fade that edge of the map into the paper instead of a hard cut
    const fade = (gap) => (gap > 1 ? "5%" : "0%");
    stage.style.setProperty("--fl", fade(left));
    stage.style.setProperty("--fr", fade(vw - left - sw));
    stage.style.setProperty("--ft", fade(top));
    stage.style.setProperty("--fb", fade(vh - top - sh));
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
    stateImgs.forEach((img, i) => img.classList.toggle("on", i < n));
    dots.forEach((d, i) => d.classList.toggle("on", i < n));
    if (n > revealed) {
      const img = stateImgs[n - 1];
      img.classList.add("fresh");
      requestAnimationFrame(() => requestAnimationFrame(() => img.classList.remove("fresh")));
    }
    if (n >= 1 && n <= 9 && n !== revealed) launchFlock();
    revealed = n;
  }

  // ---------- Bats ----------
  // Each bat is its own sprite cut from the shared PNG via background-position,
  // so the source file stays untouched.
  const bats = BAT_SPRITES.map(([x, y, w, h], i) => {
    const el = document.createElement("div");
    el.className = "bat";
    el.style.width = `${(w / W) * 100}%`;
    el.style.height = `${(h / H) * 100}%`;
    el.style.backgroundImage = `url("${BAT_SRC}")`;
    el.style.backgroundSize = `${(W / w) * 100}% ${(H / h) * 100}%`;
    el.style.backgroundPosition = `${(x / (W - w)) * 100}% ${(y / (H - h)) * 100}%`;
    batsEl.appendChild(el);
    return {
      el, w: w / W, h: h / H,
      // position within the flock, relative to the flock's centre (fraction of stage)
      ox: (x + w / 2 - 1500) / W,
      oy: (y + h / 2 - 220) / H,
      flapHz: 5 + Math.random() * 3,
      phase: Math.random() * Math.PI * 2,
      wob: 0.01 + Math.random() * 0.02,
      lag: Math.random() * 0.12,
    };
  });

  let flight = null; // { start, dur, dir, y0, y1, amp, freq }
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
    const sw = stage.clientWidth, sh = stage.clientHeight;
    for (const b of bats) {
      const u = clamp((tAll - b.lag) / 1);
      if (u <= 0 || u >= 1) { b.el.style.opacity = 0; continue; }
      const e = u; // constant cruise speed
      const travel = lerp(-0.25, 1.25, e);
      const xFrac = flight.dir > 0 ? travel : 1 - travel;
      // irregular, non-linear path: drift + two layered sine wobbles + per-bat jitter
      const yFrac =
        lerp(flight.y0, flight.y1, e) +
        Math.sin(e * Math.PI * 2 * flight.freq + flight.seed) * flight.amp +
        Math.sin(e * Math.PI * 7.3 + b.phase) * b.wob;
      const x = (xFrac + b.ox * flight.dir) * sw - (b.w * sw) / 2;
      const y = (yFrac + b.oy) * sh - (b.h * sh) / 2;
      // wing flap: squash vertically, plus slight bank that follows the wobble
      const flap = 0.45 + 0.55 * Math.abs(Math.cos((now / 1000) * b.flapHz * Math.PI + b.phase));
      const bank = Math.cos(e * Math.PI * 2 * flight.freq + flight.seed) * 12 * flight.dir;
      b.el.style.opacity = 1;
      b.el.style.transform =
        `translate(${x}px, ${y}px) rotate(${bank}deg) scale(${flight.dir}, ${flap})`;
    }
  }

  // ---------- Per-frame update ----------
  let lastY = -1;

  function update(now) {
    const vh = window.innerHeight;
    const y = window.scrollY;
    const f = y / vh; // scroll position in steps

    if (y !== lastY) {
      lastY = y;

      // camera zoom: geometric interpolation so the zoom speed feels even
      const zp = smooth(range(f, ZOOM_FROM, ZOOM_TO));
      const z = Math.pow(ZOOM_END, zp);
      layoutStage(zp);
      camera.style.transform = `scale(${z})`;

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
          const sx = FOCUS.x + (s.x - FOCUS.x) * z;
          const sy = FOCUS.y + (s.y - FOCUS.y) * z;
          el.style.left = `${(sx / W) * 100}%`;
          el.style.top = `${(sy / H) * 100}%`;
        }
      });

      // transition into Act 2: narrative shrinks into the bottom-right corner
      const t = smooth(range(f, TRANS_FROM, TRANS_TO));
      const sw = window.innerWidth, sh = window.innerHeight; // narrative lives in the window overlay
      const margin = sw * 0.025;
      const endScale = 0.42;
      const right = narrative.offsetLeft + narrative.offsetWidth;
      const bottom = narrative.offsetTop + narrative.offsetHeight;
      const dx = (sw - margin - right) * t;
      const dy = (sh - margin - bottom) * t;
      narrative.style.transform = `translate(${dx}px, ${dy}px) scale(${lerp(1, endScale, t)})`;
      narrative.style.opacity = 1 - range(f, 11.4, 11.95);
      narrative.style.visibility = f >= 11.95 ? "hidden" : "visible";

      // Act 2 base crossfades over the (now fully zoomed) Act 1 stack
      const a2 = smooth(range(f, 10.8, 11.8));
      act2.style.opacity = a2;
      camera.style.opacity = 1 - a2;
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

  // shared with act2.js
  window.AGAVE = { W, H, BAT_SPRITES, BAT_SRC, reduceMotion };

  sizeTrack();
  window.addEventListener("resize", () => { sizeTrack(); lastY = -1; });
  setLine(0);
  requestAnimationFrame(update);
  // a first flight over the grey continent on load
  setTimeout(launchFlock, 700);
})();
