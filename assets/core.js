/* core.js: deterministic generation core shared by the live canvas and the gallery.
   Same input data always produces the same artwork. Exposes window.BB. */
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

  // --- 1D value noise with smoothstep interpolation ---
  function makeNoise(seed) {
    const rand = mulberry32(seed);
    const table = [];
    for (let i = 0; i < 512; i++) table.push(rand());
    return function (x) {
      const xi = Math.floor(x);
      const xf = x - xi;
      const a = table[((xi % 512) + 512) % 512];
      const b = table[(((xi + 1) % 512) + 512) % 512];
      const u = xf * xf * (3 - 2 * xf);
      return a + (b - a) * u;
    };
  }

  // --- palette: price maps to hue, cool blue (low) to warm amber (high) ---
  function hueForPrice(price, pMin, pMax) {
    const span = pMax - pMin;
    const t = span > 0 ? (price - pMin) / span : 0.5;
    const c = Math.max(0, Math.min(1, t));
    return 220 - c * 190;
  }

  // --- one calligraphic stroke for one slot (deterministic) ---
  function makeLayer(slotIndex, epochId, price, txCount, w, h, pMin, pMax) {
    const rng = mulberry32(epochId * 131 + slotIndex * 9176);
    const noise = makeNoise(epochId * 31 + slotIndex * 7 + 13);
    const hue = hueForPrice(price, pMin, pMax);
    const agi = Math.min(1, txCount / MAX_TX);
    const cx = w / 2;
    const cy = h / 2;
    const diag = Math.hypot(w, h) / 2;

    // starting point moves outward with the slot, direction seeded
    const baseAngle = (slotIndex / SLOTS_PER_EPOCH) * Math.PI * 2 + rng() * 0.6;
    const radius = diag * (0.05 + (slotIndex / SLOTS_PER_EPOCH) * 0.75) + rng() * 40;
    const startX = cx + Math.cos(baseAngle) * radius;
    const startY = cy + Math.sin(baseAngle) * radius;

    const steps = Math.round(14 + txCount * 0.35); // more tx = longer stroke
    const stepLen = 8 + agi * 14;
    const bend = 0.02 + agi * 0.1; // curvature
    const wobble = 0.05 + agi * 0.5; // noise influence
    const baseW = 0.8 + agi * 4.5; // stroke width
    const xOff = rng() * 1000;
    const yOff = rng() * 1000;

    let x = startX;
    let y = startY;
    let ang = Math.atan2(cy - y, cx - x) + (rng() - 0.5) * 1.2;
    const points = [];

    for (let i = 0; i < steps; i++) {
      const t = i / Math.max(1, steps - 1);
      const n1 = noise(xOff + i * 0.11);
      const n2 = noise(yOff + i * 0.13);
      ang += (bend + wobble * (n1 - 0.5)) * (n2 > 0.5 ? 1 : -1);
      x += Math.cos(ang) * stepLen;
      y += Math.sin(ang) * stepLen;
      const wdt = Math.max(0.3, baseW * (0.35 + 0.65 * Math.sin(Math.PI * t)) * (0.6 + n2 * 0.8));
      points.push({ x, y, w: wdt });
    }

    return { slotIndex, hue, points };
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
      ctx.strokeStyle = "hsla(" + layer.hue + ", 70%, 62%, " + a + ")";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let i = 0; i < pts.length - 1; i++) {
        ctx.lineWidth = (pts[i].w + pts[i + 1].w) / 2;
        ctx.beginPath();
        ctx.moveTo(pts[i].x, pts[i].y);
        ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
        ctx.stroke();
      }
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
    makeLayer,
    generateEpochArt,
    drawLayers,
  };
})();
