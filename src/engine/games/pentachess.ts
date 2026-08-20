// Pure pentagonal hyperbolic chess engine: chess on a finite patch of the
// {5,4} tiling (pentagons, four around every vertex), realizing the variant
// Andrea Hawksley sketches conceptually in "Non-Euclidean Chess, Part 2". Her
// article commits only to a framework - "rooks would have to start their move
// going across an edge, bishops would have to start going across a vertex,
// and queens could do either"; knights go "through an edge, then through one
// of the two far edges" (10 moves); diagonals stay on one colour - and warns
// that straight lines get messy because a pentagon has no opposite edge. The
// concrete rules below are this project's completion of that sketch, chosen
// so every line is an honest geodesic or its closest lattice analogue:
//
//   - A pentagon's opposite feature ALTERNATES kind: the feature opposite
//     edge e is corner (e+2)%5, the feature opposite corner m is edge
//     (m+3)%5. The geodesic through a cell centre therefore alternates edge
//     and vertex crossings.
//   - Rook: rides that geodesic, starting across an edge. 5 rays.
//   - Bishop: starts across a vertex. Four pentagons meet at every vertex,
//     so "across the vertex" is the unique opposite cell (a half-turn about
//     the vertex) and, unlike the {4,6} board, needs no sense choice per
//     step. The ray continues through one of the target's two far corners,
//     the sense alternating so successive half-turns compose toward a
//     translation (as in the {4,6} bishop). 10 rays (5 corners x 2 senses).
//     Vertex crossings preserve the checkerboard colour - {5,4} IS
//     two-colourable (every adjacency cycle is a 4-cycle around a vertex),
//     confirmed by the article - so bishops keep their colour exactly as the
//     classical rule demands.
//   - Knight: through an edge, then one of the two far edges. 10 jumps,
//     verbatim from the article.
//   - Queen: rook rays + bishop rays. King: one crossing of either kind
//     (5 + 5 = 10 destinations).
//   - Pawn: carries a heading, which is the NEXT crossing of its personal
//     geodesic - alternately an edge and a corner. It captures across the
//     two features flanking its heading (corners flanking a heading edge,
//     edges flanking a heading corner), double-steps from its start, and
//     promotes to queen when its heading faces a wall.
//
// One geometric consequence of odd p: a pentagon has no half-turn about its
// centre, so the gluing across an edge is a pi-rotation about the edge
// MIDPOINT (an involution), not a translation - each generator is its own
// inverse and a cell's entry feature index equals the exit feature index of
// its neighbour.
//
// Setup mirrors the {4,6} board: queens face off 7 spine steps apart along a
// central geodesic (the disk's y-axis), each back rank runs along the two
// most-sideways geodesic rays through its queen cell (the rank bends away
// from the enemy - a pentagon admits no geodesic perpendicular to the spine
// through a spine cell), pawns line the same construction one spine step
// forward, and the board ends at walls half a step behind each army and
// equidistant curves outside the rooks.

import { Color, GameModule, GameResult, opponentOf } from '../core.ts';
import {
  C, Mob, MOB_ID, mobMul, mobInverse, mobApply, mobTranslation0, mobRotAbout,
  mobDistRatio, diskSpineCoords,
} from './hyperchess.ts';

export type PentaPieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';

export interface PentaPiece {
  type: PentaPieceType;
  color: Color;
  // Pawns only: the next crossing of the pawn's geodesic - 0..4 = edge e,
  // 5..9 = corner (h-5). Null otherwise.
  heading: number | null;
}

// ==================== {5,4} CONSTANTS ====================
// Right fundamental triangle of {p,q}={5,4}: cosh(inradius) = cos(pi/q)/sin(pi/p),
// cosh(circumradius) = cot(pi/p) cot(pi/q).
export const PENTA_INRADIUS = Math.acosh(Math.cos(Math.PI / 4) / Math.sin(Math.PI / 5));
export const PENTA_CIRCUMRADIUS = Math.acosh(1 / Math.tan(Math.PI / 5));
const STEP = 2 * PENTA_INRADIUS;

