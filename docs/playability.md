# Playability theory: which topologies survive move zero

The research question posed in `TOPOLOGIES.md`: characterize which topologies give non-degenerate games from the standard setup, with rules never patched per topology. This document states and proves the characterization for chess and records the move-zero phenomena that fall short of deciding the game. The exhaustive case check runs in `scripts/playability.ts` (`npx tsx scripts/playability.ts`); every claim marked ENGINE below is verified by it against the same pure engine the site and server play with.

## 1.0 Definitions

- A (game, topology, formalism) triple is *degenerate* if the game is decided without any meaningful play — here, decided at move zero. The topology itself is never degenerate.
- *Move-zero status*: with the standard starting position, either the side to move has a legal move (PLAYABLE) or does not (decided: checkmate or stalemate, per the formalism).
- *Vertical wrap*: the topology glues the entire bottom edge onto the entire top edge, straight (torus, pillowcase, klein — `project(8, c) = (0, c)` for all c) or column-flipped (projective — `project(8, c) = (0, 7-c)`).

## 2.0 Theorem (move-zero characterization, chess)

With the standard setup, on every topology in the catalog:

**White is in check at move zero if and only if the topology is a vertical wrap. In that case white is checkmated (black wins at move zero); in every other case the game is playable.** ENGINE: characterization asserted over all 17 registry entries.

Equivalently: DEAD = {torus, pillowcase, klein, projective}; the vertical treatments wall, mirror, and corner-rotation (windmill) never produce a move-zero check, and no side treatment (wrap, flip-wrap, mirror, pivot fold) ever does.

### 2.1 Proof, wrap direction (vertical wrap ⇒ checkmate)

A vertical wrap makes row 0 the downward neighbor of row 7, so the two back ranks stand adjacent through the seam.

Straight wrap (torus, pillowcase, klein): the white king e1 gains three glued neighbors d8, e8, f8. Black checks it by contact four ways — queen d8 (diagonal), king e8 (orthogonal), bishop f8 (diagonal, one step through the seam), knight g8 (ENGINE: checkers = {Qd8, Ke8, Bf8, Ng8} on all three). With more than one checker only king moves can answer. The king's unglued neighbors (d1, f1, d2, e2, f2) hold white pieces; the glued ones are capturable only if undefended, and none is: d8 is defended by the black king, e8 by the black queen, f8 by the black king. No legal move — checkmate. ENGINE: 0 legal white moves on all three.

Flipped wrap (projective, `c -> 7-c`): e1's glued neighbors are e8, d8, c8 (down-left lands on `(0, 4)` = e8). Checkers = {Nb8, Bc8, Qd8, Ke8} (ENGINE); the same defended-contact argument closes every flight square. Checkmate. ENGINE: 0 legal white moves.

The position is mutual by construction — black's king is symmetrically checked (ENGINE: black checkers mirror white's on all four) — so the *formalism*, not the topology, picks the loser: see 4.0.

### 2.2 Proof, non-wrap direction (everything else ⇒ no check)

A move-zero check on the white king e1 is a contact check (adjacent king/queen/pawn/bishop/rook), a knight check (Chebyshev distance ≤ 2 in the plane cover), or a slider ray. Case analysis over the catalog's edge treatments:

- **Vertical wall** (classic, pivot, hinge, cylinder, mobius): no cells below row 7; e1's neighborhood holds only white pieces. No contact or knight source below.
- **Vertical mirror** (mirror, corridor, openpillowcase, mirrorbox, alcove, mobiusmirror, halfmirror): crossing the bottom edge re-enters row 7 — the glued images near e1 are *white's own reflections*, and reflections preserve color. No black piece within contact or knight range.
- **Windmill corner rotation**: the bottom edge glues onto the *right* edge (`project(8, c) = (c, 7)`), so e1's glued neighbors are h3, h4, h5 — empty mid-board cells, not black's army. Knight jumps from black's pieces reach no closer (ENGINE: no checkers).
- **Side treatments never matter for check**: contact and knight range extends 2 files from the king; e1 sits on file e, 3 files from either side edge, so no side gluing (wrap, flip, mirror, pivot fold) brings a black piece into range of either king.
- **Slider rays**: every ray from a back-rank slider is blocked within one step by the full ranks 1, 2, 7, 8 — except rays that bend through a gluing into the empty middle ranks. In the catalog exactly one such ray family exists at move zero (the windmill queens, see 3.0), and it terminates on a queen, not a king. ENGINE: checker enumeration equals `isInCheck` on all 17 entries.

