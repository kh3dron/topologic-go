// Pure Gliński hexagonal chess engine. This is NOT a topology on the square
// lattice - it is a different board geometry, so it lives outside the
// project()/TOPOLOGIES machinery in its own board family ('hex-glinski'). The
// board is the radius-5 hexagon of axial cells { (q,r) : |q|<=5, |r|<=5,
// |q+r|<=5 } = 91 cells, 11 files a-l (no j) of heights 6..11..6, with three
// cell colours. Rules follow Wladyslaw Gliński (1936/1973). No module globals:
// the full HexState flows in and out explicitly.

import { Color, GameModule, GameResult, opponentOf } from '../core.ts';

export type HexPieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';

export interface HexPiece {
  type: HexPieceType;
  color: Color;
}

export const HEX_RADIUS = 5;

// Files a-l, skipping j (chess convention). File index = q + HEX_RADIUS.
const FILE_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'k', 'l'];

export function hexOnBoard(q: number, r: number): boolean {
  return Math.abs(q) <= HEX_RADIUS && Math.abs(r) <= HEX_RADIUS && Math.abs(q + r) <= HEX_RADIUS;
}

export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

export function parseHexKey(key: string): [number, number] {
  const [q, r] = key.split(',').map(Number);
  return [q, r];
}

export function allHexCells(): [number, number][] {
  const cells: [number, number][] = [];
  for (let q = -HEX_RADIUS; q <= HEX_RADIUS; q++) {
    for (let r = -HEX_RADIUS; r <= HEX_RADIUS; r++) {
      if (hexOnBoard(q, r)) cells.push([q, r]);
    }
  }
  return cells;
}

// Three colours. Bishop steps preserve (r - q) mod 3, so each of the three
// bishops stays on its own colour forever - the reason hex chess has three.
export function hexColorIndex(q: number, r: number): number {
  return ((r - q) % 3 + 3) % 3;
}

export function hexFileLabel(q: number): string {
  return FILE_LETTERS[q + HEX_RADIUS];
}

// Rank counts up from White's end (largest r) of each file.
function rankMaxR(q: number): number {
  return Math.min(HEX_RADIUS, HEX_RADIUS - q);
}

export function hexRankLabel(q: number, r: number): number {
  return rankMaxR(q) - r + 1;
}

export function hexCellName(q: number, r: number): string {
  return `${hexFileLabel(q)}${hexRankLabel(q, r)}`;
}

// ==================== DIRECTIONS ====================
const ROOK_DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, -1], [-1, 1]];
const BISHOP_DIRS = [[1, 1], [-1, -1], [1, -2], [-1, 2], [2, -1], [-2, 1]];
const KNIGHT_OFFSETS = [
  [1, -3], [2, -3], [3, -2], [3, -1],
  [-1, 3], [-2, 3], [-3, 2], [-3, 1],
  [1, 2], [2, 1], [-1, -2], [-2, -1],
];

function pawnForward(color: Color): number {
  return color === 'white' ? -1 : 1;
}
function pawnCaptureDirs(color: Color): number[][] {
  return color === 'white' ? [[1, -1], [-1, 0]] : [[1, 0], [-1, 1]];
}

// ==================== STATE ====================
export type HexBoard = Map<string, HexPiece>;

export interface EnPassant {
  target: string; // cell a capturer moves onto
  victim: string; // pawn removed
}

export interface HexState {
  board: HexBoard;
  turn: Color;
  gameOver: Color | 'draw' | null;
  enPassant: EnPassant | null;
  whitePawnStarts: Set<string>;
  blackPawnStarts: Set<string>;
}

export interface HexMove {
  from: string;
  to: string;
}

// Board context needed by move generation / attack detection.
type HexCtx = Pick<HexState, 'board' | 'enPassant' | 'whitePawnStarts' | 'blackPawnStarts'>;

