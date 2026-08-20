// Pure hex-torus chess engine: Glinski's rules on the hex torus. The Glinski
// hexagon does not tile the plane by translation, but its axial bounding
// rhombus does - the 11x11 rhombus { (q,r) : |q|<=5, |r|<=5 } (121 cells; the
// hexagon's 91 plus the 30 cut corners, which become ordinary empty cells).
// Gluing opposite rhombus edges by the two axial translations makes a torus:
//   projectHexTorus(q, r) = (wrap(q), wrap(r)),  wrap into [-5, 5] mod 11.
// Setup, piece movement, en passant and the double-step are Glinski's,
// untouched (no playability patches); every step of every line simply
// projects through the gluing, exactly like square-grid chess on the square
// torus. Whether the wrap decides the game at move zero is a census finding,
// not a design input.
//
// What the gluing changes, honestly reported:
//   - Promotion: "the end of the file" no longer exists, so pawns promote on
//     the seam row they march toward (r = -5 for white, r = +5 for black) -
//     the hex analogue of the square torus keeping rows 0/7.
//   - The three-colouring dies: bishop steps preserve (r - q) mod 3 in the
//     plane, but the period 11 is not divisible by 3, so crossing a seam
//     shifts the residue. A bishop can reach every cell; the classical
//     three-bishop arrangement loses its meaning here. Finding, not bug.
//   - Sliders can loop around the closed surface; rays are step-capped.

import { Color, GameModule, GameResult, opponentOf } from '../core.ts';
import {
  HexPiece, HexPieceType, EnPassant,
  ROOK_DIRS, BISHOP_DIRS, KNIGHT_OFFSETS, pawnForward, pawnCaptureDirs, WHITE_SETUP,
  hexKey, parseHexKey,
} from './hexchess.ts';

export type { HexPiece, HexPieceType };

export const HEXT_RADIUS = 5;
export const HEXT_N = 2 * HEXT_RADIUS + 1; // 11
const SLIDE_CAP = 4 * HEXT_N;

function wrap(v: number): number {
  return ((v + HEXT_RADIUS) % HEXT_N + HEXT_N) % HEXT_N - HEXT_RADIUS;
}

export function projectHexTorus(q: number, r: number): [number, number] {
  return [wrap(q), wrap(r)];
}

export function allHexTorusCells(): [number, number][] {
  const cells: [number, number][] = [];
  for (let q = -HEXT_RADIUS; q <= HEXT_RADIUS; q++) {
    for (let r = -HEXT_RADIUS; r <= HEXT_RADIUS; r++) cells.push([q, r]);
  }
  return cells;
}

// Canonical-cell colour, for rendering only: the plane 3-colouring restricted
// to the fundamental domain. Discontinuous across the seams by the argument
// in the header - that discontinuity is real, so the renderer shows it.
export function hexTorusColorIndex(q: number, r: number): number {
  return ((r - q) % 3 + 3) % 3;
}

// ==================== STATE ====================
export type HexTorusBoard = Map<string, HexPiece>;

export interface HexTorusState {
  board: HexTorusBoard;
  turn: Color;
  gameOver: Color | 'draw' | null;
  enPassant: EnPassant | null;
  whitePawnStarts: Set<string>;
  blackPawnStarts: Set<string>;
}

export interface HexTorusMove {
  from: string;
  to: string;
}

type Ctx = Pick<HexTorusState, 'board' | 'enPassant' | 'whitePawnStarts' | 'blackPawnStarts'>;

export function initialHexTorusState(): HexTorusState {
  const board: HexTorusBoard = new Map();
  const whitePawnStarts = new Set<string>();
  const blackPawnStarts = new Set<string>();

  for (const [q, r, type] of WHITE_SETUP) {
    board.set(hexKey(q, r), { type, color: 'white' });
    board.set(hexKey(q, -q - r), { type, color: 'black' });
    if (type === 'pawn') {
      whitePawnStarts.add(hexKey(q, r));
      blackPawnStarts.add(hexKey(q, -q - r));
    }
  }

  const state: HexTorusState = {
    board,
    turn: 'white',
    gameOver: null,
    enPassant: null,
    whitePawnStarts,
    blackPawnStarts,
  };
  if (!hasAnyLegalMove(state, state.turn)) {
    state.gameOver = isHexTorusInCheck(state, state.turn) ? opponentOf(state.turn) : 'draw';
  }
  return state;
}

