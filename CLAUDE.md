# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Vite dev server
- `npm run build` — production build to `dist/`
- `npm run preview` — serve the production build
- `npx tsc --noEmit` — typecheck (`vite build` does not run tsc; strict mode is on)
- No tests or linter configured

## Deployment

- Pushes to `main` auto-deploy to GitHub Pages via `.github/workflows/static.yml` (builds `dist/`, uploads as Pages artifact)
- `vite.config.ts` sets `base: './'` so assets resolve under the Pages subpath — keep relative paths

## Architecture

Browser game app: chess and Go playable on boards with non-standard topologies (torus, mirror, windmill, Mobius, Klein bottle, projective plane, ...). Vanilla TypeScript, no framework, no dependencies beyond Vite/TS. Markup in `index.html`, styles in `src/style.css`, logic split across modules in `src/`.

**Design principle — no playability patches:** game rules and starting positions are identical across all topologies. Some combinations are degenerate by construction (torus chess is checkmate at move zero because the glued back ranks put the kings adjacent) and that is intentional — which topologies produce interesting games is the project's research question. Never add per-topology setup shifts or rule exceptions to make a mode "playable"; the engine evaluates the rules faithfully and reports degenerate outcomes honestly. See `TOPOLOGIES.md`.

The core abstraction: every variant is the same game played on a quotient of the infinite plane. A topology is defined by ONE function, `project(row, col, size) -> board cell | null` (null = wall), plus metadata. Everything derives from it — see `TOPOLOGIES.md` for the catalog and future ideas. **Adding a new variant = adding one entry to `TOPOLOGIES` in `src/topology.ts`**; the mode button, adjacency, chess move generation, tessellated rendering, and overlay labels all follow automatically.

- `topology.ts` — the `Topology` interface, the `TOPOLOGIES` registry, and `tileOrientation()` (derives each tile's D4 transform — rotated/reflected — by probing `project`, used by the overlay)
- `state.ts` — shared globals: `currentGame` (`chess` | `go`) and `currentTopology`, read via live ESM bindings, mutated only through setters
- `chess.ts` — chess state and logic. One topology-generic move generator (`getPseudoDestinations`): fixed-offset pieces project `from + offset`; sliders walk step-by-step in the infinite plane projecting each step (step-capped, `SLIDE_CAP`). Legality = pseudo-move AND king not left in check (simulated by temporarily swapping the `chessBoard` global). Checkmate/stalemate detected after each move. Pawns keep color-based direction on every topology and promote on rows 0/7
- `go.ts` — Go state and logic. `getNeighbors()` projects the four plane neighbors; group/liberty/capture/superko/scoring build on it and are fully topology-generic. On orbifold topologies (windmill, projective) a cell can be its own neighbor — the set-based group logic handles this correctly
- `render.ts` — all DOM. Immediate-mode: `renderBoard()` clears `#board` and rebuilds on every state change. One generic tessellated renderer: plane cell (R,C) displays board cell `project(R,C)`; chess square color uses plane parity so the checkerboard is continuous. Tile counts are computed per-render from the container size and the topology's wrap periods (`periodX/Y`, in board-lengths; null = wall axis, clamped pan instead of wrapped). Per-render caches: chess legal dests once per selection, Go validity once per position, position -> elements map for hover sync. The topology overlay (`#topology-overlay`, pointer-events: none) draws seams (dashed = wrap, solid accent = mirror, dotted accent = rotation, thick ink = wall), hatching + labels on transformed tiles, and the legend in the right info panel
- `main.ts` — thin bootstrap: builds mode buttons from the registry, event wiring, game switching. Exposes `window.__topo.project` as a debug hook for browser tests
- `about.ts` + `about.html` — second Vite entry (see `vite.config.ts` rollup inputs): a spec-style about page whose topology catalog is generated from the registry, so articles/links live only in `topology.ts` (`article` + `links` fields, also shown in the game's right info panel)

Layout: full-viewport CSS grid — left sidebar (game/mode/controls), center game area (status bar with zoom controls + board container), right info panel (rules, edge spec, legend). Cell sizing: base constants live in `render.ts` (`CHESS_CELL`/`GO_CELL`); the zoomed pixel size is pushed into the CSS custom properties `--chess-cell`/`--go-cell`, which all size-dependent CSS derives from via `calc()` — change sizes in one place each. Zoom (discrete levels 50%-200%, wheel is cursor-anchored) re-renders the board at a new cell size; pan wraps on periodic axes and clamps on wall axes, and `#board` is always absolutely positioned (classic centering comes from the clamp logic, and a zoomed-in classic board becomes draggable).

Known TODOs live in `TODO.md`; topology catalog and variant ideas in `TOPOLOGIES.md`.