// White starting cells in axial coords; algebraic name in comments. Black is
// the vertical mirror (q, r) -> (q, -q-r), so the two kings face down file g.
const WHITE_SETUP: [number, number, HexPieceType][] = [
  [-3, 5, 'rook'],   // c1
  [3, 2, 'rook'],    // i1
  [-2, 5, 'knight'], // d1
  [2, 3, 'knight'],  // h1
  [0, 5, 'bishop'],  // f1
  [0, 4, 'bishop'],  // f2
  [0, 3, 'bishop'],  // f3
  [-1, 5, 'queen'],  // e1
  [1, 4, 'king'],    // g1
  [-4, 5, 'pawn'],   // b1
  [-3, 4, 'pawn'],   // c2
  [-2, 3, 'pawn'],   // d3
  [-1, 2, 'pawn'],   // e4
  [0, 1, 'pawn'],    // f5
  [1, 1, 'pawn'],    // g4
  [2, 1, 'pawn'],    // h3
  [3, 1, 'pawn'],    // i2
  [4, 1, 'pawn'],    // k1
];

export function initialHexState(): HexState {
  const board: HexBoard = new Map();
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

  const state: HexState = {
    board,
    turn: 'white',
    gameOver: null,
    enPassant: null,
    whitePawnStarts,
    blackPawnStarts,
  };

  if (!hasAnyLegalMove(state, state.turn)) {
    state.gameOver = isHexInCheck(state, state.turn) ? opponentOf(state.turn) : 'draw';
  }
  return state;
}

