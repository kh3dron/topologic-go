# Topologies

Every variant is the same game played on a quotient of the infinite plane: a single function `project(row, col) -> board cell | null` maps any plane coordinate onto the canonical board (`null` = wall). Adding a variant = one entry in `TOPOLOGIES` in `src/topology.ts` (a `project` function plus metadata). Adjacency, chess move generation, tessellated rendering, overlay labels, and the mode button all derive from it.

## Implemented

- Classic — walls on all edges
- Torus — both edge pairs wrap (`mod` both coordinates)
- Mirror — columns wrap, rows reflect at top/bottom (fold `row mod 2n`)
- Windmill — copies rotate 90 degrees around shared corners (wallpaper group p4, orbifold 442; quotient S²(4,4,2)). Orbifold quirk: cells at the rotation corners are adjacent to themselves, so corner points have only 2 distinct liberties in Go
- Pillowcase — side-by-side copies rotate 180 degrees, rows wrap (wallpaper group p2, orbifold 2222; quotient is the pillowcase S²(2,2,2,2)). Cone-point cells on the middle row of the side edges are self-adjacent
- Cylinder — columns wrap, rows are walls
- Corridor — rows reflect at top/bottom (two facing mirrors), columns are walls
- Mobius — columns wrap with a vertical flip, rows are walls
- Klein — columns glue with a vertical flip, rows wrap (Klein bottle)
- Projective — both edge pairs glue with a flip (projective plane; has 2-fold cone points at two corners)

## Ideas / not yet implemented

- Glide torus — rows wrap normally; crossing top/bottom shifts columns by k (screw dislocation). `project: [mod(r,n), mod(c + k*floor(r/n), n)]`. Caveat: the tessellated view needs an axis-aligned period of `n/gcd(k,n)` boards — fine for chess (n=8, k=4 gives period 2) but unusable for Go (n=19 is prime, so any shift gives period 19). Needs either a chess-only mode concept or a smarter renderer
- Face windmill — p4 with rotation centers at cell centers instead of corners; the cone-point weirdness moves to mid-board
- Double-wide fundamental domain — two boards side by side glued into any of the above; games with 2x material
- Alice variants — two stacked boards; a piece/stone teleports to the other layer after each move (not a plane quotient; needs a layer dimension, but project() generalizes to (layer, r, c))
- Hex Go on a torus — hexagonal adjacency with wrap; needs a hex grid renderer, logic already adjacency-agnostic
- Hex chess on glued edges (hex torus / Klein / projective) — cross the topology idea with the Gliński `hexchess` geometry (see `src/hexchess.ts`). Caveat: the hexagon-shaped board does not tile by translation, so the fundamental domain is likely a rhombus of hexes rather than the playing board itself; the gluings and a hex-quotient renderer are the real work. Engine adjacency is already coordinate-based. Planned, deferred
- Small boards — 9x9 / 13x13 Go, 5x5 mini chess; topology math is size-generic already
- Asymmetric komi / handicap presets per topology (torus Go has no corners, so territory is much harder to make — komi should probably differ)

## Census

One row per (game, topology). The authoritative version is on the site's about page, where MOVE-0 and SING. CELLS are computed live by the engine (`src/about.ts`); this is a snapshot. VERDICT is derived, never assigned: DEAD = decided at move zero; QUIRKS = singular (self-adjacent) cells exist or the surface is non-orientable; OK = neither.

Terminology: a *degenerate* game is one decided without any meaningful play — here, checkmate at move zero. The topology itself is never degenerate; the (game, topology, rule-formalism) triple is.