// Base pentagon: edge 0 faces NORTH so the spine is the disk's y-axis
// (diskSpineCoords assumes that). Edge e faces 90deg + e*72deg; corner m sits
// between edges m and m+1 at 90deg + m*72deg + 36deg. Edge e spans corners
// (e+4)%5 and e. Feature opposite edge e = corner (e+2)%5; feature opposite
// corner m = edge (m+3)%5.
const EDGE_ANG = (e: number): number => Math.PI / 2 + (e * 2 * Math.PI) / 5;
const CORNER_ANG = (m: number): number => Math.PI / 2 + (m * 2 * Math.PI) / 5 + Math.PI / 5;
const cPolar = (r: number, th: number): C => ({ re: r * Math.cos(th), im: r * Math.sin(th) });

const EDGE_MID_BASE: C[] = [0, 1, 2, 3, 4].map(e => cPolar(Math.tanh(PENTA_INRADIUS / 2), EDGE_ANG(e)));
const CORNER_BASE: C[] = [0, 1, 2, 3, 4].map(m => cPolar(Math.tanh(PENTA_CIRCUMRADIUS / 2), CORNER_ANG(m)));

// Gluing generators, both involutions:
//   T[e] = pi-rotation about edge e's midpoint (edge-neighbour gluing)
//   V[m] = pi-rotation about corner m (the across-the-vertex step)
const T: Mob[] = EDGE_MID_BASE.map(p => mobRotAbout(p, Math.PI));
const V: Mob[] = CORNER_BASE.map(p => mobRotAbout(p, Math.PI));

// ==================== SETUP TRANSFORMS (region depends on them) ====================
// Spine walk: from the origin cell, north crossings alternate edge 0 / corner
// 2 (both features lie on the y-axis), so the spine is a single geodesic.
function spineTransform(k: number): Mob {
  let t = MOB_ID;
  for (let i = 0; i < Math.abs(k); i++) {
    // Northward the next crossing alternates edge 0, corner 2; southward
    // corner 2, edge 0. The generators are involutions, so walking south is
    // just the opposite alternation phase.
    const north = k > 0;
    const edgeFirst = north ? i % 2 === 0 : i % 2 === 1;
    t = mobMul(t, edgeFirst ? T[0] : V[2]);
  }
  return t;
}

const WHITE_Q_STEP = -4;
const BLACK_Q_STEP = 3;

interface RayCrossing {
  t: Mob;             // frame of the cell the crossing leads to
  entry: number;      // feature index used (edge e or corner m of the PREVIOUS frame)
  viaEdge: boolean;
}

// One geodesic step in transform space: cross `feature` (edge if viaEdge) of
// the cell with frame `t`. Involutive gluing => the entry feature index in
// the new frame equals the feature index crossed.
function crossT(t: Mob, feature: number, viaEdge: boolean): Mob {
  return mobMul(t, viaEdge ? T[feature] : V[feature]);
}

// Continue a geodesic: entered the current cell through `entry`
// (edge if viaEdge); the next crossing is the opposite feature.
function nextCrossing(entry: number, viaEdge: boolean): { feature: number; viaEdge: boolean } {
  return viaEdge
    ? { feature: (entry + 2) % 5, viaEdge: false }   // opposite of edge e = corner e+2
    : { feature: (entry + 3) % 5, viaEdge: true };   // opposite of corner m = edge m+3
}

// Walk a geodesic ray in transform space, returning the successive cell
// frames after each crossing.
function rayTransforms(start: Mob, feature: number, viaEdge: boolean, steps: number): Mob[] {
  const out: Mob[] = [];
  let t = start;
  let f = feature;
  let ve = viaEdge;
  for (let i = 0; i < steps; i++) {
    t = crossT(t, f, ve);
    out.push(t);
    const nx = nextCrossing(f, ve);
    f = nx.feature;
    ve = nx.viaEdge;
  }
  return out;
}

const center = (t: Mob): C => mobApply(t, { re: 0, im: 0 });

