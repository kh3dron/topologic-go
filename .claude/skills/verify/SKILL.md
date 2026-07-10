---
name: verify
description: Build, launch, and drive this app in a headless browser to verify changes
---

# Verify topologic-go

Vite + vanilla TS browser game (chess/Go on torus/mirror topologies). No tests; verify by driving the UI.

## Launch

```bash
npm install                      # first time only
npm run dev -- --port 5199 --strictPort   # background
npx playwright install chromium  # first time only
npm i --no-save playwright       # module for driver scripts
```

## Drive

Playwright headless against `http://localhost:5199/`. Use viewport width >= 1440 — the layout is ~1270px wide and narrower viewports let scroll-into-view push the sidebar off-screen.

- Status line: `#status`. Buttons: `#game-chess`, `#game-go`, `#mode-classic`, `#mode-rollover`, `#mode-mirror`, `#pass-btn`, `#reset`.
- Chess classic squares are row-major: `#board .square` nth = `row*8+col`.
- Go classic intersections: `#board .go-intersection` nth = `row*19+col`.
- Tessellated Go DOM index: `((tileRow*19 + rowLoopIdx)*5 + tileCol)*19 + col`. In mirror mode odd tileRows are reflected: `displayRow = 18 - rowLoopIdx`. Click instances near the center/visible tiles (rollover shows tiles ~1-2, mirror ~2) — off-viewport instances fail Playwright actionability.
- Stones: `.has-stone`, ghost previews `.valid-move`, hover sync `.hover-synced`, chess highlights `.moveable`/`.capturable`/`.selected`.

## Flows worth driving

- Fool's mate (f3, e5, g4, Qh4) → `Checkmate - Black wins!`
- Check indicator: e4, e6, d4, Bb4+ → `White's turn - check!`; pieces that can't block have zero `.moveable` dests.
- Go corner capture: B(0,1), W(0,0), B(1,0) → capture count in status; replay at (0,0) is suicide, rejected.
- Two passes → territory score in status.
- Ko: B(0,1) W(0,2) B(1,0) W(1,1) B(2,1) W(2,2) B(5,5) W(1,3), then B(1,2) captures; immediate W(1,1) recapture must be rejected (superko), legal after an exchange elsewhere.
- Topology overlay: in torus/mirror modes `#topology-overlay` renders 25 `.topo-tile` divs (10 `.reflected` in mirror), `#seam-legend` shows 3 rows (mirror) / 1 row (rollover); `#show-boundaries` checkbox toggles it; stones must still place through the overlay.
