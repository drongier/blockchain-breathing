/* core.js: deterministic generation core shared by the live canvas and the gallery.
   One unique shape per epoch (circle, star, spiral, lemniscate or polygon).
   Each slot evolves that same shape a few gentle steps (breathe, twist, ripple,
   melt, drift, flow), so the canvas records the trajectory of a single living
   form. The blockchain data picks the options and the same data always redraws
   the same artwork. Exposes window.BB. */
(function () {
  "use strict";

  const SLOT_SECONDS = 12;
  const SLOTS_PER_EPOCH = 32;
  const EPOCH_SECONDS = SLOT_SECONDS * SLOTS_PER_EPOCH; // 384
  const MAX_TX = 250; // tx count that maps to full agitation

  // --- seeded PRNG (mulberry32) ---
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // --- 2D value noise with smoothstep interpolation ---
  function makeNoise(seed) {
    const rand = mulberry32(seed);
    const table = [];
    for (let i = 0; i < 256; i++) table.push(rand());
    const at = function (xx, yy) {
      const xi = Math.floor(xx);
      const yi = Math.floor(yy);
      const xf = xx - xi;
      const yf = yy - yi;
      const u = xf * xf * (3 - 2 * xf);
      const v = yf * yf * (3 - 2 * yf);
      const h = (px, py) =>
        table[(((px % 256) + 256) % 256 + (((py % 256) + 256) % 256) * 57) % 256];
      const a = h(xi, yi);
      const b = h(xi + 1, yi);
      const c = h(xi, yi + 1);
      const d = h(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    return at;
  }

  // --- palette: price maps to hue, cool blue (low) to warm amber (high) ---
  function hueForPrice(price, pMin, pMax) {
    const span = pMax - pMin;
    const t = span > 0 ? (price - pMin) / span : 0.5;
    const c = Math.max(0, Math.min(1, t));
    return 220 - c * 190;
  }

  // --- base shapes ---
  // 1 circle, 2 star, 3 spiral, 4 lemniscate, 5 regular polygon outline
  function shapePoints(shape, segments, cx, cy, size, r) {
    const pts = [];
    let i, a, t, rad;
    if (shape === 1) {
      for (i = 0; i < segments; i++) {
        a = (i / segments) * 2 * Math.PI;
        pts.push([cx + size * Math.cos(a), cy + size * Math.sin(a)]);
      }
    } else if (shape === 2) {
      const branches = 3 + Math.floor(r() * 6);
      const inner = 0.35 + r() * 0.35;
      const total = segments * 2;
      for (i = 0; i < total; i++) {
        a = (i / total) * 2 * Math.PI;
        rad = i % 2 === 0 ? size : size * inner;
        pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
      }
    } else if (shape === 3) {
      const turns = 1 + r() * 2.5;
      for (i = 0; i < segments; i++) {
        t = i / segments;
        a = t * turns * 2 * Math.PI;
        rad = size * t;
        pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
      }
    } else if (shape === 4) {
      for (i = 0; i < segments; i++) {
        t = (i / segments) * 2 * Math.PI;
        const denom = 1 + Math.sin(t) * Math.sin(t);
        pts.push([
          cx + (size * Math.cos(t)) / denom,
          cy + (size * Math.sin(t) * Math.cos(t)) / denom,
        ]);
      }
    } else {
      const sides = 3 + Math.floor(r() * 5);
      const corners = [];
      for (let k = 0; k < sides; k++) {
        a = (k / sides) * 2 * Math.PI - Math.PI / 2;
        corners.push([cx + size * Math.cos(a), cy + size * Math.sin(a)]);
      }
      for (i = 0; i < segments; i++) {
        t = (i / segments) * sides;
        const k = Math.floor(t) % sides;
        const f = t - Math.floor(t);
        const p0 = corners[k];
        const p1 = corners[(k + 1) % sides];
        pts.push([p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f]);
      }
    }
    return pts;
  }

  // --- the ten base archetypes, UJI-preset style ---
  // each has its own shapes, deformations, energy and stroke style
  const ARCHETYPES = [
    { name: "orbite", shapes: [1], defs: ["twist", "drift"], ampScale: 0.9, thick: [1.2, 2.6], alpha: [0.5, 0.7] },
    { name: "respiration", shapes: [1], defs: ["breathe", "ripple"], ampScale: 1.2, thick: [0.8, 1.8], alpha: [0.45, 0.65] },
    { name: "etoile filante", shapes: [2], defs: ["drift", "twist"], ampScale: 1.0, thick: [1.0, 2.2], alpha: [0.5, 0.7] },
    { name: "vortex", shapes: [3], defs: ["twist", "breathe", "drift"], ampScale: 1.1, thick: [1.0, 2.4], alpha: [0.5, 0.7] },
    { name: "noeud", shapes: [4], defs: ["flow", "breathe"], ampScale: 1.0, thick: [1.0, 2.0], alpha: [0.5, 0.7] },
    { name: "cristal", shapes: [5], defs: ["ripple", "melt", "flow"], ampScale: 0.9, thick: [1.2, 2.6], alpha: [0.45, 0.65] },
    { name: "tapis", shapes: [5], defs: ["breathe", "ripple", "drift"], ampScale: 1.0, thick: [1.0, 2.2], alpha: [0.45, 0.65] },
    { name: "galaxie", shapes: [3], defs: ["flow", "drift"], ampScale: 1.3, thick: [0.8, 1.8], alpha: [0.5, 0.7] },
    { name: "fleur", shapes: [1, 2], defs: ["breathe", "ripple"], ampScale: 1.2, thick: [0.9, 2.0], alpha: [0.45, 0.65] },
    { name: "tempete", shapes: [2], defs: ["flow", "twist", "drift"], ampScale: 1.4, thick: [1.0, 2.4], alpha: [0.5, 0.7] },
  ];

  // --- epoch generator: the fixed identity of one epoch's artwork ---
  // depends only on epochId (+ canvas size), so live canvas and gallery agree
  function makeEpochGen(epochId, w, h) {
    const rng = mulberry32(epochId * 7919 + 104729);
    const r = rng;
    const arch = ARCHETYPES[Math.floor(r() * ARCHETYPES.length)];
    const shape = arch.shapes[Math.floor(r() * arch.shapes.length)];
    const segments = Math.round(60 + r() * 90);
    const cx = w * (0.3 + r() * 0.4);
    const cy = h * (0.3 + r() * 0.4);
    const size = Math.hypot(w, h) / 2 * (0.12 + r() * 0.18);
    const stepsPerSlot = 2 + Math.floor(r() * 3); // 2-4 steps per slot
    const thickness = arch.thick[0] + r() * (arch.thick[1] - arch.thick[0]);
    const alpha = arch.alpha[0] + r() * (arch.alpha[1] - arch.alpha[0]);

    // build the archetype's deformations with seeded, scaled amplitudes
    const defs = arch.defs.map(function (name) {
      if (name === "breathe") {
        return { name, amp: (0.02 + r() * 0.05) * arch.ampScale, phase: r() * 2 * Math.PI };
      }
      if (name === "twist") {
        return { name, amp: (0.2 + r() * 0.8) * (Math.PI / 180) * arch.ampScale };
      }
      if (name === "ripple") {
        return { name, amp: (1.5 + r() * 3) * arch.ampScale, freq: 1 + r() * 3 };
      }
      if (name === "melt") {
        return { name, amp: (0.002 + r() * 0.005) * arch.ampScale };
      }
      if (name === "drift") {
        return { name, vx: (r() - 0.5) * 1.2 * arch.ampScale, vy: (r() - 0.5) * 1.2 * arch.ampScale };
      }
      if (name === "flow") {
        return { name, amp: (0.5 + r() * 1.5) * arch.ampScale, scale: 0.004 + r() * 0.004, step: 0.06 + r() * 0.06 };
      }
      return { name, amp: 0 };
    });

    return {
      epochId,
      archName: arch.name,
      shape,
      segments,
      cx,
      cy,
      size,
      w,
      h,
      stepsPerSlot,
      thickness,
      alpha,
      noise: makeNoise(epochId * 17 + 3),
      defs,
    };
  }

  // --- the base shape of the epoch (before any evolution) ---
  function baseShape(gen) {
    const rng = mulberry32(gen.epochId * 131 + 9176);
    return shapePoints(gen.shape, gen.segments, gen.cx, gen.cy, gen.size, rng);
  }

  // --- one gentle evolution step, amplified by the slot's activity ---
  // totalSteps is the step counter since the start of the seen sequence
  function evolveStep(gen, pts, agi, totalSteps) {
    const t = totalSteps / (SLOTS_PER_EPOCH * gen.stepsPerSlot); // 0..1
    const m = 0.5 + agi; // activity multiplier
    for (const def of gen.defs) {
      if (def.name === "breathe") {
        pts = pts.map((p, i) => {
          const dx = p[0] - gen.cx;
          const dy = p[1] - gen.cy;
          const dist = Math.hypot(dx, dy) || 1;
          const ph = def.phase + (i / pts.length) * 2 * Math.PI;
          const k = 1 + def.amp * m * Math.sin(2 * Math.PI * t + ph);
          return [gen.cx + (dx / dist) * dist * k, gen.cy + (dy / dist) * dist * k];
        });
      } else if (def.name === "twist") {
        const ang = def.amp * m;
        pts = pts.map((p, i) => {
          const dx = p[0] - gen.cx;
          const dy = p[1] - gen.cy;
          const a = ang * (i / pts.length);
          const c = Math.cos(a);
          const s = Math.sin(a);
          return [gen.cx + dx * c - dy * s, gen.cy + dx * s + dy * c];
        });
      } else if (def.name === "ripple") {
        pts = pts.map((p, i) => {
          const dx = p[0] - gen.cx;
          const dy = p[1] - gen.cy;
          const dist = Math.hypot(dx, dy) || 1;
          const wave =
            def.amp * m * Math.sin((i / pts.length) * def.freq * 2 * Math.PI + t * 6);
          const k = 1 + wave / Math.max(60, dist);
          return [gen.cx + dx * k, gen.cy + dy * k];
        });
      } else if (def.name === "melt") {
        const amount = def.amp * m;
        pts = pts.map((p) => [
          gen.cx + (p[0] - gen.cx) * (1 - amount),
          gen.cy + (p[1] - gen.cy) * (1 - amount),
        ]);
      } else if (def.name === "drift") {
        pts = pts.map((p) => [p[0] + def.vx * m, p[1] + def.vy * m]);
      } else if (def.name === "flow") {
        pts = pts.map((p) => {
          const nx = gen.noise(p[0] * def.scale, p[1] * def.scale + totalSteps * def.step);
          const ny = gen.noise(p[0] * def.scale + 100, p[1] * def.scale + totalSteps * def.step);
          return [p[0] + (nx - 0.5) * def.amp * m * 2, p[1] + (ny - 0.5) * def.amp * m * 2];
        });
      }
    }
    return pts;
  }

  // --- keep the evolved shape inside the canvas: recenter and shrink only ---
  // Never enlarges: the shape keeps its natural size, we only clamp overflow.
  function normalizePoints(pts, w, h) {
    const margin = 0.08;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    const bw = maxX - minX || 1;
    const bh = maxY - minY || 1;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const targetW = w * (1 - 2 * margin);
    const targetH = h * (1 - 2 * margin);
    const scale = Math.min(1, targetW / bw, targetH / bh);
    const ox = w / 2 - cx * scale;
    const oy = h / 2 - cy * scale;
    return pts.map((p) => [ox + p[0] * scale, oy + p[1] * scale]);
  }

  // --- evolve one full slot (stepsPerSlot steps); seq is the 0-based
  //     position of the slot in the seen sequence (live and replay agree) ---
  function evolveSlot(gen, pts, agi, seq) {
    let out = pts;
    const base = seq * gen.stepsPerSlot;
    for (let e = 0; e < gen.stepsPerSlot; e++) {
      out = evolveStep(gen, out, agi, base + e + 1);
    }
    return normalizePoints(out, gen.w, gen.h);
  }

  // --- rebuild the full artwork of an epoch from its raw data ---
  // epochData: [{ts, price, tx}] in the order the slots were seen
  function generateEpochArt(epochData, w, h) {
    let pMin = Infinity;
    let pMax = -Infinity;
    for (const s of epochData) {
      if (s.price < pMin) pMin = s.price;
      if (s.price > pMax) pMax = s.price;
    }
    if (pMin === Infinity) { pMin = 2000; pMax = 4000; } // fallback
    const pad = Math.max(100, (pMax - pMin) * 0.15);
    pMin = Math.max(0, pMin - pad);
    pMax += pad;

    const gen = makeEpochGen(epochData[0].epochId || 0, w, h);
    let form = baseShape(gen);
    const layers = [];
    for (let i = 0; i < epochData.length; i++) {
      const s = epochData[i];
      const agi = Math.min(1, s.tx / MAX_TX);
      form = evolveSlot(gen, form, agi, i);
      layers.push({
        slotIndex: i,
        hue: hueForPrice(s.price, pMin, pMax),
        points: form.slice(),
        thickness: gen.thickness,
        alpha: gen.alpha,
      });
    }
    return layers;
  }

  // --- paint a set of layers onto a 2D context (canvas already sized) ---
  // opts.now / opts.traceDuration enable progressive drawing: each layer with a
  // createdAt timestamp is traced point by point, like a pen drawing the shape.
  function drawLayers(ctx, layers, alpha, opts) {
    const a = alpha === undefined ? 1 : alpha;
    const now = opts ? opts.now : undefined;
    const traceDuration = opts ? opts.traceDuration : undefined;
    for (const layer of layers) {
      const pts = layer.points;
      if (pts.length < 2) continue;

      let count = pts.length;
      if (now !== undefined && traceDuration && layer.createdAt !== undefined) {
        const t = (now - layer.createdAt) / traceDuration;
        const progress = t < 0 ? 0 : t > 1 ? 1 : t;
        count = Math.max(2, Math.round(progress * (pts.length - 1)) + 1);
      }

      ctx.strokeStyle =
        "hsla(" + layer.hue + ", 65%, 60%, " + layer.alpha * a + ")";
      ctx.lineWidth = layer.thickness;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < count; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }
  }

  window.BB = {
    SLOT_SECONDS,
    SLOTS_PER_EPOCH,
    EPOCH_SECONDS,
    MAX_TX,
    mulberry32,
    makeNoise,
    hueForPrice,
    makeEpochGen,
    baseShape,
    evolveSlot,
    generateEpochArt,
    drawLayers,
  };
})();