// The two most-sideways geodesic rays through a cell, bending AWAY from the
// enemy (dir = +1 when the enemy is north). A pentagon has no east-west
// geodesic through a spine cell: the closest rays sit 18deg off the equator,
// one pair climbing toward the enemy and one falling away; the rank uses the
// falling pair so the pawns in front actually shield it.
function armStarts(t: Mob, enemyNorth: boolean): { feature: number; viaEdge: boolean }[] {
  const z0 = center(t);
  const u0 = diskSpineCoords(z0).u;
  // Lateral position must be measured hyperbolically (signed spine distance v)
  // - raw disk x-offsets shrink toward the horizon and are useless far down
  // the spine.
  const sideOf = (z: C): number => Math.sign(z.re) * diskSpineCoords(z).v;
  const sv0 = sideOf(z0);
  interface Cand { feature: number; viaEdge: boolean; du: number; dv: number }
  const cands: Cand[] = [];
  for (let e = 0; e < 5; e++) {
    const c = center(crossT(t, e, true));
    cands.push({ feature: e, viaEdge: true, du: diskSpineCoords(c).u - u0, dv: sideOf(c) - sv0 });
  }
  for (let m = 0; m < 5; m++) {
    const c = center(crossT(t, m, false));
    cands.push({ feature: m, viaEdge: false, du: diskSpineCoords(c).u - u0, dv: sideOf(c) - sv0 });
  }
  const away = (d: Cand): boolean => (enemyNorth ? d.du < 0 : d.du > 0);
  const east = cands.filter(d => d.dv > 0.3 && away(d)).sort((a, b) => Math.abs(a.du) - Math.abs(b.du))[0];
  const west = cands.filter(d => d.dv < -0.3 && away(d)).sort((a, b) => Math.abs(a.du) - Math.abs(b.du))[0];
  if (!east || !west) throw new Error('pentachess: arm rays not found');
  return [east, west];
}

// Compose the full setup in transform space first; the board region derives
// from where the armies actually stand.
interface Placement { t: Mob; type: PentaPieceType; color: Color; pawn: boolean }
const PLACEMENTS: Placement[] = [];

for (const [color, qStep] of [['white', WHITE_Q_STEP], ['black', BLACK_Q_STEP]] as [Color, number][]) {
  const enemyNorth = color === 'white';
  const qT = spineTransform(qStep);

  // Back rank: queen on the spine, king-side arm east (K B N R), queen-side
  // arm west (B N R).
  PLACEMENTS.push({ t: qT, type: 'queen', color, pawn: false });
  const [eastStart, westStart] = armStarts(qT, enemyNorth);
  const eastArm = rayTransforms(qT, eastStart.feature, eastStart.viaEdge, 4);
  const westArm = rayTransforms(qT, westStart.feature, westStart.viaEdge, 3);
  const eastTypes: PentaPieceType[] = ['king', 'bishop', 'knight', 'rook'];
  const westTypes: PentaPieceType[] = ['bishop', 'knight', 'rook'];
  eastArm.forEach((t, i) => PLACEMENTS.push({ t, type: eastTypes[i], color, pawn: false }));
  westArm.forEach((t, i) => PLACEMENTS.push({ t, type: westTypes[i], color, pawn: false }));

  // Pawn line: same construction one spine step toward the enemy.
  const pT = spineTransform(qStep + (enemyNorth ? 1 : -1));
  PLACEMENTS.push({ t: pT, type: 'pawn', color, pawn: true });
  const [pEast, pWest] = armStarts(pT, enemyNorth);
  for (const [start, len] of [[pEast, 4], [pWest, 3]] as [typeof pEast, number][]) {
    rayTransforms(pT, start.feature, start.viaEdge, len)
      .forEach(t => PLACEMENTS.push({ t, type: 'pawn', color, pawn: true }));
  }
}

// ==================== BOARD REGION ====================
let U_MIN = Infinity;
let U_MAX = -Infinity;
let SIDE_MAX = 0;
for (const p of PLACEMENTS) {
  const { u, v } = diskSpineCoords(center(p.t));
  U_MIN = Math.min(U_MIN, u);
  U_MAX = Math.max(U_MAX, u);
  SIDE_MAX = Math.max(SIDE_MAX, v);
}
U_MIN -= 0.5 * STEP;
U_MAX += 0.5 * STEP;
SIDE_MAX += 0.5 * PENTA_INRADIUS;

function inRegion(z: C): boolean {
  const { u, v } = diskSpineCoords(z);
  return u >= U_MIN && u <= U_MAX && v <= SIDE_MAX;
}

// ==================== TILING GENERATION ====================
export interface PentaCell {
  id: number;
  transform: Mob;
  center: C;
  corners: C[]; // 5, base corner order
  light: boolean;
}

const CELLS: PentaCell[] = [];
const NEIGHBORS: (number | null)[][] = [];          // [cell][edge 0..4]
const VOPP: ({ cell: number; corner: number } | null)[][] = []; // [cell][corner 0..4]
const KNIGHT: number[][] = [];

