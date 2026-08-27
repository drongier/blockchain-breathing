/* core.js: deterministic generation core shared by the live canvas and the gallery.
   Draws UJI-style generative shapes (circle/square/triangle/line) whose points are
   deformed over iterations by jitter, expansion, waviness and rotation.
   The blockchain data picks the options; the same data always redraws the same art.
   Exposes window.BB. */
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

  // --- palette: price maps to hue, cool blue (low) to warm amber (high) ---
  function hueForPrice(price, pMin, pMax) {
    const span = pMax - pMin;
    const t = span > 0 ? (price - pMin) / span : 0.5;
    const c = Math.max(0, Math.min(1, t));
    return 220 - c * 190;
  }

  // --- rotate point p around origin o by angle (radians), UJI-style ---
  function rotate(o, p, angle) {
    const s = Math.sin(angle);
    const c = Math.cos(angle);
    const dx = p[0] - o[0];
    const dy = p[1] - o[1];
    return [o[0] + dx * c - dy * s, o[1] + dx * s + dy * c];
  }

  // --- base shape outline: 1=circle, 2=square, 3=triangle, 4=line ---
  function shapePoints(shape, segments, cx, cy, radius) {
    const pts = [];
    for (let i = 0; i < segments; i++) {
      let x, y;
      if (shape === 1) {
        x = cx + radius * Math.cos((i / segments) * 2 * Math.PI);
        y = cy + radius * Math.sin((i / segments) * 2 * Math.PI);
      } else if (shape === 2) {
        const q = segments / 4;
        if (i < q) {
          x = cx - radius + 2 * radius * (i / q);
          y = cy - radius;
        } else if (i < 2 * q) {
          x = cx + radius;
          y = cy - radius + 2 * radius * ((i - q) / q);
        } else if (i < 3 * q) {
          x = cx + radius - 2 * radius * ((i - 2 * q) / q);
          y = cy + radius;
        } else {
          x = cx - radius;
          y = cy + radius - 2 * radius * ((i - 3 * q) / q);
        }
      } else if (shape === 3) {
        const q = segments / 3;
        if (i < q) {
          x = cx - radius + 2 * radius * (i / q);
          y = cy + radius;
        } else if (i < 2 * q) {
          x = cx + radius - radius * ((i - q) / q);
          y = cy + radius - 2 * radius * ((i - q) / q);
        } else {
          x = cx - radius * ((i - 2 * q) / q);
          y = cy - radius + 2 * radius * ((i - 2 * q) / q);
        }
      } else {
        x = cx - radius + 2 * radius * (i / segments);
        y = cy;
      }
      pts.push([x, y]);
    }
    return pts;
  }

  // --- one UJI-style shape for one slot (deterministic) ---
  // price picks the palette, txCount picks the complexity and agitation
  function makeLayer(slotIndex, epochId, price, txCount, w, h, pMin, pMax) {
    const rng = mulberry32(epochId * 131 + slotIndex * 9176);
    const r = rng;
    const hue = hueForPrice(price, pMin, pMax);
    const agi = Math.min(1, txCount / MAX_TX);
    const diag = Math.hypot(w, h) / 2;

    // options derived from the data
    const shape = 1 + Math.floor(r() * 4);
    const segments = Math.round(16 + agi * 130);
    const cx = w * (0.25 + r() * 0.5);
    const cy = h * (0.25 + r() * 0.5);
    const radius =
      diag * (0.08 + (slotIndex / SLOTS_PER_EPOCH) * 0.3) * (0.6 + r() * 0.8);
    const frames = 1 + Math.floor(r() * 25); // how far the drawing evolves

    const jitter = agi * 40;
    const expansion = 1 + agi * 0.3;
    const expansionExp = agi * 2;
    const translationX = (r() - 0.5) * 80;
    const translationY = (r() - 0.5) * 80;
    const wavinessP = 10 + r() * 30;
    const wavinessA = agi * 30;
    const rotationSpeed = ((r() - 0.5) * 3 + agi * 2) * (Math.PI / 180);
    const rotationSpeedup = r() * 0.15;
    const rotOriginX = w * r();
    const rotOriginY = h * r();
    const thickness = 0.6 + agi * 3.5;
    const alpha = 0.55 + agi * 0.4;

    // start from the base shape
    let line = shapePoints(shape, segments, cx, cy, radius);

    // evolve the points over `frames` iterations, UJI-style
    for (let n = 0; n < frames; n++) {
      const expFactorX = Math.pow(expansion, 1 + expansionExp * n / 1000);
      const expFactorY = Math.pow(expansion, 1 + expansionExp * n / 1000);
      const angle =
        rotationSpeed * (1 + rotationSpeedup * n);
      line = line.map((p, i) => {
        let x =
          cx +
          (p[0] - cx + (r() - 0.5) * jitter) * expFactorX +
          translationX +
          wavinessA * Math.sin((2 * Math.PI * i) / wavinessP);
        let y =
          cy +
          (p[1] - cy + (r() - 0.5) * jitter) * expFactorY +
          translationY +
          wavinessA * Math.cos((2 * Math.PI * i) / wavinessP);
        return rotate([w * rotOriginX, h * rotOriginY], [x, y], angle);
      });
    }

    return {
      slotIndex,
      hue,
      points: line,
      thickness,
      alpha,
    };
  }

  // --- rebuild the full artwork of an epoch from its raw data ---
  // epochData: [{ts, price, tx}] in slot order
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

    return epochData.map((s, i) =>
      makeLayer(i, s.epochId || 0, s.price, s.tx, w, h, pMin, pMax)
    );
  }

  // --- paint a set of layers onto a 2D context (canvas already sized) ---
  function drawLayers(ctx, layers, alpha) {
    const a = alpha === undefined ? 1 : alpha;
    for (const layer of layers) {
      const pts = layer.points;
      if (pts.length < 2) continue;
      ctx.strokeStyle =
        "hsla(" + layer.hue + ", 65%, 60%, " + layer.alpha * a + ")";
      ctx.lineWidth = layer.thickness;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }
  }

  window.BB = {
    SLOT_SECONDS,
    SLOTS_PER_EPOCH,
    EPOCH_SECONDS,
    MAX_TX,
    mulberry32,
    hueForPrice,
    makeLayer,
    generateEpochArt,
    drawLayers,
  };
})();