| Game | Route | Group | Orbifold | Surface | Move-0 | Sing. cells | Orientable | Verdict |
|---|---|---|---|---|---|---|---|---|
| Chess | classic | - | - | square with boundary | playable | 0 | Y | OK |
| Chess | torus | p1 | o | torus T2 | black wins at move 0 | 0 | Y | DEAD |
| Chess | mirror | pm | ** | annulus, two mirror boundaries | playable | 16 | Y | QUIRKS |
| Chess | windmill | p4 | 442 | sphere S2(4,4,2) | playable | 2 | Y | QUIRKS |
| Chess | pillowcase | p2 | 2222 | pillowcase S2(2,2,2,2) | black wins at move 0 | 0 | Y | DEAD |
| Chess | cylinder | p1 (frieze) | inf inf | annulus with boundary | playable | 0 | Y | OK |
| Chess | corridor | p1m1 (frieze) | *inf inf | strip between two mirrors | playable | 16 | Y | QUIRKS |
| Chess | mobius | p11g (frieze) | inf x | Mobius band with boundary | playable | 0 | N | QUIRKS |
| Chess | klein | pg | xx | Klein bottle K2 | black wins at move 0 | 0 | N | DEAD |
| Chess | projective | pgg | 22x | projective plane RP2(2,2) | black wins at move 0 | 0 | N | DEAD |
| Go | classic | - | - | square with boundary | playable | 0 | Y | OK |
| Go | torus | p1 | o | torus T2 | playable | 0 | Y | OK |
| Go | mirror | pm | ** | annulus, two mirror boundaries | playable | 38 | Y | QUIRKS |
| Go | windmill | p4 | 442 | sphere S2(4,4,2) | playable | 2 | Y | QUIRKS |
| Go | pillowcase | p2 | 2222 | pillowcase S2(2,2,2,2) | playable | 2 | Y | QUIRKS |
| Go | cylinder | p1 (frieze) | inf inf | annulus with boundary | playable | 0 | Y | OK |
| Go | corridor | p1m1 (frieze) | *inf inf | strip between two mirrors | playable | 38 | Y | QUIRKS |
| Go | mobius | p11g (frieze) | inf x | Mobius band with boundary | playable | 0 | N | QUIRKS |
| Go | klein | pg | xx | Klein bottle K2 | playable | 0 | N | QUIRKS |
| Go | projective | pgg | 22x | projective plane RP2(2,2) | playable | 0 | N | QUIRKS |

Observations worth chasing: board-size parity matters (pillowcase has 0 singular cells on the even chess board but 2 on the odd Go board); every DEAD game so far is chess with a straight vertical wrap; non-orientability never kills a game at move zero, it only warps it.

## Design principle: no playability patches

The rules and the starting position are IDENTICAL on every topology. Some topologies make the standard game degenerate — on the torus the back ranks are glued through the seam, the kings start adjacent, and white is checkmated at move zero (the engine detects and reports this at game start). **This is deliberate.** Do not add per-topology setup shifts, rule exceptions, or other one-off modifications to force a topology to be playable. Which topologies yield interesting games versus degenerate ones is itself the research question — patching the degenerate cases would destroy the object of study.

## Future work: playability theory

- Characterize mathematically which topologies give non-degenerate chess games from the standard setup. Conjectured shape: the game is degenerate iff the gluing maps a back rank into the attack range of the opposing army (e.g. any topology whose vertical gluing carries row 7 adjacent to row 0 without reflection). Torus, Klein, pillowcase, and projective all start decided; classic, cylinder, corridor, Mobius, mirror, and windmill do not — prove the pattern
- The adjudication of degenerate starts depends on the rule formalism, not just the topology. The torus start is a mutual-mate position (by symmetry, whoever is to move is checkmated). Orthodox check/checkmate semantics resolve simultaneity by turn order - the side to move loses, so white loses by moving first. Under shatranj-style king-capture semantics the side to move wins by capturing first (defense of the king is irrelevant when capture ends the game). Mutual check is an illegal position in orthodox chess and FIDE has no rule for it; these topologies manufacture it at move zero. Classification target: (topology x formalism) -> {white wins, black wins, playable}
- Same question for Go: no Go topology is degenerate at move zero (the empty board is symmetric), but cone points and non-orientability change life-and-death shapes (e.g. the minimal living group near a self-adjacent corner). Quantify
- Fair komi per topology, measured or derived

## Notes on rules across topologies

- Chess setup and rules never vary by topology (see design principle above). If the side to move has no legal move at game start, the engine declares the result immediately
- Chess promotion: pawns promote on landing on row 0 / 7 in every topology (on wrapping boards this is the row where they started facing)
- Chess has no castling or en passant anywhere yet
- Go scoring flood-fills territory through the topology's adjacency, so territory counts are correct on all surfaces
- Superko is positional and topology-independent
