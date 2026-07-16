// Pure hyperbolic chess engine, after Andrea Hawksley's "Non-Euclidean Chess,
// Part 2". The board is a finite patch of the {4,6} tiling of the hyperbolic
// plane: square cells, six around every vertex. This is NOT a quotient of the
// Euclidean plane, so like hexchess it lives outside the project()/TOPOLOGIES
// machinery in its own board family ('hyperbolic-46').
//
// Geometry: cells are generated as Mobius transforms (SU(1,1) matrices acting
// on the Poincare disk) of a fundamental square at the origin. Everything else
// - adjacency, straight lines, diagonals, knight paths - is derived from the
// tiling's isometries at module load and baked into lookup tables, so play is
// pure graph-walking with no floating point.
//
// Movement, generalizing the Euclidean rules per the article:
//   - Rook: enters a cell through one edge and leaves through the opposite
//     edge; the cell sequence follows a geodesic.
//   - Bishop: steps to a cell sharing a vertex and a color (Hawksley's
//     "reasonable diagonal"). A sliding ray alternates its turning sense
//     around successive opposite vertices; two such steps compose to a
//     hyperbolic translation, so the ray is straight. 8 rays per cell.
//   - Knight: two steps straight then one perpendicular, or one step then two
//     straight. In Euclidean space these coincide (8 squares); in hyperbolic
//     space all 16 paths land on distinct cells.
//   - King: one rook step or one bishop step (12 cells).
//   - Pawn: carries a heading (an edge of its cell) that parallel-transports
//     along each move; captures on the two forward diagonals; double-step from
//     its starting cell; promotes to queen when its heading faces a wall.
//     No castling, no en passant.
//
// Setup, following the article: queens face each other 7 cells apart along a
// central geodesic (the "spine"); each back rank runs along the horizontal
// geodesic through its queen (R N B Q K B N R), and the 8 pawns sit on the
// horizontal geodesic one step in front of the queen. Because horizontal
// geodesics through consecutive spine cells diverge, the pawn line only
// shields the files near the queen - hyperbolic geometry, honestly reported.
// The board ends at wall geodesics directly behind each back rank and at
// equidistant curves ("constantly turning towards the center") just outside
// the rooks.

import { Color, GameModule, GameResult, opponentOf } from '../core.ts';

export type HyperPieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';

export interface HyperPiece {
  type: HyperPieceType;
  color: Color;
  // Pawns only: index of the cell edge the pawn moves through. Null otherwise.
  heading: number | null;
}

// ==================== COMPLEX / MOBIUS ====================
export interface C {
  re: number;
  im: number;
}

// Direct isometry of the Poincare disk: z -> (a z + b) / (conj(b) z + conj(a)),
// an SU(1,1) matrix [[a, b], [conj b, conj a]] with |a|^2 - |b|^2 = 1.
export interface Mob {
  a: C;
  b: C;
}

const cAdd = (x: C, y: C): C => ({ re: x.re + y.re, im: x.im + y.im });
const cMul = (x: C, y: C): C => ({ re: x.re * y.re - x.im * y.im, im: x.re * y.im + x.im * y.re });
const cConj = (x: C): C => ({ re: x.re, im: -x.im });
const cNeg = (x: C): C => ({ re: -x.re, im: -x.im });
const cAbs2 = (x: C): number => x.re * x.re + x.im * x.im;
const cScale = (x: C, s: number): C => ({ re: x.re * s, im: x.im * s });
const cDiv = (x: C, y: C): C => cScale(cMul(x, cConj(y)), 1 / cAbs2(y));
const cPolar = (r: number, theta: number): C => ({ re: r * Math.cos(theta), im: r * Math.sin(theta) });

export const MOB_ID: Mob = { a: { re: 1, im: 0 }, b: { re: 0, im: 0 } };

export function mobMul(m: Mob, n: Mob): Mob {
  const a = cAdd(cMul(m.a, n.a), cMul(m.b, cConj(n.b)));
  const b = cAdd(cMul(m.a, n.b), cMul(m.b, cConj(n.a)));
  // Renormalize det to 1 so numerical drift never accumulates.
  const s = 1 / Math.sqrt(cAbs2(a) - cAbs2(b));
  return { a: cScale(a, s), b: cScale(b, s) };
}

