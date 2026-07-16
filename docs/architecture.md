# Architecture

Layered: pure engine at the bottom, DOM at the top. Dependencies point down only.

```
pages:      landing.ts   play.ts   game.ts   about.ts        (one per HTML entry)
shell:      render.ts   preview.ts   routes.ts   version.ts
views:      views/kit.ts  views/{chess,go,hexchess,hyperchess,snake}.ts  (VIEWS registry)
wrappers:   chess.ts  go.ts  hexchess.ts  hyperchess.ts  snake.ts  state.ts  (module-global live state)
net:        net/{client,auth,games,online}.ts                 (optional Supabase)
engine:     engine/core.ts  engine/index.ts  engine/games/*   (pure, DOM-free)
math:       topology.ts  census.ts                            (pure, DOM-free)
```

## The two registries

Everything derives from two Maps; adding entries is the main extension mechanism.

- `TOPOLOGIES` in `src/topology.ts`
  - One entry per topology: `project()` + metadata (descs per game, article, links, formal group/orbifold/surface/orientable, spec lines, periodX/periodY)
  - Everything downstream is derived by probing `project()`: adjacency, chess sliders, tessellated rendering, tile orientation labels (`tileOrientation`), seam arrows/colors (`seamColoring`), landing particle preview, census
  - 13 entries: classic, torus, mirror, windmill, pillowcase, pivot, cylinder, corridor, mirrorbox, mobius, klein, mobiusmirror, projective
- `GAMES` in `src/engine/index.ts`
  - One `GameModule<S, M, B>` per game: `initialState / isLegalMove / applyMove / serialize / deserialize`
  - `boardFamily` picks the board type: `'square-grid'` games receive a `Topology`; `'hex-glinski'` and `'hyperbolic-46'` take none
  - `usesTopology(gameId)` gates the topology picker and the `t=` URL param
  - `soloOnly` (snake) keeps a game off the online lobby
  - `catalog` (optional) describes the landing-picker board card for non-topology games (group, board name shown in the picker list, surface, spec chips, preview badge)

## Layer responsibilities

- `src/topology.ts`
  - `Topology` interface + registry; `mod()` helper
  - `tileOrientation()` — D4 transform of each tile, derived by probing project; drives overlay labels
  - `seamColoring()` / `seamColor()` — gluing arrows shared by board overlay and catalog preview
- `src/engine/core.ts` — `GameModule`, `GameResult`, `Color`; no DOM, no globals
- `src/engine/games/*.ts` — all rules, pure and deterministic
  - chess: one topology-generic move generator; sliders walk the plane step-by-step projecting each step (`SLIDE_CAP`); promotion rows 0/7; no castling/en passant
  - go: `getNeighbors()` projects the four plane neighbors; groups/liberties/capture/superko/scoring build on it; set-based so self-adjacent cells (orbifolds) work
  - hexchess: Glinski geometry, own coordinate system, no topology
  - hyperchess: chess on a 1352-cell patch of the {4,6} hyperbolic tiling (after Hawksley's "Non-Euclidean Chess, Part 2"); cells are Mobius transforms generated at module load, moves walk precomputed adjacency/diagonal/knight tables; pawns carry a parallel-transported heading
  - snake: deterministic; RNG injected by the wrapper
- `src/census.ts` — DOM-free, stateless classification of (game, topology): `variantVerdict`, `chessMoveZero`, `singularCellCount`, `verdict`. Shared by about page, landing badges, and `scripts/census.ts`
- Stateful wrappers (`src/chess.ts`, `go.ts`, `hexchess.ts`, `snake.ts`)
  - Hold the single live game state as module globals with live ESM bindings read by views/render
  - Expose click/keyboard handlers; own selection state
  - Online gating: `setOnline({engaged, lockColor, onCommit})` — apply only own-color moves, report committed moves
- `src/state.ts` — `currentGame` + `currentTopology` globals, mutated only via setters
- `src/views/` — per-game view adapters (`GameView` in `kit.ts`), registry in `index.ts`
  - Encapsulate game-specific DOM: cell creation, status text, info panel copy, sizing
  - `family: 'square-grid'` renders through the shared tessellated grid; `'custom'` renders itself via `renderCustom` (hex: SVG; hyperbolic: canvas Poincare disk with hyperbolic drag-to-pan)
  - Direction: render.ts -> views -> wrappers; views never import render.ts
- `src/render.ts` — the shell; all shared DOM
  - Immediate mode: `renderBoard()` clears `#board` and rebuilds on every state change
  - Tessellation: plane cell (R,C) displays board cell `project(R,C)`; tile counts from container size + periods; chess square color from plane parity
  - Zoom (discrete levels 50-200%, CSS vars `--chess-cell`/`--go-cell`), pan (wrap on periodic axes, clamp on wall axes), topology overlay (`#topology-overlay`: seams, hatching, labels, legend)
- `src/preview.ts` — canvas particle-flow preview in the landing picker; particles fly through gluings via a continuous extension of `project()`; new topologies animate for free
- `src/routes.ts` — `readVariantParams()`, `variantHref()`, `variantSearch()`; derives from GAMES
- `src/net/` — see `online.md`
- Pages
  - `landing.ts` — picker: `#topo-list` accordion grouped by tessellation dimension, preview canvas, game options, verdict badge, `#play-btn`; playground/challenge `#mode-toggle`
  - `play.ts` — boots offline (hotseat, from `?g=&t=`) or online (`?online=<id>`, lazy-imports net/online so Supabase stays out of the offline bundle); exposes `window.__topo.project` and `window.__hex` debug hooks
  - `game.ts` — lobby: magic-link auth, create/join/list open games, redirect to `play.html?online=<id>`
  - `about.ts` — renders catalog entries + census table from the registries

## Invariants

- No playability patches: identical rules and setup on every topology (see `TOPOLOGIES.md`); the engine reports degenerate outcomes honestly
- Engine stays pure: no DOM, no `Math.random` (injected), serializers round-trip (checked by `scripts/census.ts`)
- New topology or game must require no edits outside its registry entry (+ view adapter for a game)
- `vite.config.ts`: `base: './'` (Pages subpath), four rollup inputs, `__APP_VERSION__` from `git describe`
