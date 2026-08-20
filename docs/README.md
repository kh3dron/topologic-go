# docs/

Orientation for humans and agents. Read this first, then the file that matches your task.

## What this project is

- Browser games (chess, Go, hex chess, snake) played on non-standard board topologies (torus, Mobius, Klein bottle, ...)
- Vanilla TypeScript + Vite, no framework; optional Supabase backend for online play (self-hosted in Docker since 2026-07-28, see `../selfhost/README.md`)
- Core idea: every square-grid variant is the same game on a quotient of the infinite plane, defined by one function `project(row, col, size) -> cell | null`
- Research stance: rules are NEVER patched per topology; degenerate games (torus chess = mate at move 0) are findings, not bugs

## Doc map

- `architecture.md` — module layers, registries, data flow, dependency rules
- `workflows.md` — commands, verification recipes, how to add a topology or a game
- `online.md` — online play: net layer, Supabase backend, smoke test
- `playability.md` — the move-zero characterization theorem (proved + machine-checked by `scripts/playability.ts`), formalism dependence, open Go questions
- `../TOPOLOGIES.md` — topology catalog, census table, math background, ideas
- `../DEPLOYMENT.md` — online-play design doc (hosting, server-authoritative validation)
- Backlog / to-dos: **DOCKET** (project `topologic-go`, web UI `http://lawrence:8080`) — not tracked in-repo
- `../supabase/README.md` — backend schema + functions layout
- `../selfhost/README.md` — the self-hosted Supabase stack that serves production (Docker on `lawrence`)

## Quick commands

```bash
npm run dev                 # Vite dev server
npm run build               # production build to dist/
npx tsc --noEmit            # typecheck (vite build does NOT run tsc; strict mode on)
npx tsx scripts/census.ts   # headless engine census + serializer round-trip (tsx not committed)
```

- No test framework, no linter. Verification = typecheck + census script + driving the UI with Playwright (see `workflows.md`)
- CI (`.github/workflows/ci.yml`) runs on PRs and pushes to `main`: `tsc --noEmit`, census script, `vite build`, then `scripts/smoke-ui.mjs` (headless-Chromium smoke over `dist/`)
- Pushes to `main` cut a semantic release (conventional commits) and deploy to GitHub Pages by pushing `dist/` to the `gh-pages` branch (`.github/workflows/static.yml`; custom domain `games.kh3dron.net`)
- PRs from this repo deploy live previews to `https://games.kh3dron.net/pr-preview/pr-<n>/` (`.github/workflows/pr-preview.yml`; commented on the PR, removed on close)

## Pages

- `index.html` — catalog landing: Mario-Kart-style picker (`src/landing.ts`)
- `play.html` — the game UI: local hotseat, or online board via `?online=<gameId>` (`src/play.ts`)
- `game.html` — online lobby: sign-in, create/join/directed challenge (`src/game.ts`)
- `home.html` — account hub: profile, games, challenges, friends (`src/home.ts`)
- `players.html` — all players with stats + challenge links (`src/players.ts`)
- `watch.html` — spectate live games (`src/watch.ts`)
- `leaderboard.html` — snake best scores, one table per topology (`src/leaderboard.ts`)
- `about.html` — spec page + live census table (`src/about.ts`)
- Deep links: `?g=<gameId>&t=<topologyId>` (t only for square-grid games)

## Known drift

- `CLAUDE.md`'s architecture section predates the engine extraction: game rules now live in `src/engine/games/`, not in `src/chess.ts`/`src/go.ts` (those are stateful wrappers); the landing is a picker, not a card grid; `census.ts` is stateless now
- `.claude/skills/verify/SKILL.md` may lag UI changes; the selectors in `workflows.md` here are the ones verified most recently
- When these disagree, trust the code, then docs/, then CLAUDE.md