const BUCKET = 1e-3;
const MATCH_RATIO = Math.tanh(0.25);
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
        if (mobDistRatio(CELLS[id].center, z) < MATCH_RATIO) return id;
      }
    }
  }
  return null;
}

function addCell(transform: Mob): number {
  const id = CELLS.length;
  const c = center(transform);
  CELLS.push({
    id,
    transform,
    center: c,
    corners: CORNER_BASE.map(p => mobApply(transform, p)),
    light: false,
  });
  const key = bucketKey(c);
  const list = buckets.get(key);
  if (list) list.push(id);
  else buckets.set(key, [id]);
  return id;
}

function buildBoard(): void {
  addCell(MOB_ID);
  for (let i = 0; i < CELLS.length; i++) {
    for (let e = 0; e < 5; e++) {
      const t = mobMul(CELLS[i].transform, T[e]);
      const z = center(t);
      if (lookupCell(z) !== null) continue;
      if (!inRegion(z)) continue;
      addCell(t);
    }
  }

  for (const cell of CELLS) {
    NEIGHBORS.push([0, 1, 2, 3, 4].map(e => lookupCell(center(mobMul(cell.transform, T[e])))));
  }

  // Checkerboard: {5,4} adjacency cycles are the 4-cycles around vertices, so
  // the 2-colouring is globally consistent - assert it on every edge.
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
        throw new Error('pentachess: checkerboard coloring inconsistent');
      }
    }
  }
  if (seen.some(s => !s)) throw new Error('pentachess: board region is not connected');

  // Across-the-vertex steps: the unique opposite cell at each corner, with
  // the entry corner recorded for ray continuation. Vertex crossings must
  // preserve colour - assert it (this validates the whole geometry).
  for (const cell of CELLS) {
    const perCorner: ({ cell: number; corner: number } | null)[] = [];
    for (let m = 0; m < 5; m++) {
      const target = lookupCell(center(mobMul(cell.transform, V[m])));
      if (target === null) {
        perCorner.push(null);
        continue;
      }
      const v = cell.corners[m];
      let best = 0;
      let bestD = Infinity;
      for (let k = 0; k < 5; k++) {
        const d = mobDistRatio(CELLS[target].corners[k], v);
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      }
      if (bestD > 0.1) throw new Error('pentachess: vertex entry corner mismatch');
      if (CELLS[target].light !== cell.light) throw new Error('pentachess: vertex step changes colour');
      perCorner.push({ cell: target, corner: best });
    }
    VOPP.push(perCorner);
  }

  // Knight: through edge e, then one of the two far edges of the entered
  // cell (the edges flanking the entry edge's opposite corner).
  for (const cell of CELLS) {
    const dests = new Set<number>();
    for (let e = 0; e < 5; e++) {
      const mid = NEIGHBORS[cell.id][e];
      if (mid === null) continue;
      const x = NEIGHBORS[mid].indexOf(cell.id);
      for (const far of [(x + 2) % 5, (x + 3) % 5]) {
        const d = NEIGHBORS[mid][far];
        if (d !== null && d !== cell.id) dests.add(d);
      }
    }
    KNIGHT.push([...dests]);
  }
}

function entryEdge(cell: number, from: number): number {
  const e = NEIGHBORS[cell].indexOf(from);
  if (e < 0) throw new Error('pentachess: entryEdge on non-adjacent cells');
  return e;
}

// ==================== SETUP ====================
export type PentaBoard = Map<number, PentaPiece>;

export interface PentaState {
  board: PentaBoard;
  turn: Color;
  gameOver: Color | 'draw' | null;
}

export interface PentaMove {
  from: number;
  to: number;
}

const PAWN_START: Record<Color, Set<number>> = { white: new Set(), black: new Set() };
let INITIAL_BOARD: PentaBoard;
export let PENTA_VIEW_HOME: C;

function cellAt(t: Mob): number {
  const id = lookupCell(center(t));
  if (id === null) throw new Error('pentachess: setup cell missing from board');
  return id;
}

