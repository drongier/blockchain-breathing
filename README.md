# Blockchain Breathing

Generative art driven by the live heartbeat of the Ethereum blockchain. One unique
shape per epoch, seeded by the network, drawn stroke by stroke as blocks are
validated. 100% static site, zero dependencies, zero API keys.

## Concept

The artwork is clocked to Ethereum's Proof of Stake schedule:

- **Slot (12 s)**: every new block advances the drawing by a few evolution steps.
- **Epoch (32 slots = 384 s)**: one complete artwork, then the canvas resets.

Two on-chain signals drive the aesthetics: the **ETH price** picks the palette, and
the **transaction count** of the latest block drives the visual agitation.

## Architecture

Three layers, all running in the browser:

```
┌ data ──────────────┐   ┌ engine ─────────────────┐   ┌ render ──────────────┐
│ Ethereum RPC       │ → │ makeEpochGen (seed)     │ → │ canvas 2D            │
│ CoinGecko price    │   │ baseShape + deformations│   │ progressive strokes   │
└────────────────────┘   │ evolveSlot per block    │   │ particles + overlay   │
                         └─────────────────────────┘   └──────────────────────┘
```

The engine (`core.js`) is deterministic and shared between the live canvas
(`app.js`) and the gallery (`gallery.js`): the same input data always produces the
same artwork, which is what makes the gallery's replay possible.

## Data sources

- **Ethereum block**: `eth_getBlockByNumber(["latest", false])` against a public RPC
  (`ethereum.publicnode.com`, fallback `eth.llamarpc.com`). The `false` flag returns
  only transaction hashes: a tiny payload (~20 KB) instead of megabytes of full
  transaction data. The count is identical.
- **ETH price**: CoinGecko's free endpoint (`simple/price`). One request per poll,
  well under the rate limit.

Both endpoints allow cross-origin requests (`Access-Control-Allow-Origin: *`), so
no backend proxy is needed.

## Timing and synchronization

The chain position is derived directly from the block timestamp:

```javascript
const slotIndex = Math.floor(timestamp / 12) % 32;
const epochId   = Math.floor(timestamp / 384);
```

The site polls every 8 seconds (a new block lands every 12). Each new block pushes
one stroke onto the canvas, then the stroke **draws itself progressively** over
`TRACE_MS` (11 s), like a pen following the outline.

## Generation engine

`makeEpochGen(epochId, w, h)` is seeded with the epoch id (via a mulberry32 PRNG),
so every epoch has a stable identity that both the live canvas and the gallery
reproduce. It picks:

- **1 of 10 archetypes** (`orbite`, `respiration`, `etoile filante`, `vortex`,
  `noeud`, `cristal`, `tapis`, `galaxie`, `fleur`, `tempete`), each with its own
  shapes, deformations and energy.
- **A base shape**: circle, star, spiral, lemniscate or regular polygon.
- **2 to 3 deformations** among: `breathe` (radial pulsation), `twist` (torsion),
  `ripple` (traveling wave), `melt` (contraction), `drift` (translation) and
  `flow` (2D noise field).

`evolveSlot` applies `stepsPerSlot` (2 to 4) gentle deformation steps per block and
returns the evolved point set. After each slot the shape is **normalized**
(`normalizePoints`): recentered and shrunk only if it overflows, so it always stays
inside the viewport on any screen size.

## Data to art mapping

| Signal | Mapping |
| --- | --- |
| ETH price | hue, from cool blue (low) to warm amber (high) |
| tx count | agitation `agi = min(1, tx / 250)`: segments, deformation amplitude, stroke width |
| slot index | composition: the shape grows and evolves across the epoch |

The price-to-hue mapping is **progressive**: each slot's hue is computed against the
min/max price seen so far (no padding), so even the small real price moves during an
epoch span the full blue-to-amber range. This is shared by the live canvas and the
gallery, keeping their palettes identical.

## Rendering

- Full-screen `<canvas>` with explicit CSS sizing and `devicePixelRatio` handling
  (`canvas.width = W * dpr` + `canvas.style.width = W + "px"`), so the artwork stays
  centered and crisp on retina displays.
- Each layer is a point path drawn with round caps and joins. With the progressive
  trace option, `drawLayers` draws only the fraction of points corresponding to the
  elapsed time, producing the live pen-drawing effect.
- When a block exceeds ~100 transactions, a burst of particles is emitted around the
  shape and decays over time.

## Gallery

When an epoch ends, its raw slot data (`{ts, price, tx, epochId}` per slot) is
archived to `localStorage` (last 50 epochs). The gallery replays this data through
the same deterministic engine, so no images are stored. Clicking a thumbnail opens a
fullscreen lightbox that re-renders the artwork at a higher resolution with the same
logical geometry.

## File structure

```
index.html        → live fullscreen canvas + stats overlay
gallery.html      → archived epochs, replayed locally
assets/core.js    → deterministic generation engine (shared)
assets/app.js     → live canvas: polling, evolution, progressive tracing
assets/gallery.js → gallery rendering + lightbox
assets/style.css  → styles
```

## Deployment

Static site. The GitHub Actions workflow (`.github/workflows/pages.yml`) deploys
`main` to GitHub Pages automatically on every push.

## Credits

The general concept (generative shapes evolving over iterations) is inspired by
[UJI](https://github.com/doersino/uji) by [doersino](https://noahdoersing.com/)
(Noah Doersing). The engine here is an original implementation with its own shapes
and deformations.
