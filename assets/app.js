/* app.js: the live canvas.
   Polls the latest Ethereum block, draws one calligraphic layer per slot,
   bursts particles on high activity, freezes and archives each epoch. */
(function () {
  "use strict";

  const { SLOT_SECONDS, SLOTS_PER_EPOCH, EPOCH_SECONDS, hueForPrice } = window.BB;

  const RPC_URLS = [
    "https://ethereum.publicnode.com",
    "https://eth.llamarpc.com",
  ];
  const PRICE_URL =
    "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd";
  const POLL_MS = 8000;
  const FREEZE_MS = 8000;
  const PARTICLE_THRESHOLD = 100;
  const LS_KEY = "bb.epochs";

  // ---------- canvas ----------
  const canvas = document.getElementById("art");
  const ctx = canvas.getContext("2d");
  let W = 0;
  let H = 0;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------- state ----------
  const state = {
    epochId: null,
    slotIndex: null,
    lastBlockTs: 0,
    price: 0,
    txCount: 0,
    priceMin: Infinity,
    priceMax: -Infinity,
    gen: null, // epoch generator (fixed identity of the artwork)
    form: null, // current evolved shape
    layers: [],
    particles: [],
    epochData: [],
    frozen: false,
    freezeUntil: 0,
  };

  // ---------- ui ----------
  function el(id) {
    return document.getElementById(id);
  }
  function setStatus(text) {
    el("status").textContent = text;
  }
  function updateStats() {
    el("epochId").textContent = state.epochId === null ? "·" : "#" + state.epochId;
    el("slotIndex").textContent =
      state.slotIndex === null ? "·" : state.slotIndex + 1 + " / 32";
    el("price").textContent = state.price ? "$" + state.price.toFixed(2) : "·";
    el("txCount").textContent = state.txCount === 0 ? "·" : state.txCount;
  }

  // ---------- network ----------
  async function rpc(method, params) {
    let lastErr;
    for (const url of RPC_URLS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        return data.result;
      } catch (err) {
        lastErr = err;
        console.warn("RPC failed:", url, err.message);
      }
    }
    throw lastErr || new Error("all RPC endpoints failed");
  }

  async function fetchBlock() {
    // "false" keeps only transaction hashes: tiny payload, same count.
    // "true" would download megabytes of full transaction data per block.
    const block = await rpc("eth_getBlockByNumber", ["latest", false]);
    return {
      number: parseInt(block.number, 16),
      timestamp: parseInt(block.timestamp, 16),
      txCount: (block.transactions || []).length,
    };
  }

  async function fetchPrice() {
    try {
      const res = await fetch(PRICE_URL);
      const data = await res.json();
      return data.ethereum ? data.ethereum.usd : null;
    } catch (err) {
      console.warn("price fetch failed:", err.message);
      return null;
    }
  }

  // ---------- generation ----------
  function priceRange() {
    if (state.priceMin === Infinity) return { min: 2000, max: 4000 };
    return { min: state.priceMin, max: state.priceMax };
  }

  // evolve the unique shape of this epoch by one slot, then record the layer
  function addLayer(slotIndex, price, tx) {
    const agi = Math.min(1, tx / window.BB.MAX_TX);
    if (!state.gen) {
      state.gen = window.BB.makeEpochGen(state.epochId, W, H);
      state.form = window.BB.baseShape(state.gen);
      el("motor").textContent = state.gen.archName;
    }
    // seq = position in the seen sequence, so live and gallery stay in sync
    const seq = state.layers.length;
    state.form = window.BB.evolveSlot(state.gen, state.form, agi, seq);
    const r = priceRange();
    state.layers.push({
      slotIndex,
      hue: window.BB.hueForPrice(price, r.min, r.max),
      points: state.form.slice(),
      thickness: state.gen.thickness,
      alpha: state.gen.alpha,
    });
  }

  function burstParticles(tx) {
    const n = Math.min(60, Math.floor((tx - PARTICLE_THRESHOLD) / 4));
    const r = priceRange();
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * Math.min(W, H) * 0.4;
      state.particles.push({
        x: W / 2 + Math.cos(angle) * dist,
        y: H / 2 + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 1.6,
        vy: (Math.random() - 0.5) * 1.6,
        life: 1,
        decay: 0.004 + Math.random() * 0.01,
        hue: hueForPrice(state.price, r.min, r.max),
        size: 1 + Math.random() * 2.5,
      });
    }
  }

  // ---------- epoch lifecycle ----------
  function onNewBlock(block) {
    state.lastBlockTs = block.timestamp;
    state.txCount = block.txCount;
    const slotIndex = Math.floor(block.timestamp / SLOT_SECONDS) % SLOTS_PER_EPOCH;
    const epochId = Math.floor(block.timestamp / EPOCH_SECONDS);

    if (state.epochId !== null && epochId !== state.epochId) {
      beginFreeze();
      archiveEpoch();
      resetCanvas();
    }

    state.epochId = epochId;
    state.slotIndex = slotIndex;

    if (state.price > 0) {
      if (state.price < state.priceMin) state.priceMin = state.price;
      if (state.price > state.priceMax) state.priceMax = state.price;
    }

    addLayer(slotIndex, state.price, state.txCount);
    state.epochData.push({ ts: block.timestamp, price: state.price, tx: state.txCount });
    if (state.txCount > PARTICLE_THRESHOLD) burstParticles(state.txCount);
    updateStats();
    setStatus("en direct");
  }

  function beginFreeze() {
    state.frozen = true;
    state.freezeUntil = Date.now() + FREEZE_MS;
    el("freeze").classList.add("visible");
  }

  function endFreeze() {
    state.frozen = false;
    el("freeze").classList.remove("visible");
  }

  function resetCanvas() {
    state.layers = [];
    state.epochData = [];
    state.priceMin = Infinity;
    state.priceMax = -Infinity;
    state.particles = [];
    state.gen = null;
    state.form = null;
    el("motor").textContent = "·";
    ctx.clearRect(0, 0, W, H);
  }

  function archiveEpoch() {
    if (state.epochData.length === 0) return;
    const record = {
      id: state.epochId,
      endedAt: Date.now(),
      priceStart: state.epochData[0].price,
      priceEnd: state.epochData[state.epochData.length - 1].price,
      slots: state.epochData,
    };
    try {
      const all = JSON.parse(localStorage.getItem(LS_KEY) || "[]");
      all.push(record);
      localStorage.setItem(LS_KEY, JSON.stringify(all.slice(-50)));
    } catch (err) {
      console.warn("archive failed:", err.message);
    }
  }

  // ---------- animation loop ----------
  function frame() {
    ctx.fillStyle = "#0a0a0c";
    ctx.fillRect(0, 0, W, H);

    window.BB.drawLayers(ctx, state.layers);

    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.995;
      p.vy *= 0.995;
      p.life -= p.decay;
      if (p.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.max(0, p.life) * 0.8;
      ctx.fillStyle = "hsl(" + p.hue + ", 70%, 65%)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (state.lastBlockTs) {
      const next = (state.lastBlockTs + SLOT_SECONDS) * 1000;
      const remain = Math.max(0, next - Date.now());
      el("countdown").textContent = Math.ceil(remain / 1000) + " s";
    }

    if (state.frozen && Date.now() >= state.freezeUntil) endFreeze();

    requestAnimationFrame(frame);
  }

  // ---------- polling ----------
  let lastSeenNumber = null;

  async function poll() {
    try {
      const block = await fetchBlock();
      const price = await fetchPrice();
      if (price) state.price = price;
      if (lastSeenNumber !== null && block.number === lastSeenNumber) return;
      lastSeenNumber = block.number;
      onNewBlock(block);
    } catch (err) {
      setStatus("hors ligne, nouvel essai");
      console.error(err);
    }
  }

  // ---------- boot ----------
  (async function boot() {
    try {
      const block = await fetchBlock();
      const price = await fetchPrice();
      if (price) state.price = price;
      onNewBlock(block);
      lastSeenNumber = block.number;
    } catch (err) {
      setStatus("connexion impossible");
      console.error(err);
    }
    setInterval(poll, POLL_MS);
  })();

  frame();
})();
