/* gallery.js: replays archived epochs from localStorage.
   The art is deterministic, so raw slot data redraws the exact same artwork. */
(function () {
  "use strict";

  const { generateEpochArt, drawLayers } = window.BB;
  const LS_KEY = "bb.epochs";
  const W = 560;
  const H = 350;

  const grid = document.getElementById("gallery");
  const countEl = document.getElementById("galleryCount");

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

  function renderCard(record) {
    const card = document.createElement("article");
    card.className = "epoch-card";

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0a0a0c";
    ctx.fillRect(0, 0, W, H);
    drawLayers(ctx, generateEpochArt(record.slots, W, H));

    const meta = document.createElement("div");
    meta.className = "epoch-meta";
    const pStart = record.priceStart ? "$" + record.priceStart.toFixed(0) : "·";
    const pEnd = record.priceEnd ? "$" + record.priceEnd.toFixed(0) : "·";
    meta.innerHTML =
      "<span>epoch #" + record.id + "</span>" +
      "<span>" + fmtDate(record.endedAt) + "</span>" +
      "<span>" + pStart + " → " + pEnd + "</span>";

    card.appendChild(canvas);
    card.appendChild(meta);
    grid.appendChild(card);
  }

  const records = load();
  if (records.length === 0) {
    grid.innerHTML =
      '<div class="empty-state">Aucune epoch archivée pour le moment. ' +
      "Laisse la toile vivre quelques minutes, puis reviens ici.</div>";
    countEl.textContent = "";
  } else {
    countEl.textContent = records.length + " toiles archivées";
    for (const r of records.slice().reverse()) renderCard(r);
  }
})();