// Heading whose crossing moves the pawn most toward the enemy (max |du| the
// right way); scans all 10 features of the stored cell.
function headingToward(cellId: number, enemyNorth: boolean): number {
  const t = CELLS[cellId].transform;
  const u0 = diskSpineCoords(CELLS[cellId].center).u;
  let best = 0;
  let bestDu = -Infinity;
  for (let h = 0; h < 10; h++) {
    const viaEdge = h < 5;
    const c = center(mobMul(t, viaEdge ? T[h] : V[h - 5]));
    const du = (diskSpineCoords(c).u - u0) * (enemyNorth ? 1 : -1);
    if (du > bestDu) {
      bestDu = du;
      best = h;
    }
  }
  return best;
}

function buildSetup(): void {
  INITIAL_BOARD = new Map();
  for (const p of PLACEMENTS) {
    const id = cellAt(p.t);
    if (INITIAL_BOARD.has(id)) throw new Error('pentachess: setup collision');
    const heading = p.pawn ? headingToward(id, p.color === 'white') : null;
    INITIAL_BOARD.set(id, { type: p.type, color: p.color, heading });
    if (p.pawn) PAWN_START[p.color].add(id);
  }

  // "Place the white queen on a light square": fix the global parity.
  const whiteQueen = cellAt(spineTransform(WHITE_Q_STEP));
  if (!CELLS[whiteQueen].light) {
    for (const cell of CELLS) cell.light = !cell.light;
  }
  PENTA_VIEW_HOME = CELLS[whiteQueen].center;
}

buildBoard();
buildSetup();

export function pentaCells(): readonly PentaCell[] {
  return CELLS;
}

export function pentaNeighbors(cell: number): readonly (number | null)[] {
  return NEIGHBORS[cell];
}

export const PENTA_CELL_COUNT = CELLS.length;

// Closed boundary polyline of the base pentagon (corners + geodesic edge
// samples): points 4e..4e+4 trace edge e (wrapping at 20).
export const PENTA_BASE_BOUNDARY: C[] = [];
{
  const SAMPLES = 3;
  for (let e = 0; e < 5; e++) {
    const from = CORNER_BASE[(e + 4) % 5];
    const to = CORNER_BASE[e];
    PENTA_BASE_BOUNDARY.push(from);
    const t0 = mobTranslation0(from);
    const local = mobApply(mobInverse(t0), to);
    const dist = Math.atanh(Math.hypot(local.re, local.im));
    const dir = Math.atan2(local.im, local.re);
    for (let s = 1; s <= SAMPLES; s++) {
      const r = Math.tanh((dist * s) / (SAMPLES + 1));
      PENTA_BASE_BOUNDARY.push(mobApply(t0, cPolar(r, dir)));
    }
  }
}

// ==================== MOVE GENERATION ====================
type PentaCtx = Pick<PentaState, 'board'>;

// Rook ray: alternating edge / vertex crossings, starting across edge e.
function slideRook(ctx: PentaCtx, from: number, color: Color, dests: Set<number>): void {
  for (let e = 0; e < 5; e++) {
    let cur = NEIGHBORS[from][e];
    let entry = cur !== null ? entryEdge(cur, from) : 0;
    let viaEdge = true;
    for (let guard = 0; cur !== null && guard <= CELLS.length; guard++) {
      const occ = ctx.board.get(cur);
      if (occ) {
        if (occ.color !== color) dests.add(cur);
        break;
      }
      dests.add(cur);
      const nx = nextCrossing(entry, viaEdge);
      if (nx.viaEdge) {
        const t = NEIGHBORS[cur][nx.feature];
        if (t === null) break;
        entry = entryEdge(t, cur);
        cur = t;
      } else {
        const st = VOPP[cur][nx.feature];
        if (!st) break;
        entry = st.corner;
        cur = st.cell;
      }
      viaEdge = nx.viaEdge;
    }
  }
}

// Bishop ray: vertex crossings only, continuation corner (entry + 2 + sense),
// sense alternating - the {4,6} bishop's construction with the half-turn
// vertex step of {5,4}. Colour-preserving by the VOPP assert.
function slideBishop(ctx: PentaCtx, from: number, color: Color, dests: Set<number>): void {
  for (let m = 0; m < 5; m++) {
    for (let s0 = 0; s0 < 2; s0++) {
      let cur = from;
      let corner = m;
      let sense = s0;
      for (let guard = 0; guard <= CELLS.length; guard++) {
        const step = VOPP[cur][corner];
        if (!step) break;
        const occ = ctx.board.get(step.cell);
        if (occ) {
          if (occ.color !== color) dests.add(step.cell);
          break;
        }
        dests.add(step.cell);
        cur = step.cell;
        corner = (step.corner + 2 + sense) % 5;
        sense = 1 - sense;
      }
    }
  }
}

