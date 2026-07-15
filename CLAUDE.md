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

**Current, detailed docs live in `docs/`** (README, architecture, workflows, online) — read those first; the module notes below predate the engine extraction to `src/engine/` and the landing-picker redesign, so where they disagree, `docs/` wins.

Browser game app: chess and Go playable on boards with non-standard topologies (torus, mirror, windmill, Mobius, Klein bottle, projective plane, ...). Vanilla TypeScript, no framework, no dependencies beyond Vite/TS. Styles in `src/style.css`, logic split across modules in `src/`.

Multi-page app (separate Vite rollup inputs, see `vite.config.ts`): `index.html` is the catalog landing (browse variants), `play.html` is the playground (local hotseat, the actual game UI), `game.html` is the online-play placeholder, `about.html` is the spec/census doc. Cards on the landing deep-link into `play.html`/`game.html` with `?g=<game>&t=<topologyId>` params. This structure is the frontend setup for the online backend described in `DEPLOYMENT.md`.

**Design principle — no playability patches:** game rules and starting positions are identical across all topologies. Some combinations are degenerate by construction (torus chess is checkmate at move zero because the glued back ranks put the kings adjacent) and that is intentional — which topologies produce interesting games is the project's research question. Never add per-topology setup shifts or rule exceptions to make a mode "playable"; the engine evaluates the rules faithfully and reports degenerate outcomes honestly. See `TOPOLOGIES.md`.

The core abstraction: every variant is the same game played on a quotient of the infinite plane. A topology is defined by ONE function, `project(row, col, size) -> board cell | null` (null = wall), plus metadata. Everything derives from it — see `TOPOLOGIES.md` for the catalog and future ideas. **Adding a new variant = adding one entry to `TOPOLOGIES` in `src/topology.ts`**; the mode button, adjacency, chess move generation, tessellated rendering, and overlay labels all follow automatically.

- `topology.ts` — the `Topology` interface, the `TOPOLOGIES` registry, and `tileOrientation()` (derives each tile's D4 transform — rotated/reflected — by probing `project`, used by the overlay)
- `state.ts` — shared globals: `currentGame` (`chess` | `go`) and `currentTopology`, read via live ESM bindings, mutated only through setters
- `chess.ts` — chess state and logic. One topology-generic move generator (`getPseudoDestinations`): fixed-offset pieces project `from + offset`; sliders walk step-by-step in the infinite plane projecting each step (step-capped, `SLIDE_CAP`). Legality = pseudo-move AND king not left in check (simulated by temporarily swapping the `chessBoard` global). Checkmate/stalemate detected after each move. Pawns keep color-based direction on every topology and promote on rows 0/7
- `go.ts` — Go state and logic. `getNeighbors()` projects the four plane neighbors; group/liberty/capture/superko/scoring build on it and are fully topology-generic. On orbifold topologies (windmill, projective) a cell can be its own neighbor — the set-based group logic handles this correctly
- `render.ts` — all DOM. Immediate-mode: `renderBoard()` clears `#board` and rebuilds on every state change. One generic tessellated renderer: plane cell (R,C) displays board cell `project(R,C)`; chess square color uses plane parity so the checkerboard is continuous. Tile counts are computed per-render from the container size and the topology's wrap periods (`periodX/Y`, in board-lengths; null = wall axis, clamped pan instead of wrapped). Per-render caches: chess legal dests once per selection, Go validity once per position, position -> elements map for hover sync. The topology overlay (`#topology-overlay`, pointer-events: none) draws seams (dashed = wrap, solid accent = mirror, dotted accent = rotation, thick ink = wall), hatching + labels on transformed tiles, and the legend in the right info panel
- `play.ts` — playground bootstrap (`play.html`): reads the variant from `?g=&t=`, builds mode buttons from the registry, wires events, switches game/topology (writing the URL back via `replaceState`). Exposes `window.__topo.project` / `window.__hex` debug hooks for browser tests
- `landing.ts` — catalog bootstrap (`index.html`): generates one `.variant-card` per (game × topology) pair from `TOPOLOGIES` plus a hex card, with client-side search, filter chips (game/verdict/orientable), and a Playground/Challenge mode toggle that flips each card's target page + restyles the grid
- `game.ts` — online lobby bootstrap (`game.html`): auth panel, start/challenge/join flows, and the `?join=<id>` share-link handoff; `home.ts` (`home.html`) is the account hub (profile, games in progress, challenges, friends). Online internals live in `src/net/` — see `docs/online.md`
- `routes.ts` — URL helpers shared by the pages: `readVariantParams()`, `variantHref(mode, game, topoId)`, `variantSearch()`
- `census.ts` — DOM-free classification of each (game, topology) pair (`variantVerdict`, `chessMoveZero`, `singularCellCount`, `verdict`); shared by `about.ts` (full table) and `landing.ts` (card badges). `chessMoveZero` mutates the topology global, so loop callers restore it with `setTopology('classic')`
- `about.ts` + `about.html` — a spec-style about page whose topology catalog is generated from the registry, so articles/links live only in `topology.ts` (`article` + `links` fields, also shown in the playground's right info panel)

Layout: full-viewport CSS grid — left sidebar (game/mode/controls), center game area (status bar with zoom controls + board container), right info panel (rules, edge spec, legend). Cell sizing: base constants live in `render.ts` (`CHESS_CELL`/`GO_CELL`); the zoomed pixel size is pushed into the CSS custom properties `--chess-cell`/`--go-cell`, which all size-dependent CSS derives from via `calc()` — change sizes in one place each. Zoom (discrete levels 50%-200%, wheel is cursor-anchored) re-renders the board at a new cell size; pan wraps on periodic axes and clamps on wall axes, and `#board` is always absolutely positioned (classic centering comes from the clamp logic, and a zoomed-in classic board becomes draggable).

Known TODOs live in `TODO.md`; topology catalog and variant ideas in `TOPOLOGIES.md`.
