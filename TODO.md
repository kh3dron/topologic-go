# TODO

## Bugs

- [x] Go mirror mode rendered as plain torus tiling while `getNeighbors()` reflects vertically — added `renderMirrorTessellatedGoBoard` (reflects alternate tile rows like chess)
- [x] Tessellated Go recomputed `isValidGoMove` per intersection per tile (~9,000 full-board simulations per render) — validity now computed once per position (361 calls) and reused across tiles
- [x] `syncGoHoverState` scanned all ~9,000 intersections per mouseenter — replaced with a position -> elements map built at render time
- [x] Tessellated Go board lost `position: absolute` (`#board.go-board` set `position: relative` later in the cascade), mis-centering the view and exposing the tessellation edge — fixed in `style.css`
- [ ] Layout overflows viewports narrower than ~1280px (`#board-container` is hardcoded 1200px); sidebar gets pushed off-screen
- [ ] Chess rollover: pawns still promote at rows 0/7, which are arbitrary on a torus. Decide intended behavior

## Missing rules

- [x] Chess check/checkmate/stalemate — moves leaving own king in check are illegal, status shows check, game ends by checkmate or stalemate (was: king capture)
- [x] Go territory scoring — Japanese-style (territory + captures, komi 6.5) shown on game end
- [x] Go positional superko enforced (was: simple ko only)
- [ ] Chess: castling, en passant

## Features

- [x] Topology overlay: toggleable "Boundaries" mode in torus/mirror views — tile seams (solid accent = mirror edge, dashed = wrap edge), hatching + `REFLECTED` labels + flipped orientation glyph on reflected tiles, legend in sidebar
- [ ] Touch support: drag-to-pan only listens to mouse events, so tessellated modes are unusable on mobile
- [ ] Undo / move history
- [ ] Persist game state in localStorage (survive refresh)
- [ ] Keyboard controls / basic a11y

## Chores

- [x] Split `main.ts` into modules: `state`, `topology`, `chess`, `go`, `render`, thin `main`
- [ ] Run `npx tsc --noEmit` in CI before build (vite build doesn't typecheck)
- [ ] package.json cleanup: name is `top_go_2`, `"type": "commonjs"` in an ESM/Vite project