// Pawn helpers: the heading is the next crossing (edge h, or corner h-5).
function pawnForward(cell: number, h: number): { to: number; heading: number } | null {
  if (h < 5) {
    const to = NEIGHBORS[cell][h];
    if (to === null) return null;
    const x = entryEdge(to, cell);
    return { to, heading: 5 + ((x + 2) % 5) };
  }
  const st = VOPP[cell][h - 5];
  if (!st) return null;
  return { to: st.cell, heading: (st.corner + 3) % 5 };
}

// Capture squares: across the two features flanking the heading feature.
function pawnCaptureSquares(cell: number, h: number): number[] {
  const out: number[] = [];
  if (h < 5) {
    for (const m of [(h + 4) % 5, h]) {
      const st = VOPP[cell][m];
      if (st) out.push(st.cell);
    }
  } else {
    const m = h - 5;
    for (const e of [m, (m + 1) % 5]) {
      const t = NEIGHBORS[cell][e];
      if (t !== null) out.push(t);
    }
  }
  return out;
}

// Transported heading after a capture: nearest feature of the target cell to
// the old heading feature's midpoint pushed along the pure translation
// between the centres (the {4,6} pawn's parallel transport, generalized to
// both feature kinds).
function transportHeading(from: number, h: number, to: number): number {
  const cFrom = CELLS[from].center;
  const cTo = CELLS[to].center;
  const tA = mobTranslation0(cFrom);
  const local = mobApply(mobInverse(tA), cTo);
  const translate = mobMul(mobMul(tA, mobTranslation0(local)), mobInverse(tA));
  const featurePoint = h < 5 ? EDGE_MID_BASE[h] : CORNER_BASE[h - 5];
  const p = mobApply(translate, mobApply(CELLS[from].transform, featurePoint));
  let best = 0;
  let bestD = Infinity;
  for (let f = 0; f < 10; f++) {
    const base = f < 5 ? EDGE_MID_BASE[f] : CORNER_BASE[f - 5];
    const d = mobDistRatio(mobApply(CELLS[to].transform, base), p);
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best;
}

function pseudoDestinations(ctx: PentaCtx, from: number): Set<number> {
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
      for (let m = 0; m < 5; m++) {
        const st = VOPP[from][m];
        if (!st) continue;
        const occ = ctx.board.get(st.cell);
        if (!occ || occ.color !== piece.color) dests.add(st.cell);
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
      const fwd = pawnForward(from, h);
      if (fwd && !ctx.board.get(fwd.to)) {
        dests.add(fwd.to);
        if (PAWN_START[piece.color].has(from)) {
          const fwd2 = pawnForward(fwd.to, fwd.heading);
          if (fwd2 && !ctx.board.get(fwd2.to)) dests.add(fwd2.to);
        }
      }
      for (const cap of pawnCaptureSquares(from, h)) {
        const occ = ctx.board.get(cap);
        if (occ && occ.color !== piece.color) dests.add(cap);
      }
      break;
    }
  }

  return dests;
}

// ==================== CHECK / CHECKMATE ====================
function findKing(board: PentaBoard, color: Color): number | null {
  for (const [cell, p] of board) {
    if (p.type === 'king' && p.color === color) return cell;
  }
  return null;
}

function isAttacked(ctx: PentaCtx, target: number, byColor: Color): boolean {
  for (const [cell, p] of ctx.board) {
    if (p.color === byColor && pseudoDestinations(ctx, cell).has(target)) return true;
  }
  return false;
}

export function isPentaInCheck(ctx: PentaCtx, color: Color): boolean {
  const king = findKing(ctx.board, color);
  return king !== null ? isAttacked(ctx, king, opponentOf(color)) : false;
}

function moveLeavesKingInCheck(state: PentaState, from: number, to: number): boolean {
  const piece = state.board.get(from);
  if (!piece) return false;
  const clone = new Map(state.board);
  clone.delete(from);
  clone.set(to, piece);
  return isPentaInCheck({ board: clone }, piece.color);
}

export function pentaLegalDestinations(state: PentaState, from: number): Set<number> {
  const legal = new Set<number>();
  for (const dest of pseudoDestinations(state, from)) {
    if (!moveLeavesKingInCheck(state, from, dest)) legal.add(dest);
  }
  return legal;
}

