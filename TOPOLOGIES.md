# Topologies

Every variant is the same game played on a quotient of the infinite plane: a single function `project(row, col) -> board cell | null` maps any plane coordinate onto the canonical board (`null` = wall). Adding a variant = one entry in `TOPOLOGIES` in `src/topology.ts` (a `project` function plus metadata). Adjacency, chess move generation, tessellated rendering, overlay labels, and the mode button all derive from it.

## Implemented

- Classic — walls on all edges
- Torus — both edge pairs wrap (`mod` both coordinates)
- Mirror — columns wrap, rows reflect at top/bottom (fold `row mod 2n`)
- Windmill — copies rotate 90 degrees around shared corners (wallpaper group p4, orbifold 442; quotient S²(4,4,2)). Orbifold quirk: cells at the rotation corners are adjacent to themselves, so corner points have only 2 distinct liberties in Go
- Pillowcase — side-by-side copies rotate 180 degrees, rows wrap (wallpaper group p2, orbifold 2222; quotient is the pillowcase S²(2,2,2,2)). Cone-point cells on the middle row of the side edges are self-adjacent
- Pivot — each side edge glues to itself rotated 180 degrees, rows are walls (frieze group p2, orbifold 22∞). The pillowcase's walled sibling, as the cylinder is to the torus. On odd boards the side-edge midpoint cells are self-adjacent
- Hinge — left edge is a mirror, right edge glues to itself rotated 180 (as in Pivot), rows are walls (frieze group p2mg, orbifold 2*∞). Mirror ∘ pivot = glide reflection, so strip copies cycle original / rotated / reflected / both. Left-column cells self-adjacent; on odd boards the right-edge midpoint too
- Open Pillowcase — side edges rotate 180 onto themselves (as in Pivot), rows reflect at top/bottom (as in Mirror) — wallpaper group pmg, orbifold 22*. The last wallpaper group with the square board as fundamental domain via pure edge gluings. Quotient is a disk with two order-2 cone points and a mirror boundary: top/bottom rows self-adjacent, plus the side-edge midpoints on odd boards
- Cylinder — columns wrap, rows are walls
- Corridor — rows reflect at top/bottom (two facing mirrors), columns are walls
- Half Mirror — columns wrap, the bottom edge reflects, the top edge is a wall (frieze group p11m, orbifold ∞*). The first board that treats the two chess armies differently: white backs onto its own reflection, black onto a wall
- Mirror Box — all four edges reflect (wallpaper group pmm, orbifold *2222). Every perimeter cell is self-adjacent, corners doubly so
- Alcove — top, bottom, and right edges reflect, the left edge is a wall (frieze group p2mm, orbifold *22∞). A mirror box with one side knocked out. With Hinge and Half Mirror this completes all seven frieze groups on the square board
- Mobius — columns wrap with a vertical flip, rows are walls
- Klein — columns glue with a vertical flip, rows wrap (Klein bottle)
- Mobius Mirror — columns wrap with a vertical flip, rows reflect at top/bottom (wallpaper group cm, orbifold *x; quotient is a Mobius band with mirror boundary)
- Projective — both edge pairs glue with a flip (projective plane; has 2-fold cone points at two corners)

## Ideas / not yet implemented

- Glide torus — rows wrap normally; crossing top/bottom shifts columns by k (screw dislocation). `project: [mod(r,n), mod(c + k*floor(r/n), n)]`. Caveat: the tessellated view needs an axis-aligned period of `n/gcd(k,n)` boards — fine for chess (n=8, k=4 gives period 2) but unusable for Go (n=19 is prime, so any shift gives period 19). Needs either a chess-only mode concept or a smarter renderer
- Face windmill — p4 with rotation centers at cell centers instead of corners. INFEASIBLE as a drop-in (checked 2026-08-19): a cell-centered p4 action on the square lattice has n²+2 cell orbits per board area (the two 4-fold-fixed cells and the 2-fold-swapped pair collapse), so the n×n board can never be a set of orbit representatives. Needs a different board size/shape concept
- cmm / p4m / p4g — need triangular or kite-shaped fundamental domains; the square board cannot represent them via pure edge gluings (pmg, now implemented as Open Pillowcase, was the last one that could)
- Double-wide fundamental domain — two boards side by side glued into any of the above; games with 2x material
- Alice variants — two stacked boards; a piece/stone teleports to the other layer after each move (not a plane quotient; needs a layer dimension, but project() generalizes to (layer, r, c))
- Hex Klein / projective — the hex-torus construction below with a flip in one gluing. Reflections exist on the hex lattice (axial swap (q,r) -> (r,q) maps the rook and bishop direction sets to themselves), so the machinery generalizes; the torus is implemented, the non-orientable gluings are not
- Small boards — 9x9 / 13x13 Go, 5x5 mini chess; topology math is size-generic already (Go 9/13/19 implemented)
- Handicap presets per topology (per-topology komi is implemented — see rules notes below; stone handicaps are not)

## Beyond the plane: other geometries