No check, and white trivially has legal moves (pawn pushes are never blocked at move zero on any catalog topology — ENGINE: legal moves > 0 on all playable entries). ∎

## 3.0 Move-zero contact phenomena short of mate

Playable does not mean quiet. ENGINE (cross-army attack enumeration at move zero):

| Topology | Attacks | Phenomenon |
|---|---|---|
| windmill | 14 | Mutual queen attack: Qd1's downward ray bends through the bottom-right corner gluing onto rank 5 (d1, h5, g5, ..., a5) and lands on Qd8; Qd8's ray arrives along the same rank from the other end. Each queen is defended by its adjacent king, so the tension stands — the whole of rank 5 is a contested firing line from move one |
| pivot | 8 | Side edges fold onto themselves: a1 and a8 are glued adjacent, so both rook pairs attack each other through the folds |
| hinge | 4 | Only the right (pivot) edge folds: Rh1 x Rh8 available at move zero; the left (mirror) edge produces no cross-army contact |
| mobius | 8 | The vertical flip in the side wrap glues a1 adjacent to h8: rooks attack the *opposite* corner rooks |
| openpillowcase | 12 | Pivot folds plus mirror rows: rooks meet through the side folds, knights reach across |
| mobiusmirror | 12 | As mobius, plus mirror-row knight reach |
| pillowcase/torus/klein/projective | 36-44 | The armies interpenetrate wholesale (and the game is already over) |

All other topologies: 0 cross-army attacks at move zero.

## 4.0 Formalism dependence

The four DEAD positions are *mutual-mate* positions: both kings are checked at move zero, a position orthodox chess treats as illegal and FIDE has no rule for. The topology manufactures it; the formalism adjudicates it:

| Formalism | Rule | Move-zero outcome on the four wraps |
|---|---|---|
| Orthodox (implemented) | Check/checkmate; simultaneity resolved by turn order | Side to move is checkmated — **black wins** |
| King capture (shatranj-style) | First king capture wins; no check concept | Side to move captures first — **white wins** (torus/pillowcase/klein: Kxe8; projective: Qd1xKe8 through the seam) |

Classification target (topology x formalism) -> {white wins, black wins, playable} is thus complete for the catalog: the formalism flips the winner on exactly the four vertical wraps and changes nothing elsewhere (no other topology has a move-zero king attack, by the theorem).

The engine implements orthodox semantics only, and reports the mutual-mate outcome honestly at game start. Implementing alternate formalisms is out of scope by the no-playability-patches principle — the finding is that the winner of a degenerate start is a property of the rule formalism, not the board.

## 5.0 Go

No Go topology is degenerate at move zero: the empty board is legal-move-symmetric everywhere. What the topology changes is the value structure:

- Singular (self-adjacent) cells lose liberties: a windmill cone-point cell has 2 distinct liberties, an alcove right-corner cell 2, a mirror-row cell 3 (census SING column in `TOPOLOGIES.md`).
- Closed surfaces (torus, windmill, pillowcase, klein, projective) have no corner or edge territory at all; komi compensates provisionally at 7.5 (see `Topology.goKomi`, DOCKET T-74). Measuring fair komi per topology remains open — it needs self-play data the project does not yet generate.
- Minimal-living-group shapes near cone points and mirror rows are uncharacterized. Open.

## 6.0 Status

- Chess move-zero characterization: PROVED (2.1, 2.2) and continuously machine-verified (`scripts/playability.ts`, run in CI).
- Formalism classification: COMPLETE for the catalog (4.0).
- Go quantitative questions (fair komi, life-and-death near singular cells): OPEN, restated above with what they need.