export function mobInverse(m: Mob): Mob {
  return { a: cConj(m.a), b: cNeg(m.b) };
}

export function mobApply(m: Mob, z: C): C {
  return cDiv(cAdd(cMul(m.a, z), m.b), cAdd(cMul(cConj(m.b), z), cConj(m.a)));
}

function rotation(theta: number): Mob {
  return { a: cPolar(1, theta / 2), b: { re: 0, im: 0 } };
}

// Pure translation taking the origin to w along their common geodesic.
export function mobTranslation0(w: C): Mob {
  const s = 1 / Math.sqrt(1 - cAbs2(w));
  return { a: { re: s, im: 0 }, b: cScale(w, s) };
}

function rotAbout(p: C, theta: number): Mob {
  const t = mobTranslation0(p);
  return mobMul(mobMul(t, rotation(theta)), mobInverse(t));
}

// tanh(d/2) for the hyperbolic distance d between disk points: the Mobius ratio.
export function mobDistRatio(z: C, w: C): number {
  return distRatio(z, w);
}

function distRatio(z: C, w: C): number {
  const num = Math.hypot(z.re - w.re, z.im - w.im);
  const den = Math.hypot(1 - z.re * w.re - z.im * w.im, z.re * w.im - z.im * w.re);
  return num / den;
}

// ==================== {4,6} CONSTANTS ====================
// Right fundamental triangle of {p,q}={4,6}: angle pi/4 at the cell center,
// pi/6 at the vertex; cosh(inradius) = cos(pi/q)/sin(pi/p), cosh(circumradius)
// = cot(pi/p) cot(pi/q).
export const HYPER_INRADIUS = Math.acosh(Math.cos(Math.PI / 6) / Math.sin(Math.PI / 4));
export const HYPER_CIRCUMRADIUS = Math.acosh(Math.sqrt(3));
const STEP = 2 * HYPER_INRADIUS; // center-to-center distance of edge neighbors

// Base cell at the origin: edge e faces direction e*90deg, corner m sits at
// 45deg + m*90deg. Edge e spans corners (e+3)%4 and e.
const EDGE_MID_BASE: C[] = [0, 1, 2, 3].map(e => cPolar(Math.tanh(HYPER_INRADIUS / 2), (e * Math.PI) / 2));
const CORNER_BASE: C[] = [0, 1, 2, 3].map(m => cPolar(Math.tanh(HYPER_CIRCUMRADIUS / 2), Math.PI / 4 + (m * Math.PI) / 2));

// Generators: translation across edge e (base frame). Composing on the right
// walks in the moving frame, so paths are written as generator words.
const T: Mob[] = [0, 1, 2, 3].map(e => mobTranslation0(cPolar(Math.tanh(HYPER_INRADIUS), (e * Math.PI) / 2)));

// Diagonal step through corner m with turning sense s: rotate the cell two
// positions around the vertex (the {4,6} vertex rotation has order 6, so two
// positions = 2pi/3). Lands on the cell sharing vertex + color.
const Q: Mob[][] = CORNER_BASE.map(corner => [rotAbout(corner, (2 * Math.PI) / 3), rotAbout(corner, (-2 * Math.PI) / 3)]);

// The 16 knight paths as base-frame words: straight-straight-turn and
// straight-turn-straight-straight, for each direction and both turns.
const KNIGHT_WORDS: Mob[] = [];
for (let e = 0; e < 4; e++) {
  for (const t of [1, 3]) {
    const turn = (e + t) % 4;
    KNIGHT_WORDS.push(mobMul(mobMul(T[e], T[e]), T[turn]));
    KNIGHT_WORDS.push(mobMul(mobMul(T[e], T[turn]), T[turn]));
  }
}

// ==================== BOARD REGION ====================
// The spine is the disk's y-axis; the white queen sits 4 steps south of the
// origin, the black queen 3 steps north (7 apart). Walls: geodesics
// perpendicular to the spine half a step behind each back rank; sides:
// equidistant curves half a cell outside the rooks (which stand 4 steps from
// the spine along the back-rank geodesics).
const WHITE_Q_STEP = -4;
const BLACK_Q_STEP = 3;
const U_MIN = (WHITE_Q_STEP - 0.5) * STEP;
const U_MAX = (BLACK_Q_STEP + 0.5) * STEP;
const SIDE_MAX = 4 * STEP + 0.5 * HYPER_INRADIUS;