Not every board on the site is a quotient of the Euclidean plane. These live outside `project()`/`TOPOLOGIES` as their own board families in the `GAMES` registry:

- Hexagonal chess (`hexchess`) — Gliński's game on the 91-cell hex board
- Hex torus chess (`hextorus`) — Gliński's rules on the hex torus. The Gliński hexagon does not tile the plane by translation, but its 11×11 axial bounding rhombus does (121 cells: the 91 plus the 30 cut corners, now ordinary cells); gluing opposite rhombus edges makes a torus, and every line simply projects through the gluing. Setup untouched. Findings, honestly reported: both kings start in compound double check through the seams and the side to move has exactly ONE legal reply (a king move) — the game opens on a forced king walk instead of dying outright, the hexagonal sibling of square torus chess's mate at move zero. The three-colouring dies (11 ≢ 0 mod 3, so seam crossings shift a bishop's colour class), pawns promote on the seam row they march toward (the analog of the square torus keeping rows 0/7), en passant projects
- Hex torus Go (`hextorusgo`) — untouched Go on the same glued rhombus with hexagonal adjacency: six liberties everywhere, no corners, edges, or first line anywhere on the closed surface. Komi 7.5 provisional (closed-surface convention). This also closes the old "Hex Go on a torus" idea
- Hyperbolic chess (`hyperchess`) — chess on a 1352-cell patch of the {4,6} tiling of the hyperbolic plane, following [Andrea Hawksley's "Non-Euclidean Chess, Part 2"](https://andreahawksley.com/non-euclidean-chess-part-2/). Six squares meet at every vertex, so the checkerboard colouring survives and Hawksley's "reasonable diagonal" (shares a vertex and a colour) gives bishops 8 straight rays; the two Euclidean knight paths (2+1 vs 1+2) split into 16 distinct jumps. Setup per the article: queens face off 7 cells apart along a central geodesic, back ranks and pawn lines run along horizontal geodesics, walls sit directly behind the armies, and the sides are equidistant curves. Findings so far, honestly reported: the pawn line diverges from the back rank so bishops start with open diagonals, the king starts with 7 flight squares, and the outermost files are cramped against the side walls (the h-pawn is born stuck)

- Hyperbolic Go (`hypergo`) — Go on the same 1352-cell {4,6} patch: stones on cells, liberties along the tiling's edges, otherwise untouched rules (capture, suicide ban, positional superko, two passes, flood-fill territory, komi 6.5 provisional). The geometry changes the economics, not the rules: area inside a loop grows only linearly with its circumference, so territory walls cost far more per enclosed cell than on a flat board

- Pentagonal chess (`pentachess`) — chess on a 3524-cell patch of the {5,4} tiling (pentagons, four per vertex), completing the variant Hawksley's Part 2 sketches only conceptually. A pentagon has no opposite edge — the feature opposite an edge is a corner and vice versa — so the geodesic through a cell alternates edge and vertex crossings: rooks ride it starting across an edge, bishops cross vertices only (the across-a-vertex cell is unique at a degree-4 vertex) and keep their colour ({5,4} does checkerboard — every adjacency cycle is a 4-cycle, contra the old note here), knights take the article's verbatim 10 jumps (edge, then one of the two far edges), pawns carry their next crossing as a heading. Back ranks bend: no geodesic runs perpendicular to the spine through a spine cell, so each rank follows the two most-sideways rays, curling away from the enemy

Further ideas in this family: spherical chess from Hawksley's Part 1.

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
| Chess | pivot | p2 (frieze) | 22 inf | strip folded at two pivots | playable | 0 | Y | OK |
| Chess | hinge | p2mg (frieze) | 2* inf | strip folded at one pivot, one mirror side | playable | 8 | Y | QUIRKS |
| Chess | openpillowcase | pmg | 22* | disk with two cone points, mirror boundary | playable | 16 | Y | QUIRKS |
| Chess | cylinder | p1 (frieze) | inf inf | annulus with boundary | playable | 0 | Y | OK |
| Chess | corridor | p1m1 (frieze) | *inf inf | strip between two mirrors | playable | 16 | Y | QUIRKS |
| Chess | halfmirror | p11m (frieze) | inf * | annulus, one mirror + one wall boundary | playable | 8 | Y | QUIRKS |
| Chess | mirrorbox | pmm | *2222 | square, all-mirror boundary | playable | 28 | Y | QUIRKS |
| Chess | alcove | p2mm (frieze) | *22 inf | square, three mirror sides + one wall | playable | 22 | Y | QUIRKS |
| Chess | mobius | p11g (frieze) | inf x | Mobius band with boundary | playable | 0 | N | QUIRKS |
| Chess | klein | pg | xx | Klein bottle K2 | black wins at move 0 | 0 | N | DEAD |
| Chess | mobiusmirror | cm | *x | Mobius band with mirror boundary | playable | 16 | N | QUIRKS |
| Chess | projective | pgg | 22x | projective plane RP2(2,2) | black wins at move 0 | 0 | N | DEAD |
| Go | classic | - | - | square with boundary | playable | 0 | Y | OK |
| Go | torus | p1 | o | torus T2 | playable | 0 | Y | OK |
| Go | mirror | pm | ** | annulus, two mirror boundaries | playable | 38 | Y | QUIRKS |
| Go | windmill | p4 | 442 | sphere S2(4,4,2) | playable | 2 | Y | QUIRKS |
| Go | pillowcase | p2 | 2222 | pillowcase S2(2,2,2,2) | playable | 2 | Y | QUIRKS |
| Go | pivot | p2 (frieze) | 22 inf | strip folded at two pivots | playable | 2 | Y | QUIRKS |
| Go | hinge | p2mg (frieze) | 2* inf | strip folded at one pivot, one mirror side | playable | 20 | Y | QUIRKS |
| Go | openpillowcase | pmg | 22* | disk with two cone points, mirror boundary | playable | 40 | Y | QUIRKS |
| Go | cylinder | p1 (frieze) | inf inf | annulus with boundary | playable | 0 | Y | OK |
| Go | corridor | p1m1 (frieze) | *inf inf | strip between two mirrors | playable | 38 | Y | QUIRKS |
| Go | halfmirror | p11m (frieze) | inf * | annulus, one mirror + one wall boundary | playable | 19 | Y | QUIRKS |
| Go | mirrorbox | pmm | *2222 | square, all-mirror boundary | playable | 72 | Y | QUIRKS |
| Go | alcove | p2mm (frieze) | *22 inf | square, three mirror sides + one wall | playable | 55 | Y | QUIRKS |
| Go | mobius | p11g (frieze) | inf x | Mobius band with boundary | playable | 0 | N | QUIRKS |
| Go | klein | pg | xx | Klein bottle K2 | playable | 0 | N | QUIRKS |
| Go | mobiusmirror | cm | *x | Mobius band with mirror boundary | playable | 38 | N | QUIRKS |
| Go | projective | pgg | 22x | projective plane RP2(2,2) | playable | 0 | N | QUIRKS |

Observations worth chasing: board-size parity matters (pillowcase and pivot have 0 singular cells on the even chess board but 2 on the odd Go board); every DEAD game so far is chess with a straight vertical wrap; non-orientability never kills a game at move zero, it only warps it (mobiusmirror stays playable where klein dies, because its vertical gluing is a mirror, not a wrap).

## Design principle: no playability patches

The rules and the starting position are IDENTICAL on every topology. Some topologies make the standard game degenerate — on the torus the back ranks are glued through the seam, the kings start adjacent, and white is checkmated at move zero (the engine detects and reports this at game start). **This is deliberate.** Do not add per-topology setup shifts, rule exceptions, or other one-off modifications to force a topology to be playable. Which topologies yield interesting games versus degenerate ones is itself the research question — patching the degenerate cases would destroy the object of study.

## Playability theory

RESOLVED for chess: see `docs/playability.md`. The move-zero characterization is proved and machine-checked in CI (`scripts/playability.ts`): the standard start is degenerate iff the vertical gluing is a wrap (straight or column-flipped) carrying the whole bottom edge onto the whole top edge — exactly torus, pillowcase, klein, projective. The naive "some back-rank cell adjacent to row 0" version is falsified by the windmill, whose corner gluing touches row 0 at one cell but produces only a mutual queen attack along rank 5, not a check. The formalism classification is also complete: orthodox semantics give the win to black (side to move is mated), king-capture semantics to white (side to move captures first) — the winner of a degenerate start is a property of the rule formalism, not the board.

Still open (stated with what they need in `docs/playability.md` 5.0):

- Go quantitative questions: minimal living groups near cone points and mirror rows; effects of non-orientability on life-and-death
- Fair komi per topology, measured — needs self-play data; current per-topology values (`Topology.goKomi`) are provisional

## Notes on rules across topologies

- Chess setup and rules never vary by topology (see design principle above). If the side to move has no legal move at game start, the engine declares the result immediately
- Chess promotion: pawns promote on landing on row 0 / 7 in every topology (on wrapping boards this is the row where they started facing)
- Chess castling and en passant are implemented topology-generically (castle squares are canonical — the starting layout is the fundamental domain everywhere — while the out-of/through/into-check tests project through the topology; a castle is only offered where its target is not also a plain glued king step). The ep double-step window projects when it opens and closes after one ply
- Go scoring flood-fills territory through the topology's adjacency, so territory counts are correct on all surfaces
- Superko is positional and topology-independent
- Go komi is per-topology: 6.5 on surfaces with boundary (walls or mirrors), 7.5 on the five closed surfaces (torus, windmill, pillowcase, klein, projective), where corner and edge territory does not exist. The 7.5 value is PROVISIONAL, not measured — fair komi per topology remains the research item below. Komi is not a playability patch: it is a scoring compensation outside the rules of play, the standard knob Go itself uses for first-move advantage. Set per topology via `Topology.goKomi`, stored in the game state at creation, overridable via the `komi` new-game option
