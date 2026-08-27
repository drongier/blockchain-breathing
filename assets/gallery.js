/* gallery.js: replays archived epochs from localStorage.
   The art is deterministic, so raw slot data redraws the exact same artwork.
   Click a card to open it fullscreen in a crisp lightbox. */
(function () {
  "use strict";

  const { generateEpochArt, drawLayers } = window.BB;
  const LS_KEY = "bb.epochs";
  const W = 560; // logical size shared by thumbnails and lightbox
  const H = 350;

  const grid = document.getElementById("gallery");
  const countEl = document.getElementById("galleryCount");
  const lightbox = document.getElementById("lightbox");
  const lightboxCanvas = document.getElementById("lightboxCanvas");

  function load() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
    } catch (err) {
      console.warn("gallery load failed:", err.message);
      return [];
    }
  }

  function fmtDate(ts) {
    return new Date(ts).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function drawArt(canvas, record, scale) {
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = "#0a0a0c";
    ctx.fillRect(0, 0, W, H);
    drawLayers(ctx, generateEpochArt(record.slots, W, H));
  }

  function renderCard(record, index) {
    const card = document.createElement("article");
    card.className = "epoch-card";
    card.title = "Cliquer pour agrandir";
    card.dataset.index = index;

    const canvas = document.createElement("canvas");
    drawArt(canvas, record, 1);
    card.appendChild(canvas);

    const meta = document.createElement("div");
    meta.className = "epoch-meta";
    const pStart = record.priceStart ? "$" + record.priceStart.toFixed(0) : "·";
    const pEnd = record.priceEnd ? "$" + record.priceEnd.toFixed(0) : "·";
    meta.innerHTML =
      "<span>epoch #" + record.id + "</span>" +
      "<span>" + fmtDate(record.endedAt) + "</span>" +
      "<span>" + pStart + " → " + pEnd + "</span>";
    card.appendChild(meta);

    card.addEventListener("click", () => openLightbox(record));
    grid.appendChild(card);
  }

  // ---------- lightbox ----------
  function openLightbox(record) {
    const maxScale = Math.max(
      1,
      Math.min(3, Math.floor(Math.min(window.innerWidth / W, window.innerHeight / H)))
    );
    drawArt(lightboxCanvas, record, maxScale);
    lightbox.classList.add("visible");
  }

  function closeLightbox() {
    lightbox.classList.remove("visible");
  }

  lightbox.addEventListener("click", closeLightbox);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeLightbox();
  });

  // ---------- render ----------
  const records = load();
  if (records.length === 0) {
    grid.innerHTML =
      '<div class="empty-state">Aucune epoch archivée pour le moment. ' +
      "Laisse la toile vivre quelques minutes, puis reviens ici.</div>";
    countEl.textContent = "";
  } else {
    countEl.textContent = records.length + " toiles archivées";
    for (let i = records.length - 1; i >= 0; i--) renderCard(records[i], i);
  }
})();