// Spine coordinates of a disk point via the hyperboloid model: u = position of
// the perpendicular foot along the spine, v = distance to the spine.
function spineCoords(z: C): { u: number; v: number } {
  const den = 1 - cAbs2(z);
  const X = (2 * z.re) / den;
  const Y = (2 * z.im) / den;
  const Z = (1 + cAbs2(z)) / den;
  return { u: Math.atanh(Y / Z), v: Math.asinh(Math.abs(X)) };
}

function inRegion(z: C): boolean {
  const { u, v } = spineCoords(z);
  return u >= U_MIN && u <= U_MAX && v <= SIDE_MAX;
}

// ==================== TILING GENERATION ====================
export interface HyperCell {
  id: number;
  transform: Mob;
  center: C;
  corners: C[]; // 4, base corner order
  light: boolean;
}

interface DiagStep {
  cell: number;
  corner: number; // entry corner index in the target cell
}

const CELLS: HyperCell[] = [];
const NEIGHBORS: (number | null)[][] = [];
const DIAG: (DiagStep | null)[][][] = []; // [cell][corner][senseIdx]
const KNIGHT: number[][] = [];
const PAWN_CAP: ({ cell: number; heading: number } | null)[][][] = []; // [cell][heading][2]

// Spatial hash on disk coordinates for center lookup. Cells are >= STEP apart
// hyperbolically, so a generous match threshold is unambiguous.
const BUCKET = 1e-3;
const MATCH_RATIO = Math.tanh(0.3); // hyperbolic distance 0.6 << STEP
const buckets = new Map<string, number[]>();

function bucketKey(z: C): string {
  return `${Math.round(z.re / BUCKET)},${Math.round(z.im / BUCKET)}`;
}

function lookupCell(z: C): number | null {
  const bx = Math.round(z.re / BUCKET);
  const by = Math.round(z.im / BUCKET);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const ids = buckets.get(`${bx + dx},${by + dy}`);
      if (!ids) continue;
      for (const id of ids) {
        if (distRatio(CELLS[id].center, z) < MATCH_RATIO) return id;
      }
    }
  }
  return null;
}

function addCell(transform: Mob): number {
  const id = CELLS.length;
  const center = mobApply(transform, { re: 0, im: 0 });
  CELLS.push({
    id,
    transform,
    center,
    corners: CORNER_BASE.map(c => mobApply(transform, c)),
    light: false,
  });
  const key = bucketKey(center);
  const list = buckets.get(key);
  if (list) list.push(id);
  else buckets.set(key, [id]);
  return id;
}

