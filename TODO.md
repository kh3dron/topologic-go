# Backlog

## Gameplay / rules

- [ ] Chess: castling, en passant
- [ ] Undo / move history (also a prerequisite for replays and networked games)
- [ ] Persist game state in localStorage (survive refresh)
- [ ] Per-topology komi (torus Go has no corners; territory is much harder to make)
- [ ] More topologies from the ideas list in `TOPOLOGIES.md`
- [ ] Playability theory (research): prove which topologies give non-degenerate games from the standard setup — see "Future work" in `TOPOLOGIES.md`. Rules are never patched per topology; degenerate starts (torus chess = checkmate at move zero) are findings, not bugs

## UX

- [ ] Touch support: drag-to-pan and pinch-zoom only listen to mouse events; tessellated modes are unusable on mobile
- [ ] Keyboard controls / basic a11y
- [ ] Incremental board rendering: full DOM rebuild per move costs ~200-300ms at 50% zoom on period-2 topologies

## Deployment

- [ ] CI on PRs and main: `npx tsc --noEmit`, `npm run build`, headless Playwright smoke test (see `.claude/skills/verify/SKILL.md` for the harness)
- [ ] Keep GitHub Pages for the static frontend; add PR preview deploys
- [ ] Custom domain + HTTPS
- [ ] Basic analytics / error reporting (self-hosted or none; no trackers)

## Backend / game server

Goal: behave like a small game web server - two people play the same board from different browsers.

- [ ] Extract the engine (`topology.ts`, `chess.ts`, `go.ts`, minus DOM) into a shared package that runs in Node; the modules are already DOM-free except `render.ts`
- [ ] Backend service (Node/TS): game rooms, move relay over WebSockets, server-authoritative validation using the same engine code
- [ ] Persistence: games and move lists (SQLite to start; Postgres if it grows)
- [ ] Lobby / matchmaking: create game with chosen game + topology, share invite link, join by URL
- [ ] Spectator mode and replay from move history
- [ ] Sessions: anonymous tokens first; accounts only if needed later
- [ ] Hosting: static frontend stays on Pages; API on Fly.io/Render; CORS + WebSocket origin config
- [ ] Rate limiting and input validation at the API boundary

## Chores

- [ ] package.json cleanup: name is `top_go_2`, `"type": "commonjs"` in an ESM/Vite project

## Done

- [x] Split `main.ts` into modules; topology registry (`project()` per variant, see `TOPOLOGIES.md`)
- [x] Chess check/checkmate/stalemate; Go territory scoring, superko
- [x] Fixed Go mirror rendering, tessellation perf (validity cache, hover map), CSS position bug
- [x] Topologies: torus, mirror, windmill (p4), pillowcase (p2), cylinder, corridor, Mobius, Klein, projective
- [x] Full-page layout; topology overlay + legend; zoom (50%-200%, cursor-anchored) and universal drag-pan
- [x] About page (`about.html`) with per-topology articles + references, generated from the registry