// ==================== MOVE GENERATION ====================
function pseudoDestinations(ctx: Ctx, fromKey: string): Set<string> {
  const dests = new Set<string>();
  const piece = ctx.board.get(fromKey);
  if (!piece) return dests;
  const [q, r] = parseHexKey(fromKey);

  const step = (dirs: number[][]) => {
    for (const [dq, dr] of dirs) {
      const [nq, nr] = projectHexTorus(q + dq, r + dr);
      const k = hexKey(nq, nr);
      const occ = ctx.board.get(k);
      if (!occ || occ.color !== piece.color) dests.add(k);
    }
  };

  const slide = (dirs: number[][]) => {
    for (const [dq, dr] of dirs) {
      for (let t = 1; t <= SLIDE_CAP; t++) {
        const [nq, nr] = projectHexTorus(q + dq * t, r + dr * t);
        const k = hexKey(nq, nr);
        if (k === fromKey) break; // the ray closed a loop back onto its origin
        const occ = ctx.board.get(k);
        if (occ) {
          if (occ.color !== piece.color) dests.add(k);
          break;
        }
        dests.add(k);
      }
    }
  };

  switch (piece.type) {
    case 'rook': slide(ROOK_DIRS); break;
    case 'bishop': slide(BISHOP_DIRS); break;
    case 'queen': slide(ROOK_DIRS); slide(BISHOP_DIRS); break;
    case 'king': step(ROOK_DIRS); step(BISHOP_DIRS); break;
    case 'knight': step(KNIGHT_OFFSETS); break;
    case 'pawn': {
      const dir = pawnForward(piece.color);
      const [f1q, f1r] = projectHexTorus(q, r + dir);
      const fwd1 = hexKey(f1q, f1r);
      if (!ctx.board.get(fwd1)) {
        dests.add(fwd1);
        const starts = piece.color === 'white' ? ctx.whitePawnStarts : ctx.blackPawnStarts;
        if (starts.has(fromKey)) {
          const [f2q, f2r] = projectHexTorus(q, r + 2 * dir);
          const fwd2 = hexKey(f2q, f2r);
          if (!ctx.board.get(fwd2)) dests.add(fwd2);
        }
      }
      for (const [cdq, cdr] of pawnCaptureDirs(piece.color)) {
        const [cq, cr] = projectHexTorus(q + cdq, r + cdr);
        const k = hexKey(cq, cr);
        const occ = ctx.board.get(k);
        if (occ) {
          if (occ.color !== piece.color) dests.add(k);
        } else if (ctx.enPassant && ctx.enPassant.target === k) {
          dests.add(k);
        }
      }
      break;
    }
  }

  return dests;
}

// ==================== CHECK / CHECKMATE ====================
function findKing(board: HexTorusBoard, color: Color): string | null {
  for (const [k, p] of board) {
    if (p.type === 'king' && p.color === color) return k;
  }
  return null;
}

function isAttacked(ctx: Ctx, targetKey: string, byColor: Color): boolean {
  for (const [k, p] of ctx.board) {
    if (p.color === byColor && pseudoDestinations(ctx, k).has(targetKey)) return true;
  }
  return false;
}

export function isHexTorusInCheck(ctx: Ctx, color: Color): boolean {
  const kingKey = findKing(ctx.board, color);
  return kingKey ? isAttacked(ctx, kingKey, opponentOf(color)) : false;
}

function moveLeavesKingInCheck(state: HexTorusState, fromKey: string, toKey: string): boolean {
  const piece = state.board.get(fromKey);
  if (!piece) return false;
  const clone = new Map(state.board);
  clone.delete(fromKey);
  clone.set(toKey, piece);
  if (piece.type === 'pawn' && state.enPassant && toKey === state.enPassant.target && !state.board.get(toKey)) {
    clone.delete(state.enPassant.victim);
  }
  return isHexTorusInCheck({ ...state, board: clone }, piece.color);
}

export function hexTorusLegalDestinations(state: HexTorusState, fromKey: string): Set<string> {
  const legal = new Set<string>();
  for (const dest of pseudoDestinations(state, fromKey)) {
    if (!moveLeavesKingInCheck(state, fromKey, dest)) legal.add(dest);
  }
  return legal;
}

export function hasAnyLegalMove(state: HexTorusState, color: Color): boolean {
  for (const [k, p] of state.board) {
    if (p.color === color && hexTorusLegalDestinations(state, k).size > 0) return true;
  }
  return false;
}

