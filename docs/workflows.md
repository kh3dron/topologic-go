# Workflows

## Verify a change

```bash
npx tsc --noEmit                          # strict typecheck; vite build skips tsc
npx tsx scripts/census.ts                 # engine census + serialize round-trips, no browser
npm run dev -- --port 5199 --strictPort   # then drive with Playwright (below)
```

- `scripts/census.ts` prints MOVE-0 / singular cells / verdict for every (game, topology) — the fastest signal that engine or registry changes are sane
- `scripts/smoke-online.mjs` — end-to-end backend smoke (needs SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY env; creates and cleans up throwaway users)

## Driving the UI (Playwright)

- `npm i --no-save playwright` if missing; run driver scripts from the repo root so `node_modules` resolves
- Viewport 1600x950; watch `pageerror` and console errors on every page
- Landing (`/`):
  - Picker items: `#topo-list button` (accordion; groups start collapsed — click `.topo-group-header` first)
  - Selection updates `#detail-name`, `#detail-surface`, `#detail-spec`, `#game-options`, `#verdict-note`, `#play-btn` href
  - There is NO card grid and NO `#mode-<id>` buttons anywhere (removed in the picker redesign)
- Playground (`/play.html?g=<game>&t=<topo>`):
  - Status: `#status`; info panel: `#mode-description`, `#mode-article`, `#mode-spec`, `#mode-links`
  - Variant is fixed by URL; switching happens back on the landing (`#catalog-link`)
  - Clicking canonical cell (r,c): cells are `.square, .void-cell` (chess/snake) or `.go-intersection, .void-cell` (Go); index i maps to plane cell `(floor(i/cols), i%cols)` with cols = length of `#board`'s computed `grid-template-columns`; find an i where `window.__topo.project(R, C, size)` equals the target and the rect is inside `#board-container`, then `.click()` it
  - Overlay: `#topology-overlay`, `.topo-tile`, `.topo-label` (ORIGINAL / REFLECTED / ROTATED 90|180|270)
  - Zoom: `#zoom-in` / `#zoom-out` / `#zoom-level`; wheel throttled 120ms
- About (`/about.html`): `.catalog-entry` per topology, `#census-table` rows per (game, topology)
- The committed harness notes live in `.claude/skills/verify/SKILL.md`; if it disagrees with the DOM, the DOM wins — update the skill

## Add a topology

- One entry in `TOPOLOGIES` (`src/topology.ts`): `project()` + metadata. Everything else follows automatically (picker entry, preview animation, overlay, census, about page)
- `project` must be constant on group orbits — reduce coordinates in a canonical order (e.g. undo column glide, then fold rows) and spot-check compositions at corners
- `periodX`/`periodY`: wrap period in board-lengths; `null` = wall axis; a glide (wrap+flip) axis has period 2, a reflect (fold) axis period 2, plain wrap 1
- Checklist:
  - `npx tsc --noEmit`
  - `npx tsx scripts/census.ts` — new rows appear, numbers plausible, round-trips pass
  - Update `TOPOLOGIES.md`: Implemented list + census table (paste real numbers from the script) + playability-theory lists
  - Drive the UI: picker entry, tessellated overlay labels correct, one legal move per game
- Design rule: NEVER patch rules or setup per topology; degenerate results are intentional findings
- Naming/metadata conventions: orbifold strings use `inf` and `x` ASCII (`*inf inf`, `22 inf`, `*x`); `formal.orientable` refers to the quotient surface

## Add a game

- Implement a `GameModule<S, M, B>` in `src/engine/games/<id>.ts` (pure, deterministic, RNG injected if needed)
- Register in `GAMES` (`src/engine/index.ts`); pick `boardFamily` (`'square-grid'` gets a Topology; else a custom board) and `soloOnly` if single-player
- Stateful wrapper `src/<id>.ts` following the pattern of `go.ts` (live bindings + `setOnline` gating)
- View adapter `src/views/<id>.ts` implementing `GameView`; register in `VIEWS` (`src/views/index.ts`)
- Add the game id to `GameType` in `src/state.ts`
- Topology metadata: add a `<id>Desc` field only if the game is square-grid (see `snakeDesc`)
- Online play needs nothing extra client-side; the Edge Functions dispatch through the same `GAMES` registry

## Release / deploy

- Conventional commits on `main` -> `.github/workflows/static.yml` runs semantic-release (tag + GitHub Release), builds, deploys to GitHub Pages
- Version badge text comes from `git describe` via `__APP_VERSION__` (vite define)
- Keep asset paths relative (`base: './'`)