function buildBoard(): void {
  // BFS over edge neighbors, keeping cells whose centers fall in the region.
  addCell(MOB_ID);
  for (let i = 0; i < CELLS.length; i++) {
    for (let e = 0; e < 4; e++) {
      const t = mobMul(CELLS[i].transform, T[e]);
      const z = mobApply(t, { re: 0, im: 0 });
      if (lookupCell(z) !== null) continue;
      if (!inRegion(z)) continue;
      addCell(t);
    }
  }

  for (const cell of CELLS) {
    NEIGHBORS.push([0, 1, 2, 3].map(e => lookupCell(mobApply(mobMul(cell.transform, T[e]), { re: 0, im: 0 }))));
  }

  // Checkerboard parity: 2-color by BFS; {4,6} has even vertex degree so the
  // coloring is globally consistent - assert it on every edge.
  const seen = new Array<boolean>(CELLS.length).fill(false);
  seen[0] = true;
  const queue = [0];
  while (queue.length > 0) {
    const i = queue.shift()!;
    for (const n of NEIGHBORS[i]) {
      if (n === null) continue;
      if (!seen[n]) {
        seen[n] = true;
        CELLS[n].light = !CELLS[i].light;
        queue.push(n);
      } else if (CELLS[n].light === CELLS[i].light) {
        throw new Error('hyperchess: checkerboard coloring inconsistent');
      }
    }
  }
  if (seen.some(s => !s)) throw new Error('hyperchess: board region is not connected');

  // Diagonal steps: rotate the cell two positions around each corner, both
  // senses; record the entry corner in the target for ray continuation.
  for (const cell of CELLS) {
    const perCorner: (DiagStep | null)[][] = [];
    for (let m = 0; m < 4; m++) {
      const v = cell.corners[m];
      const senses: (DiagStep | null)[] = [];
      for (let si = 0; si < 2; si++) {
        const z = mobApply(mobMul(cell.transform, Q[m][si]), { re: 0, im: 0 });
        const target = lookupCell(z);
        if (target === null) {
          senses.push(null);
          continue;
        }
        let best = 0;
        let bestD = Infinity;
        for (let k = 0; k < 4; k++) {
          const d = distRatio(CELLS[target].corners[k], v);
          if (d < bestD) {
            bestD = d;
            best = k;
          }
        }
        if (bestD > 0.1) throw new Error('hyperchess: diagonal entry corner mismatch');
        senses.push({ cell: target, corner: best });
      }
      perCorner.push(senses);
    }
    DIAG.push(perCorner);
  }

  for (const cell of CELLS) {
    const dests = new Set<number>();
    for (const word of KNIGHT_WORDS) {
      const target = lookupCell(mobApply(mobMul(cell.transform, word), { re: 0, im: 0 }));
      if (target !== null) dests.add(target);
    }
    KNIGHT.push([...dests]);
  }

  // Pawn captures per heading: the diagonal through each corner flanking the
  // forward edge whose target is edge-adjacent to the forward cell, with the
  // pawn's transported heading (see transportHeading).
  for (const cell of CELLS) {
    const perHeading: ({ cell: number; heading: number } | null)[][] = [];
    for (let h = 0; h < 4; h++) {
      const fwd = NEIGHBORS[cell.id][h];
      const caps: ({ cell: number; heading: number } | null)[] = [];
      for (const m of [h, (h + 3) % 4]) {
        let found: { cell: number; heading: number } | null = null;
        if (fwd !== null) {
          for (let si = 0; si < 2; si++) {
            const d = DIAG[cell.id][m][si];
            if (d && NEIGHBORS[d.cell].includes(fwd)) {
              found = { cell: d.cell, heading: transportHeading(cell.id, h, d.cell) };
              break;
            }
          }
        }
        caps.push(found);
      }
      perHeading.push(caps);
    }
    PAWN_CAP.push(perHeading);
  }
}