export function hexTorusCheckedKingKey(state: HexTorusState): string | null {
  if (state.gameOver === 'draw') return null;
  const key = findKing(state.board, state.turn);
  return key && isHexTorusInCheck(state, state.turn) ? key : null;
}

// ==================== STATE TRANSITIONS ====================
export function applyHexTorusMove(state: HexTorusState, fromKey: string, toKey: string): HexTorusState {
  const board = new Map(state.board);
  const mover = state.turn;
  const source = board.get(fromKey)!;
  const [fq, fr] = parseHexKey(fromKey);
  const dir = pawnForward(source.color);

  const enPassantCapture = source.type === 'pawn' && state.enPassant &&
    toKey === state.enPassant.target && !board.get(toKey);

  const moved: HexPiece = { type: source.type, color: source.color };
  board.delete(fromKey);
  board.set(toKey, moved);
  if (enPassantCapture) board.delete(state.enPassant!.victim);

  // Double-step detection must project (a raw coordinate difference lies at
  // the seams): it was a double step iff the destination is the projected
  // two-forward cell of a start-cell pawn.
  const [f1q, f1r] = projectHexTorus(fq, fr + dir);
  const [f2q, f2r] = projectHexTorus(fq, fr + 2 * dir);
  const wasDouble = source.type === 'pawn' && toKey === hexKey(f2q, f2r) && toKey !== hexKey(f1q, f1r);
  const enPassant = wasDouble ? { target: hexKey(f1q, f1r), victim: toKey } : null;

  // Promotion on the seam row the pawn marches toward (see header).
  const [, tr] = parseHexKey(toKey);
  if (moved.type === 'pawn' && tr === (source.color === 'white' ? -HEXT_RADIUS : HEXT_RADIUS)) {
    moved.type = 'queen';
  }

  const turn = opponentOf(mover);
  const next: HexTorusState = {
    board,
    turn,
    gameOver: null,
    enPassant,
    whitePawnStarts: state.whitePawnStarts,
    blackPawnStarts: state.blackPawnStarts,
  };
  if (!hasAnyLegalMove(next, turn)) {
    next.gameOver = isHexTorusInCheck(next, turn) ? mover : 'draw';
  }
  return next;
}

// ==================== MODULE ====================
interface HexTorusSnapshot {
  board: Record<string, HexPiece>;
  turn: Color;
  gameOver: Color | 'draw' | null;
  enPassant: EnPassant | null;
  whitePawnStarts: string[];
  blackPawnStarts: string[];
}

function result(state: HexTorusState): GameResult {
  if (!state.gameOver) return { status: 'active', turn: state.turn };
  return { status: 'done', winner: state.gameOver };
}

export const hexTorusModule: GameModule<HexTorusState, HexTorusMove, null> = {
  id: 'hextorus',
  name: 'Hex Torus Chess',
  boardFamily: 'hex-torus',
  catalog: {
    group: 'Hexagonal',
    board: 'Hex torus',
    surface: '11x11 hex rhombus, opposite edges glued',
    spec: [
      '121 HEX CELLS, NO EDGES AT ALL',
      "GLINSKI'S RULES, SETUP UNTOUCHED",
      'PROMOTE ON THE SEAM ROW',
      'SEAMS KILL THE 3-COLOURING (11 % 3 != 0)',
    ],
    badge: 'HEX TORUS',
    preview: 'hextorus',
  },
  initialState: () => initialHexTorusState(),
  isLegalMove: (state, move) => {
    if (state.gameOver) return false;
    const piece = state.board.get(move.from);
    if (!piece || piece.color !== state.turn) return false;
    return hexTorusLegalDestinations(state, move.from).has(move.to);
  },
  applyMove: (state, move) => {
    const next = applyHexTorusMove(state, move.from, move.to);
    return { state: next, result: result(next) };
  },
  serialize: (state): HexTorusSnapshot => ({
    board: Object.fromEntries(state.board),
    turn: state.turn,
    gameOver: state.gameOver,
    enPassant: state.enPassant,
    whitePawnStarts: Array.from(state.whitePawnStarts),
    blackPawnStarts: Array.from(state.blackPawnStarts),
  }),
  deserialize: (data) => {
    const d = data as HexTorusSnapshot;
    return {
      board: new Map(Object.entries(d.board)),
      turn: d.turn,
      gameOver: d.gameOver,
      enPassant: d.enPassant,
      whitePawnStarts: new Set(d.whitePawnStarts),
      blackPawnStarts: new Set(d.blackPawnStarts),
    };
  },
};