// ==================== MOVE GENERATION ====================
function pseudoDestinations(ctx: HexCtx, fromKey: string): Set<string> {
  const dests = new Set<string>();
  const piece = ctx.board.get(fromKey);
  if (!piece) return dests;
  const [q, r] = parseHexKey(fromKey);

  const step = (dirs: number[][]) => {
    for (const [dq, dr] of dirs) {
      const nq = q + dq, nr = r + dr;
      if (!hexOnBoard(nq, nr)) continue;
      const occ = ctx.board.get(hexKey(nq, nr));
      if (!occ || occ.color !== piece.color) dests.add(hexKey(nq, nr));
    }
  };

  const slide = (dirs: number[][]) => {
    for (const [dq, dr] of dirs) {
      for (let t = 1; ; t++) {
        const nq = q + dq * t, nr = r + dr * t;
        if (!hexOnBoard(nq, nr)) break;
        const k = hexKey(nq, nr);
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
      const fq = q, fr = r + dir;
      if (hexOnBoard(fq, fr) && !ctx.board.get(hexKey(fq, fr))) {
        dests.add(hexKey(fq, fr));
        const starts = piece.color === 'white' ? ctx.whitePawnStarts : ctx.blackPawnStarts;
        if (starts.has(fromKey)) {
          const dq = q, dr2 = r + 2 * dir;
          if (hexOnBoard(dq, dr2) && !ctx.board.get(hexKey(dq, dr2))) dests.add(hexKey(dq, dr2));
        }
      }
      for (const [cdq, cdr] of pawnCaptureDirs(piece.color)) {
        const cq = q + cdq, cr = r + cdr;
        if (!hexOnBoard(cq, cr)) continue;
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
function findKing(board: HexBoard, color: Color): string | null {
  for (const [k, p] of board) {
    if (p.type === 'king' && p.color === color) return k;
  }
  return null;
}

function isAttacked(ctx: HexCtx, targetKey: string, byColor: Color): boolean {
  for (const [k, p] of ctx.board) {
    if (p.color === byColor && pseudoDestinations(ctx, k).has(targetKey)) return true;
  }
  return false;
}

export function isHexInCheck(ctx: HexCtx, color: Color): boolean {
  const kingKey = findKing(ctx.board, color);
  return kingKey ? isAttacked(ctx, kingKey, opponentOf(color)) : false;
}

function moveLeavesKingInCheck(state: HexState, fromKey: string, toKey: string): boolean {
  const piece = state.board.get(fromKey);
  if (!piece) return false;

  const clone = new Map(state.board);
  clone.delete(fromKey);
  clone.set(toKey, piece);
  if (piece.type === 'pawn' && state.enPassant && toKey === state.enPassant.target && !state.board.get(toKey)) {
    clone.delete(state.enPassant.victim);
  }

  return isHexInCheck({ ...state, board: clone }, piece.color);
}

export function hexLegalDestinations(state: HexState, fromKey: string): Set<string> {
  const legal = new Set<string>();
  for (const dest of pseudoDestinations(state, fromKey)) {
    if (!moveLeavesKingInCheck(state, fromKey, dest)) legal.add(dest);
  }
  return legal;
}

export function hasAnyLegalMove(state: HexState, color: Color): boolean {
  for (const [k, p] of state.board) {
    if (p.color === color && hexLegalDestinations(state, k).size > 0) return true;
  }
  return false;
}

// King in check right now, for the render highlight.
export function hexCheckedKingKey(state: HexState): string | null {
  if (state.gameOver === 'draw') return null;
  const key = findKing(state.board, state.turn);
  return key && isHexInCheck(state, state.turn) ? key : null;
}

// ==================== STATE TRANSITIONS ====================
export function applyHexMove(state: HexState, fromKey: string, toKey: string): HexState {
  const board = new Map(state.board);
  const mover = state.turn;
  const source = board.get(fromKey)!;
  const [fq, fr] = parseHexKey(fromKey);
  const [, tr] = parseHexKey(toKey);
  const dir = pawnForward(source.color);

  const enPassantCapture = source.type === 'pawn' && state.enPassant &&
    toKey === state.enPassant.target && !board.get(toKey);

  const moved: HexPiece = { type: source.type, color: source.color };
  board.delete(fromKey);
  board.set(toKey, moved);
  if (enPassantCapture) board.delete(state.enPassant!.victim);

  // Set up en passant for the reply if this was a straight double-step.
  const enPassant = source.type === 'pawn' && Math.abs(tr - fr) === 2
    ? { target: hexKey(fq, fr + dir), victim: toKey }
    : null;

  // Promotion: reaching the end of a file (forward cell off the board).
  const [tq2, tr2] = parseHexKey(toKey);
  if (moved.type === 'pawn' && !hexOnBoard(tq2, tr2 + dir)) moved.type = 'queen';

  const turn = opponentOf(mover);
  const next: HexState = {
    board,
    turn,
    gameOver: null,
    enPassant,
    whitePawnStarts: state.whitePawnStarts,
    blackPawnStarts: state.blackPawnStarts,
  };
  if (!hasAnyLegalMove(next, turn)) {
    next.gameOver = isHexInCheck(next, turn) ? mover : 'draw';
  }
  return next;
}

// ==================== MODULE ====================
interface HexSnapshot {
  board: Record<string, HexPiece>;
  turn: Color;
  gameOver: Color | 'draw' | null;
  enPassant: EnPassant | null;
  whitePawnStarts: string[];
  blackPawnStarts: string[];
}

function hexResult(state: HexState): GameResult {
  if (!state.gameOver) return { status: 'active', turn: state.turn };
  return { status: 'done', winner: state.gameOver };
}

export const hexModule: GameModule<HexState, HexMove, null> = {
  id: 'hexchess',
  name: 'Hexagonal Chess',
  boardFamily: 'hex-glinski',
  catalog: {
    group: 'Hexagonal',
    board: 'Hexagon',
    surface: 'Glinski hexagonal grid',
    spec: ['91 HEX CELLS', 'THREE BISHOPS PER SIDE'],
    badge: 'HEXAGONAL BOARD',
  },
  initialState: () => initialHexState(),
  isLegalMove: (state, move) => {
    if (state.gameOver) return false;
    const piece = state.board.get(move.from);
    if (!piece || piece.color !== state.turn) return false;
    return hexLegalDestinations(state, move.from).has(move.to);
  },
  applyMove: (state, move) => {
    const next = applyHexMove(state, move.from, move.to);
    return { state: next, result: hexResult(next) };
  },
  serialize: (state): HexSnapshot => ({
    board: Object.fromEntries(state.board),
    turn: state.turn,
    gameOver: state.gameOver,
    enPassant: state.enPassant,
    whitePawnStarts: Array.from(state.whitePawnStarts),
    blackPawnStarts: Array.from(state.blackPawnStarts),
  }),
  deserialize: (data) => {
    const d = data as HexSnapshot;
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