export function hasAnyLegalMove(state: PentaState, color: Color): boolean {
  for (const [cell, p] of state.board) {
    if (p.color === color && pentaLegalDestinations(state, cell).size > 0) return true;
  }
  return false;
}

export function pentaCheckedKingCell(state: PentaState): number | null {
  if (state.gameOver === 'draw') return null;
  const king = findKing(state.board, state.turn);
  return king !== null && isPentaInCheck(state, state.turn) ? king : null;
}

// ==================== STATE TRANSITIONS ====================
export function initialPentaState(): PentaState {
  const state: PentaState = {
    board: new Map([...INITIAL_BOARD].map(([cell, p]) => [cell, { ...p }])),
    turn: 'white',
    gameOver: null,
  };
  if (!hasAnyLegalMove(state, state.turn)) {
    state.gameOver = isPentaInCheck(state, state.turn) ? opponentOf(state.turn) : 'draw';
  }
  return state;
}

export function applyPentaMove(state: PentaState, from: number, to: number): PentaState {
  const board = new Map(state.board);
  const mover = state.turn;
  const source = board.get(from)!;
  const moved: PentaPiece = { ...source };

  if (source.type === 'pawn') {
    const h = source.heading!;
    const fwd = pawnForward(from, h);
    if (fwd && to === fwd.to) {
      moved.heading = fwd.heading;
    } else if (fwd && !state.board.get(fwd.to)) {
      const fwd2 = pawnForward(fwd.to, fwd.heading);
      if (fwd2 && fwd2.to === to) {
        moved.heading = fwd2.heading; // double-step through the intermediate cell
      } else {
        moved.heading = transportHeading(from, h, to);
      }
    } else {
      moved.heading = transportHeading(from, h, to);
    }
    // Promote when the heading faces a wall (no next crossing).
    if (pawnForward(to, moved.heading!) === null) {
      moved.type = 'queen';
      moved.heading = null;
    }
  }

  board.delete(from);
  board.set(to, moved);

  const turn = opponentOf(mover);
  const next: PentaState = { board, turn, gameOver: null };
  if (!hasAnyLegalMove(next, turn)) {
    next.gameOver = isPentaInCheck(next, turn) ? mover : 'draw';
  }
  return next;
}

// ==================== MODULE ====================
interface PentaSnapshot {
  board: Record<string, PentaPiece>;
  turn: Color;
  gameOver: Color | 'draw' | null;
}

function pentaResult(state: PentaState): GameResult {
  if (!state.gameOver) return { status: 'active', turn: state.turn };
  return { status: 'done', winner: state.gameOver };
}

export const pentaModule: GameModule<PentaState, PentaMove, null> = {
  id: 'pentachess',
  name: 'Pentagonal Chess',
  boardFamily: 'hyperbolic-54',
  catalog: {
    group: 'Hyperbolic',
    board: '{5,4} hyperbolic plane',
    surface: '{5,4} tiling of the hyperbolic plane',
    spec: [
      `${PENTA_CELL_COUNT} PENTAGONS, FOUR PER VERTEX`,
      'ROOK: 5 RAYS ALTERNATING EDGE / VERTEX',
      'BISHOP: 10 VERTEX RAYS, KEEPS COLOUR',
      'KNIGHT: 10 JUMPS (EDGE THEN FAR EDGE)',
    ],
    badge: 'HYPERBOLIC BOARD',
    preview: 'penta',
  },
  initialState: () => initialPentaState(),
  isLegalMove: (state, move) => {
    if (state.gameOver) return false;
    const piece = state.board.get(move.from);
    if (!piece || piece.color !== state.turn) return false;
    return pentaLegalDestinations(state, move.from).has(move.to);
  },
  applyMove: (state, move) => {
    const next = applyPentaMove(state, move.from, move.to);
    return { state: next, result: pentaResult(next) };
  },
  serialize: (state): PentaSnapshot => ({
    board: Object.fromEntries([...state.board].map(([cell, p]) => [String(cell), p])),
    turn: state.turn,
    gameOver: state.gameOver,
  }),
  deserialize: (data) => {
    const d = data as PentaSnapshot;
    return {
      board: new Map(Object.entries(d.board).map(([cell, p]) => [Number(cell), p])),
      turn: d.turn,
      gameOver: d.gameOver,
    };
  },
};
