---
name: verify
description: Build, launch, and drive this app in a headless browser to verify changes
---

# Verify topologic-go

Vite + vanilla TS browser game (chess/Go on plane-quotient topologies). No tests; verify by driving the UI.

## Launch

```bash
npm install                      # first time only
npm run dev -- --port 5199 --strictPort   # background
npx playwright install chromium  # first time only
npm i --no-save playwright       # module for driver scripts
```

## Drive

Playwright headless against `http://localhost:5199/`. Layout is a full-viewport grid (left sidebar / board / right info panel); viewport 1600x950 works well.

- Status line: `#status`. Buttons: `#game-chess`, `#game-go`, `#mode-<topologyId>` (ids from `TOPOLOGIES` in `src/topology.ts`: classic, torus, mirror, windmill, pillowcase, cylinder, corridor, mobius, klein, projective), `#pass-btn`, `#reset`.
- About page at `/about.html` (second Vite entry): `.catalog-entry` per topology, generated from the registry by `src/about.ts`. Info panel per-mode content: `#mode-description`, `#mode-article`, `#mode-links a`, `#mode-spec`.
- The app exposes `window.__topo.project(r, c, size)` for tests. To click canonical cell (r,c) in any mode: iterate plane cells of the rendered grid (`grid-template-columns` length = columns), find one where `project(R, C, size)` equals the target and its bounding rect is fully inside `#board-container`, then `el.click()` via evaluate. Cell selector: `.go-intersection, .void-cell` or `.square, .void-cell` (index = R * cols + C; the overlay is appended after cells so plain children indexing breaks).
- Stones: `.has-stone`, ghost previews `.valid-move`, hover sync `.hover-synced`, chess highlights `.moveable`/`.capturable`/`.selected`.
- Overlay: `#topology-overlay`, `.topo-tile` (classes `reflected`, `seam-*`, `wall-*`), `.topo-label` text is ORIGINAL / REFLECTED / ROTATED 90|180|270. Legend rows: `#seam-legend .legend-row`.
- Zoom: `#zoom-in` / `#zoom-out` buttons, `#zoom-level` shows % and resets on click. Discrete levels 50/67/80/100/120/150/200; wheel over `#board-container` zooms (throttled 120ms — wait ~160ms between synthetic wheel events). Cell sizes come from CSS vars `--chess-cell`/`--go-cell`. `#board-container.pannable` marks drag-enabled state (all tessellated modes; classic only when the zoomed board exceeds the container).

## Flows worth driving

- Fool's mate (f3, e5, g4, Qh4) → `Checkmate - Black wins`
- Check indicator: e4, e6, d4, Bb4+ → `White's turn - check`; pieces that can't block have zero `.moveable` dests.
- Go corner capture (classic): B(0,1), W(0,0), B(1,0) → capture count in status; replay at (0,0) is suicide, rejected.
- Torus cross-edge capture: B(0,1), W(0,0), B(1,0), W elsewhere, B(18,0), W elsewhere, B(0,18) → captures W(0,0).
- Windmill orbifold: corner (18,18) is self-adjacent, only 2 distinct liberties — B(18,18), W(17,18), B elsewhere, W(18,17) captures it.
- Two passes → territory score in status.
- Ko: B(0,1) W(0,2) B(1,0) W(1,1) B(2,1) W(2,2) B(5,5) W(1,3), then B(1,2) captures; immediate W(1,1) recapture must be rejected (superko), legal after an exchange elsewhere.
- Per-topology smoke: switch each mode, place a stone, status flips, no pageerror events.
- Chess uses the IDENTICAL standard setup on every topology — by design, never "fixed" per topology. Consequence: torus, Klein, pillowcase, and projective chess are decided at move zero (glued back ranks; status shows `Checkmate - Black wins` immediately). This is intentional (see TOPOLOGIES.md design principle) — do not report it as a bug, and do not expect moves to be playable there.
- Drag-release must never place a piece/stone: press, move >5px, release over a valid cell → no move. Sub-threshold jitter still counts as a click.
