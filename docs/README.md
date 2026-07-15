# docs/

Orientation for humans and agents. Read this first, then the file that matches your task.

## What this project is

- Browser games (chess, Go, hex chess, snake) played on non-standard board topologies (torus, Mobius, Klein bottle, ...)
- Vanilla TypeScript + Vite, no framework; optional Supabase backend for online play
- Core idea: every square-grid variant is the same game on a quotient of the infinite plane, defined by one function `project(row, col, size) -> cell | null`
- Research stance: rules are NEVER patched per topology; degenerate games (torus chess = mate at move 0) are findings, not bugs

## Doc map

- `architecture.md` — module layers, registries, data flow, dependency rules
- `workflows.md` — commands, verification recipes, how to add a topology or a game
- `online.md` — online play: net layer, Supabase backend, smoke test
- `../TOPOLOGIES.md` — topology catalog, census table, math background, ideas
- `../DEPLOYMENT.md` — online-play design doc (hosting, server-authoritative validation)
- `../TODO.md` — backlog
- `../supabase/README.md` — backend provisioning

## Quick commands

```bash
npm run dev                 # Vite dev server
npm run build               # production build to dist/
npx tsc --noEmit            # typecheck (vite build does NOT run tsc; strict mode on)
npx tsx scripts/census.ts   # headless engine census + serializer round-trip (tsx not committed)
```

- No test framework, no linter. Verification = typecheck + census script + driving the UI with Playwright (see `workflows.md`)
- Pushes to `main` cut a semantic release (conventional commits) and deploy to GitHub Pages (`.github/workflows/static.yml`)

## Pages

- `index.html` — catalog landing: Mario-Kart-style picker (`src/landing.ts`)
- `play.html` — the game UI: local hotseat, or online board via `?online=<gameId>` (`src/play.ts`)
- `game.html` — online lobby: sign-in, create/join (`src/game.ts`)
- `about.html` — spec page + live census table (`src/about.ts`)
- Deep links: `?g=<gameId>&t=<topologyId>` (t only for square-grid games)

## Known drift

- `CLAUDE.md`'s architecture section predates the engine extraction: game rules now live in `src/engine/games/`, not in `src/chess.ts`/`src/go.ts` (those are stateful wrappers); the landing is a picker, not a card grid; `census.ts` is stateless now
- `.claude/skills/verify/SKILL.md` may lag UI changes; the selectors in `workflows.md` here are the ones verified most recently
- When these disagree, trust the code, then docs/, then CLAUDE.md
