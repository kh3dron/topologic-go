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

Browser game app: chess and Go playable on boards with non-standard topologies. Vanilla TypeScript, no framework, no dependencies beyond Vite/TS. Markup in `index.html`, styles in `src/style.css`, logic split across modules in `src/`:

- `state.ts` — shared globals: `currentGame` (`chess` | `go`) and `gameMode` (`classic` | `rollover` | `mirror`), read via live ESM bindings, mutated only through their setters
- `topology.ts` — `wrap()` (modular wrap for torus) and `wrapMirror()` (horizontal wrap + vertical reflection, returns a `flipped` flag). These two functions define the board topologies and are used by both games
  - `classic` — normal edges
  - `rollover` — torus: all edges wrap
  - `mirror` — columns wrap, rows reflect at top/bottom edges
- `chess.ts` — chess state and logic. Per-mode pseudo-move validation (`isValidMoveClassic` / `isValidMoveRollover` / `isValidMoveMirror`), each with its own path-clearing walker (wrapped walkers are step-capped instead of bounds-checked). Legality = pseudo-valid AND king not left in check (simulated by temporarily swapping the `chessBoard` global). Checkmate/stalemate detected after each move
- `go.ts` — Go state and logic. Topology-independent: `getNeighbors()` is the single point where `gameMode` changes adjacency; group/liberty/capture logic builds on it. Positional superko enforced via a set of seen board states. `scoreGo()` does Japanese-style scoring (territory + captures + komi 6.5), also topology-aware through `getNeighbors()`
- `render.ts` — all DOM. Immediate-mode: `renderBoard()` clears `#board` and rebuilds everything on every state change. Per-render caches keep tessellation cheap: chess legal destinations computed once per selection, Go move validity computed once per position (not per tile), and a position -> elements map for hover sync. In rollover/mirror modes the board renders as a 5×5 tessellation (`CHESS_TILE_COUNT` / `GO_TILE_COUNT`, mirror reflects alternate tile rows) that the user can drag-pan; `updateBoardPosition()` wraps `panOffsetX/Y` modulo the board pixel size (double period vertically in mirror mode) to fake an infinite board. Board pixel sizes (`CHESS_BOARD_SIZE`, `GO_BOARD_SIZE`) are hardcoded to match square sizes in `style.css` — keep them in sync. A toggleable topology overlay (`#topology-overlay`, pointer-events: none, appended after the cells each render) draws tile seams, reflection hatching/labels, and a sidebar legend in tessellated modes
- `main.ts` — thin bootstrap: event wiring and game/mode switching only

When adding a new game mode or game, the touch points are: the `GameMode`/`GameType` unions in `state.ts`, move validation / `getNeighbors()`, the render branch in `renderBoard()`, mode buttons in `index.html`, and `updateModeDescription()`.

CSS cascade gotcha: `#board.tessellated`, `#board.go-board`, and `#board.go-board.tessellated` all fight over `position`/grid properties at similar specificity — tessellated boards must end up `position: absolute` or the pan system breaks (the view mis-centers and the tessellation edge becomes visible).

Known TODOs live in `TODO.md`.