// Parallel-transport the heading edge of a pawn on cell `from` along the
// geodesic to cell `to`: translate the forward edge midpoint by the pure
// translation between the centers, then snap to the nearest edge of `to`. For
// a straight forward step this reproduces "exit opposite the entry edge"; for
// captures it keeps the pawn aimed at the enemy, up to hyperbolic holonomy.
function transportHeading(from: number, h: number, to: number): number {
  const cFrom = CELLS[from].center;
  const cTo = CELLS[to].center;
  const tA = mobTranslation0(cFrom);
  const local = mobApply(mobInverse(tA), cTo);
  const translate = mobMul(mobMul(tA, mobTranslation0(local)), mobInverse(tA));
  const p = mobApply(translate, mobApply(CELLS[from].transform, EDGE_MID_BASE[h]));
  let best = 0;
  let bestD = Infinity;
  for (let e = 0; e < 4; e++) {
    const d = distRatio(mobApply(CELLS[to].transform, EDGE_MID_BASE[e]), p);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

// Edge of `cell` that faces `from` (they are edge-adjacent).
function entryEdge(cell: number, from: number): number {
  const e = NEIGHBORS[cell].indexOf(from);
  if (e < 0) throw new Error('hyperchess: entryEdge on non-adjacent cells');
  return e;
}

// ==================== SETUP ====================
const BACK_RANK: HyperPieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
const RANK_OFFSETS = [-3, -2, -1, 0, 1, 2, 3, 4]; // queen at 0, king at +1

function power(m: Mob, k: number): Mob {
  const base = k < 0 ? mobInverse(m) : m;
  let out = MOB_ID;
  for (let i = 0; i < Math.abs(k); i++) out = mobMul(out, base);
  return out;
}

function cellAt(transform: Mob): number {
  const id = lookupCell(mobApply(transform, { re: 0, im: 0 }));
  if (id === null) throw new Error('hyperchess: setup cell missing from board');
  return id;
}

// Heading of the stored cell nearest to the intended forward direction of a
// setup transform (stored frames come from BFS and may be rotated).
function headingToward(cellId: number, setupTransform: Mob, localEdge: number): number {
  const p = mobApply(setupTransform, EDGE_MID_BASE[localEdge]);
  let best = 0;
  let bestD = Infinity;
  for (let e = 0; e < 4; e++) {
    const d = distRatio(mobApply(CELLS[cellId].transform, EDGE_MID_BASE[e]), p);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

export type HyperBoard = Map<number, HyperPiece>;

export interface HyperState {
  board: HyperBoard;
  turn: Color;
  gameOver: Color | 'draw' | null;
}

export interface HyperMove {
  from: number;
  to: number;
}

const PAWN_START: Record<Color, Set<number>> = { white: new Set(), black: new Set() };
let INITIAL_BOARD: HyperBoard;
export let HYPER_VIEW_HOME: C; // suggested initial view center (white army)

function buildSetup(): void {
  INITIAL_BOARD = new Map();

  for (const [color, qStep, forward] of [
    ['white', WHITE_Q_STEP, 1],
    ['black', BLACK_Q_STEP, 3],
  ] as [Color, number, number][]) {
    const queenT = power(T[1], qStep);
    for (let i = 0; i < 8; i++) {
      const j = RANK_OFFSETS[i];
      const pieceT = mobMul(queenT, power(T[0], j));
      INITIAL_BOARD.set(cellAt(pieceT), { type: BACK_RANK[i], color, heading: null });

      const pawnT = mobMul(mobMul(queenT, T[forward]), power(T[0], j));
      const pawnCell = cellAt(pawnT);
      INITIAL_BOARD.set(pawnCell, { type: 'pawn', color, heading: headingToward(pawnCell, pawnT, forward) });
      PAWN_START[color].add(pawnCell);
    }
  }

  // "Place the white queen on a white square": fix the global parity so she is.
  const whiteQueen = cellAt(power(T[1], WHITE_Q_STEP));
  if (!CELLS[whiteQueen].light) {
    for (const cell of CELLS) cell.light = !cell.light;
  }

  HYPER_VIEW_HOME = mobApply(power(T[1], WHITE_Q_STEP), EDGE_MID_BASE[1]);
}

buildBoard();
buildSetup();

export function hyperCells(): readonly HyperCell[] {
  return CELLS;
}

export function hyperNeighbors(cell: number): readonly (number | null)[] {
  return NEIGHBORS[cell];
}

export const HYPER_CELL_COUNT = CELLS.length;

// Closed boundary polyline of the base cell (corners + geodesic edge samples),
// for rendering. Points 4e..4e+4 trace edge e (wrapping at 16).
export const HYPER_BASE_BOUNDARY: C[] = [];
{
  const SAMPLES = 3;
  for (let e = 0; e < 4; e++) {
    const from = CORNER_BASE[(e + 3) % 4];
    const to = CORNER_BASE[e];
    HYPER_BASE_BOUNDARY.push(from);
    const t0 = mobTranslation0(from);
    const local = mobApply(mobInverse(t0), to);
    const dist = Math.atanh(Math.hypot(local.re, local.im));
    const dir = Math.atan2(local.im, local.re);
    for (let s = 1; s <= SAMPLES; s++) {
      const r = Math.tanh((dist * s) / (SAMPLES + 1));
      HYPER_BASE_BOUNDARY.push(mobApply(t0, cPolar(r, dir)));
    }
  }
}

// ==================== MOVE GENERATION ====================
type HyperCtx = Pick<HyperState, 'board'>;

function slideRook(ctx: HyperCtx, from: number, color: Color, dests: Set<number>): void {
  for (let e = 0; e < 4; e++) {
    let prev = from;
    let cur = NEIGHBORS[from][e];
    while (cur !== null) {
      const occ = ctx.board.get(cur);
      if (occ) {
        if (occ.color !== color) dests.add(cur);
        break;
      }
      dests.add(cur);
      const exit = (entryEdge(cur, prev) + 2) % 4;
      prev = cur;
      cur = NEIGHBORS[cur][exit];
    }
  }
}

function slideBishop(ctx: HyperCtx, from: number, color: Color, dests: Set<number>): void {
  for (let m = 0; m < 4; m++) {
    for (let si = 0; si < 2; si++) {
      let cur = from;
      let corner = m;
      let sense = si;
      for (let guard = 0; guard <= CELLS.length; guard++) {
        const step = DIAG[cur][corner][sense];
        if (!step) break;
        const occ = ctx.board.get(step.cell);
        if (occ) {
          if (occ.color !== color) dests.add(step.cell);
          break;
        }
        dests.add(step.cell);
        cur = step.cell;
        corner = (step.corner + 2) % 4;
        sense = 1 - sense;
      }
    }
  }
}

function pseudoDestinations(ctx: HyperCtx, from: number): Set<number> {
  const dests = new Set<number>();
  const piece = ctx.board.get(from);
  if (!piece) return dests;

  switch (piece.type) {
    case 'rook':
      slideRook(ctx, from, piece.color, dests);
      break;
    case 'bishop':
      slideBishop(ctx, from, piece.color, dests);
      break;
    case 'queen':
      slideRook(ctx, from, piece.color, dests);
      slideBishop(ctx, from, piece.color, dests);
      break;
    case 'king': {
      for (const n of NEIGHBORS[from]) {
        if (n === null) continue;
        const occ = ctx.board.get(n);
        if (!occ || occ.color !== piece.color) dests.add(n);
      }
      for (let m = 0; m < 4; m++) {
        for (let si = 0; si < 2; si++) {
          const step = DIAG[from][m][si];
          if (!step) continue;
          const occ = ctx.board.get(step.cell);
          if (!occ || occ.color !== piece.color) dests.add(step.cell);
        }
      }
      break;
    }
    case 'knight': {
      for (const n of KNIGHT[from]) {
        const occ = ctx.board.get(n);
        if (!occ || occ.color !== piece.color) dests.add(n);
      }
      break;
    }
    case 'pawn': {
      const h = piece.heading!;
      const fwd = NEIGHBORS[from][h];
      if (fwd !== null && !ctx.board.get(fwd)) {
        dests.add(fwd);
        if (PAWN_START[piece.color].has(from)) {
          const fwd2 = NEIGHBORS[fwd][(entryEdge(fwd, from) + 2) % 4];
          if (fwd2 !== null && !ctx.board.get(fwd2)) dests.add(fwd2);
        }
      }
      for (const cap of PAWN_CAP[from][h]) {
        if (!cap) continue;
        const occ = ctx.board.get(cap.cell);
        if (occ && occ.color !== piece.color) dests.add(cap.cell);
      }
      break;
    }
  }

  return dests;
}

// ==================== CHECK / CHECKMATE ====================
function findKing(board: HyperBoard, color: Color): number | null {
  for (const [cell, p] of board) {
    if (p.type === 'king' && p.color === color) return cell;
  }
  return null;
}

function isAttacked(ctx: HyperCtx, target: number, byColor: Color): boolean {
  for (const [cell, p] of ctx.board) {
    if (p.color === byColor && pseudoDestinations(ctx, cell).has(target)) return true;
  }
  return false;
}

export function isHyperInCheck(ctx: HyperCtx, color: Color): boolean {
  const king = findKing(ctx.board, color);
  return king !== null ? isAttacked(ctx, king, opponentOf(color)) : false;
}

function moveLeavesKingInCheck(state: HyperState, from: number, to: number): boolean {
  const piece = state.board.get(from);
  if (!piece) return false;
  const clone = new Map(state.board);
  clone.delete(from);
  clone.set(to, piece);
  return isHyperInCheck({ board: clone }, piece.color);
}

export function hyperLegalDestinations(state: HyperState, from: number): Set<number> {
  const legal = new Set<number>();
  for (const dest of pseudoDestinations(state, from)) {
    if (!moveLeavesKingInCheck(state, from, dest)) legal.add(dest);
  }
  return legal;
}

export function hasAnyLegalMove(state: HyperState, color: Color): boolean {
  for (const [cell, p] of state.board) {
    if (p.color === color && hyperLegalDestinations(state, cell).size > 0) return true;
  }
  return false;
}

export function hyperCheckedKingCell(state: HyperState): number | null {
  if (state.gameOver === 'draw') return null;
  const king = findKing(state.board, state.turn);
  return king !== null && isHyperInCheck(state, state.turn) ? king : null;
}

// ==================== STATE TRANSITIONS ====================
export function initialHyperState(): HyperState {
  const state: HyperState = {
    board: new Map([...INITIAL_BOARD].map(([cell, p]) => [cell, { ...p }])),
    turn: 'white',
    gameOver: null,
  };
  if (!hasAnyLegalMove(state, state.turn)) {
    state.gameOver = isHyperInCheck(state, state.turn) ? opponentOf(state.turn) : 'draw';
  }
  return state;
}

export function applyHyperMove(state: HyperState, from: number, to: number): HyperState {
  const board = new Map(state.board);
  const mover = state.turn;
  const source = board.get(from)!;
  const moved: HyperPiece = { ...source };

  if (source.type === 'pawn') {
    const h = source.heading!;
    const fwd = NEIGHBORS[from][h];
    if (to === fwd) {
      moved.heading = (entryEdge(to, from) + 2) % 4;
    } else if (fwd !== null && NEIGHBORS[fwd].includes(to) && !state.board.get(to)) {
      // Double-step: transport through the intermediate cell.
      moved.heading = (entryEdge(to, fwd) + 2) % 4;
    } else {
      const cap = PAWN_CAP[from][h].find(c => c !== null && c.cell === to);
      moved.heading = cap ? cap.heading : h;
    }
    if (NEIGHBORS[to][moved.heading!] === null) {
      moved.type = 'queen';
      moved.heading = null;
    }
  }

  board.delete(from);
  board.set(to, moved);

  const turn = opponentOf(mover);
  const next: HyperState = { board, turn, gameOver: null };
  if (!hasAnyLegalMove(next, turn)) {
    next.gameOver = isHyperInCheck(next, turn) ? mover : 'draw';
  }
  return next;
}

// ==================== MODULE ====================
interface HyperSnapshot {
  board: Record<string, HyperPiece>;
  turn: Color;
  gameOver: Color | 'draw' | null;
}

function hyperResult(state: HyperState): GameResult {
  if (!state.gameOver) return { status: 'active', turn: state.turn };
  return { status: 'done', winner: state.gameOver };
}

export const hyperModule: GameModule<HyperState, HyperMove, null> = {
  id: 'hyperchess',
  name: 'Hyperbolic Chess',
  boardFamily: 'hyperbolic-46',
  catalog: {
    group: 'Hyperbolic',
    board: 'Hyperbolic plane',
    surface: '{4,6} tiling of the hyperbolic plane',
    spec: [`${HYPER_CELL_COUNT} CELLS`, 'SIX SQUARES PER VERTEX', 'QUEENS FACE OFF ACROSS A GEODESIC'],
    badge: 'HYPERBOLIC BOARD',
  },
  initialState: () => initialHyperState(),
  isLegalMove: (state, move) => {
    if (state.gameOver) return false;
    const piece = state.board.get(move.from);
    if (!piece || piece.color !== state.turn) return false;
    return hyperLegalDestinations(state, move.from).has(move.to);
  },
  applyMove: (state, move) => {
    const next = applyHyperMove(state, move.from, move.to);
    return { state: next, result: hyperResult(next) };
  },
  serialize: (state): HyperSnapshot => ({
    board: Object.fromEntries([...state.board].map(([cell, p]) => [String(cell), p])),
    turn: state.turn,
    gameOver: state.gameOver,
  }),
  deserialize: (data) => {
    const d = data as HyperSnapshot;
    return {
      board: new Map(Object.entries(d.board).map(([cell, p]) => [Number(cell), p])),
      turn: d.turn,
      gameOver: d.gameOver,
    };
  },
};
