(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Nav hairline once scrolled ---------- */
  var nav = document.querySelector(".nav");
  if (nav) {
    var onScroll = function () { nav.classList.toggle("is-stuck", window.scrollY > 8); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- The working ring ----------
     Mirrors the app: the ring shows remaining time, and each one-second tick
     animates linearly toward where the ring will be at the next tick. */
  var C = 2 * Math.PI * 184;
  var PHASES = {
    focus: { label: "Focus", ms: 25 * 60 * 1000, kind: "focus" },
    short: { label: "Short break", ms: 5 * 60 * 1000, kind: "break" },
    long: { label: "Long break", ms: 15 * 60 * 1000, kind: "break" }
  };
  var ring = document.getElementById("demo");
  if (ring) {
    var wrap = ring.parentElement;
    var bar = ring.querySelector(".ring__bar");
    var timeEl = document.getElementById("demo-time");
    var phaseEl = document.getElementById("demo-phase");
    var statusEl = document.getElementById("demo-status");
    var toggle = document.getElementById("demo-toggle");
    var dots = ring.querySelectorAll(".dots i");

    var phase = "focus", completed = 0;
    var duration = PHASES.focus.ms, remaining = duration, deadline = 0, running = false, timer = 0;

    var fmt = function (ms) {
      var s = Math.max(0, Math.ceil(ms / 1000));
      var m = Math.floor(s / 60), r = s % 60;
      return m + ":" + (r < 10 ? "0" : "") + r;
    };
    var setOffset = function (fraction, transition) {
      bar.style.transition = transition;
      bar.style.strokeDashoffset = String(C * (1 - Math.min(1, Math.max(0, fraction))));
    };
    var paintDots = function () {
      for (var i = 0; i < dots.length; i++) {
        dots[i].className = i < completed ? "done" : (i === completed && phase === "focus" ? "on" : "");
      }
      if (phase !== "focus" && completed > 0) dots[Math.min(completed, dots.length) - 1].className = "on";
    };
    var render = function (smooth) {
      timeEl.textContent = fmt(remaining);
      var lead = running && !reduce ? 1000 : 0;
      var t = !smooth ? "none" : running && !reduce ? "stroke-dashoffset 1000ms linear, stroke 300ms ease" : "stroke-dashoffset 250ms ease-out, stroke 300ms ease";
      setOffset((remaining - lead) / duration, t);
      statusEl.textContent = running ? "In progress" : remaining === duration ? "Ready" : "Paused";
      wrap.setAttribute("data-running", running ? "true" : "false");
      toggle.setAttribute("aria-label", running ? "Pause" : "Start");
      document.title = running ? fmt(remaining) + " " + PHASES[phase].label + ", Ringlet" : baseTitle;
    };
    var baseTitle = document.title;

    var schedule = function () {
      clearTimeout(timer);
      if (!running) return;
      var until = remaining % 1000 || 1000;
      timer = setTimeout(tick, until + 4);
    };
    var tick = function () {
      remaining = Math.max(0, deadline - Date.now());
      if (remaining <= 0) { complete(); return; }
      render(true);
      schedule();
    };
    var setPhase = function (p, refill) {
      phase = p;
      duration = remaining = PHASES[p].ms;
      phaseEl.textContent = PHASES[p].label;
      ring.setAttribute("data-phase", PHASES[p].kind);
      wrap.setAttribute("data-phase", PHASES[p].kind);
      paintDots();
      if (refill && !reduce) {
        setOffset(1, "stroke-dashoffset 600ms cubic-bezier(0.2, 0.8, 0.2, 1), stroke 300ms ease");
        timeEl.textContent = fmt(remaining);
      } else render(false);
    };
    var next = function () {
      if (phase === "focus") {
        completed = Math.min(completed + 1, 4);
        setPhase(completed >= 4 ? "long" : "short", true);
      } else {
        if (phase === "long") completed = 0;
        setPhase("focus", true);
      }
    };
    var complete = function () {
      running = false; clearTimeout(timer);
      next();
      render(true);
    };
    var start = function () {
      running = true;
      deadline = Date.now() + remaining;
      render(true);
      schedule();
    };
    var pause = function () {
      remaining = Math.max(0, deadline - Date.now());
      running = false; clearTimeout(timer);
      render(true);
    };

    toggle.addEventListener("click", function () { running ? pause() : start(); });
    document.getElementById("demo-reset").addEventListener("click", function () {
      running = false; clearTimeout(timer);
      remaining = duration;
      render(true);
    });
    document.getElementById("demo-skip").addEventListener("click", function () {
      var was = running;
      running = false; clearTimeout(timer);
      next();
      if (was) start(); else render(true);
    });
    document.addEventListener("visibilitychange", function () { if (!document.hidden && running) tick(); });

    // Opening moment: the ring refills like a fresh session, then starts counting.
    paintDots();
    ring.setAttribute("data-phase", "focus");
    timeEl.textContent = fmt(remaining);
    if (reduce) {
      setOffset(1, "none");
      ring.classList.add("is-ready");
      render(false);
    } else {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          ring.classList.add("is-ready");
          setOffset(1, "");
          setTimeout(function () { if (!running && remaining === duration) start(); }, 1500);
        });
      });
    }
  }

  /* ---------- Noise waveforms ----------
     Static drawings of three noise colours: white is raw, pink is smoothed,
     brown is a random walk. Seeded so they look the same on every visit. */
  var seed = 7;
  var rand = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; };
  var waves = document.querySelectorAll("[data-noise]");
  for (var w = 0; w < waves.length; w++) {
    var kind = waves[w].getAttribute("data-noise");
    var n = 300, pts = [], y = 0, b = [0, 0, 0, 0, 0, 0, 0];
    for (var i = 0; i < n; i++) {
      var white = rand();
      if (kind === "white") y = white * 0.9;
      else if (kind === "pink") {
        // Paul Kellet's economy pink filter
        b[0] = 0.99765 * b[0] + white * 0.099046;
        b[1] = 0.963 * b[1] + white * 0.2965164;
        b[2] = 0.57 * b[2] + white * 1.0526913;
        y = (b[0] + b[1] + b[2] + white * 0.1848) * 0.36;
      } else {
        b[3] = (b[3] + 0.08 * white) / 1.02;
        y = b[3] * 2.6;
      }
      y = Math.max(-1, Math.min(1, y));
      pts.push((i).toFixed(1) + "," + (24 - y * 20).toFixed(2));
    }
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M" + pts.join("L"));
    waves[w].appendChild(path);
  }
})();
