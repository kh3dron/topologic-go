// Pure chess engine. All rules are computed in the infinite plane and projected
// onto the board through the topology passed in, so one move generator works on
// every topology. No module globals: state (board, turn, topology) flows in and
// out explicitly, so this runs unchanged in the browser and on the server.

import { Topology, TOPOLOGY_MAP } from '../../topology.ts';
import { Color, GameModule, GameResult, opponentOf } from '../core.ts';

export type PieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';

export interface ChessPiece {
  type: PieceType;
  color: Color;
}

export type ChessBoard = (ChessPiece | null)[][];

export const CHESS_SIZE = 8;

export const PIECE_SYMBOLS: Record<Color, Record<PieceType, string>> = {
  white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
  black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' }
};

export type Sq = [number, number];

export interface ChessMove {
  from: Sq;
  to: Sq;
}

export interface CastlingRights {
  whiteK: boolean;
  whiteQ: boolean;
  blackK: boolean;
  blackQ: boolean;
}

// The one-ply en passant window: `target` is the square a pawn skipped with a
// double step (where the capturing pawn lands), `victim` the square the
// double-stepper landed on (whose pawn is removed). Both canonical - the
// double step is projected through the topology when the window is opened.
export interface EnPassant {
  target: Sq;
  victim: Sq;
}

// Rights + ep window threaded through move generation. Optional everywhere:
// attack maps (isSquareAttacked) deliberately omit it - castling never
// captures, and an en passant capture takes a pawn, never a king.
export interface MoveContext {
  castling: CastlingRights;
  ep: EnPassant | null;
}

export interface ChessState {
  board: ChessBoard;
  turn: Color;
  gameOver: Color | 'draw' | null;
  topo: Topology;
  castling: CastlingRights;
  ep: EnPassant | null;
}

export function contextOf(state: ChessState): MoveContext {
  return { castling: state.castling, ep: state.ep };
}

// The starting position is IDENTICAL on every topology - no per-topology
// adjustments, ever. Some topologies make the standard setup degenerate
// (e.g. on the torus the back ranks are glued, the kings start adjacent, and
// white is checkmated at move zero). That is deliberate: which topologies
// yield interesting games is an open research question for this project, and
// the engine's job is to evaluate the rules faithfully, not to patch them.
export function createInitialChessBoard(): ChessBoard {
  const board: ChessBoard = Array(CHESS_SIZE).fill(null).map(() => Array(CHESS_SIZE).fill(null));
  const backRow: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];

  for (let col = 0; col < CHESS_SIZE; col++) {
    board[0][col] = { type: backRow[col], color: 'black' };
    board[1][col] = { type: 'pawn', color: 'black' };
    board[6][col] = { type: 'pawn', color: 'white' };
    board[7][col] = { type: backRow[col], color: 'white' };
  }

  return board;
}

// ==================== MOVE GENERATION ====================
function proj(topo: Topology, row: number, col: number): Sq | null {
  return topo.project(row, col, CHESS_SIZE);
}

const KNIGHT_OFFSETS = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2],
  [1, -2], [1, 2], [2, -1], [2, 1]
];

const KING_OFFSETS = [
  [-1, -1], [-1, 0], [-1, 1], [0, -1],
  [0, 1], [1, -1], [1, 0], [1, 1]
];

const STRAIGHT_DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const DIAGONAL_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

const SLIDE_CAP = CHESS_SIZE * 4;

// Castling geometry. Every square involved lies inside the fundamental domain
// (the starting layout is identical on all topologies and project() is the
// identity there), so these are plain canonical coordinates; only the attack
// checks go through the topology - "castling through check" respects gluings
// automatically.
interface CastleSpec {
  kingFrom: Sq;
  kingTo: Sq;
  kingMid: Sq;    // square the king passes through; may not be attacked
  rookFrom: Sq;
  rookTo: Sq;
  empty: Sq[];    // must be vacant
}

function castleSpec(color: Color, side: 'k' | 'q'): CastleSpec {
  const row = color === 'white' ? 7 : 0;
  return side === 'k'
    ? { kingFrom: [row, 4], kingTo: [row, 6], kingMid: [row, 5], rookFrom: [row, 7], rookTo: [row, 5], empty: [[row, 5], [row, 6]] }
    : { kingFrom: [row, 4], kingTo: [row, 2], kingMid: [row, 3], rookFrom: [row, 0], rookTo: [row, 3], empty: [[row, 1], [row, 2], [row, 3]] };
}

function hasRight(c: CastlingRights, color: Color, side: 'k' | 'q'): boolean {
  if (color === 'white') return side === 'k' ? c.whiteK : c.whiteQ;
  return side === 'k' ? c.blackK : c.blackQ;
}

const eq = (a: Sq, b: Sq): boolean => a[0] === b[0] && a[1] === b[1];

// Structural castle conditions: rights intact, king and rook on their start
// squares, the corridor vacant. Check-related conditions live in legality.
// On exotic topologies a gluing can make the castle target reachable as a
// plain one-step king move; that plain move wins and the castle is not
// offered - the interpretation must be unambiguous for apply.
function castleAvailable(board: ChessBoard, topo: Topology, ctx: MoveContext, color: Color, from: Sq, side: 'k' | 'q'): boolean {
  if (!hasRight(ctx.castling, color, side)) return false;
  const s = castleSpec(color, side);
  if (!eq(from, s.kingFrom)) return false;
  const rook = board[s.rookFrom[0]][s.rookFrom[1]];
  if (!rook || rook.type !== 'rook' || rook.color !== color) return false;
  for (const [r, c] of s.empty) if (board[r][c]) return false;
  for (const [dr, dc] of KING_OFFSETS) {
    const p = proj(topo, from[0] + dr, from[1] + dc);
    if (p && eq(p, s.kingTo)) return false; // plain glued step to the same square
  }
  return true;
}

// Which castle (if any) the move from->to denotes, given the structural
// conditions hold. Deterministic on client and server for the same state.
export function castleSideOf(board: ChessBoard, topo: Topology, ctx: MoveContext, color: Color, from: Sq, to: Sq): 'k' | 'q' | null {
  const piece = board[from[0]][from[1]];
  if (!piece || piece.type !== 'king' || piece.color !== color) return null;
  for (const side of ['k', 'q'] as const) {
    if (eq(to, castleSpec(color, side).kingTo) && castleAvailable(board, topo, ctx, color, from, side)) return side;
  }
  return null;
}

export function getPseudoDestinations(board: ChessBoard, topo: Topology, fromRow: number, fromCol: number, ctx?: MoveContext): Set<string> {
  const dests = new Set<string>();
  const piece = board[fromRow][fromCol];
  if (!piece) return dests;

  const addOffsets = (offsets: number[][]) => {
    for (const [dr, dc] of offsets) {
      const p = proj(topo, fromRow + dr, fromCol + dc);
      if (!p) continue;
      const [r, c] = p;
      if (r === fromRow && c === fromCol) continue;
      const target = board[r][c];
      if (!target || target.color !== piece.color) dests.add(`${r},${c}`);
    }
  };

  const slide = (dirs: number[][]) => {
    for (const [dr, dc] of dirs) {
      for (let t = 1; t <= SLIDE_CAP; t++) {
        const p = proj(topo, fromRow + dr * t, fromCol + dc * t);
        if (!p) break;
        const [r, c] = p;
        if (r === fromRow && c === fromCol) break;
        const target = board[r][c];
        if (target) {
          if (target.color !== piece.color) dests.add(`${r},${c}`);
          break;
        }
        dests.add(`${r},${c}`);
      }
    }
  };

  switch (piece.type) {
    case 'pawn': {
      const dir = piece.color === 'white' ? -1 : 1;
      const startRow = piece.color === 'white' ? 6 : 1;

      const one = proj(topo, fromRow + dir, fromCol);
      if (one && !board[one[0]][one[1]]) {
        dests.add(`${one[0]},${one[1]}`);
        if (fromRow === startRow) {
          const two = proj(topo, fromRow + 2 * dir, fromCol);
          if (two && !board[two[0]][two[1]]) dests.add(`${two[0]},${two[1]}`);
        }
      }

      for (const dc of [-1, 1]) {
        const p = proj(topo, fromRow + dir, fromCol + dc);
        if (!p) continue;
        const target = board[p[0]][p[1]];
        if (target && target.color !== piece.color) dests.add(`${p[0]},${p[1]}`);
        // en passant: the diagonal lands on the one-ply ep target square
        if (!target && ctx?.ep && eq(p, ctx.ep.target)) dests.add(`${p[0]},${p[1]}`);
      }
      break;
    }

    case 'knight':
      addOffsets(KNIGHT_OFFSETS);
      break;

    case 'king':
      addOffsets(KING_OFFSETS);
      if (ctx) {
        for (const side of ['k', 'q'] as const) {
          if (castleAvailable(board, topo, ctx, piece.color, [fromRow, fromCol], side)) {
            const t = castleSpec(piece.color, side).kingTo;
            dests.add(`${t[0]},${t[1]}`);
          }
        }
      }
      break;

    case 'rook':
      slide(STRAIGHT_DIRS);
      break;

    case 'bishop':
      slide(DIAGONAL_DIRS);
      break;

    case 'queen':
      slide(STRAIGHT_DIRS);
      slide(DIAGONAL_DIRS);
      break;
  }

  return dests;
}

// ==================== CHECK / CHECKMATE ====================
function findKing(board: ChessBoard, color: Color): Sq | null {
  for (let row = 0; row < CHESS_SIZE; row++) {
    for (let col = 0; col < CHESS_SIZE; col++) {
      const piece = board[row][col];
      if (piece && piece.type === 'king' && piece.color === color) {
        return [row, col];
      }
    }
  }
  return null;
}

function isSquareAttacked(board: ChessBoard, topo: Topology, row: number, col: number, byColor: Color): boolean {
  const key = `${row},${col}`;
  for (let r = 0; r < CHESS_SIZE; r++) {
    for (let c = 0; c < CHESS_SIZE; c++) {
      const piece = board[r][c];
      if (piece && piece.color === byColor && getPseudoDestinations(board, topo, r, c).has(key)) {
        return true;
      }
    }
  }
  return false;
}

export function isInCheck(board: ChessBoard, topo: Topology, color: Color): boolean {
  const kingPos = findKing(board, color);
  if (!kingPos) return false;
  return isSquareAttacked(board, topo, kingPos[0], kingPos[1], opponentOf(color));
}

// Board after the move, with its side effects (castling rook hop, en passant
// removal) applied. Shared by legality simulation and applyChessMove so the
// two can never disagree.
function boardAfterMove(board: ChessBoard, topo: Topology, from: Sq, to: Sq, ctx?: MoveContext): ChessBoard {
  const test = board.map(r => [...r]);
  const piece = test[from[0]][from[1]];
  const captured = test[to[0]][to[1]];
  test[to[0]][to[1]] = piece;
  test[from[0]][from[1]] = null;

  if (piece && ctx) {
    const side = castleSideOf(board, topo, ctx, piece.color, from, to);
    if (side) {
      const s = castleSpec(piece.color, side);
      test[s.rookTo[0]][s.rookTo[1]] = test[s.rookFrom[0]][s.rookFrom[1]];
      test[s.rookFrom[0]][s.rookFrom[1]] = null;
    }
    if (piece.type === 'pawn' && !captured && ctx.ep && eq(to, ctx.ep.target)) {
      test[ctx.ep.victim[0]][ctx.ep.victim[1]] = null;
    }
  }
  return test;
}

function moveLeavesKingInCheck(board: ChessBoard, topo: Topology, from: Sq, to: Sq, ctx?: MoveContext): boolean {
  const piece = board[from[0]][from[1]];
  if (!piece) return false;
  return isInCheck(boardAfterMove(board, topo, from, to, ctx), topo, piece.color);
}

// Castle-only extra conditions: the king may not castle out of or through
// check (into check is covered by the standard simulation).
function castleCheckConditions(board: ChessBoard, topo: Topology, color: Color, side: 'k' | 'q'): boolean {
  if (isInCheck(board, topo, color)) return false;
  const mid = castleSpec(color, side).kingMid;
  return !isSquareAttacked(board, topo, mid[0], mid[1], opponentOf(color));
}

export function isLegalChessMove(board: ChessBoard, topo: Topology, from: Sq, to: Sq, ctx?: MoveContext): boolean {
  if (!getPseudoDestinations(board, topo, from[0], from[1], ctx).has(`${to[0]},${to[1]}`)) return false;
  const piece = board[from[0]][from[1]]!;
  if (ctx) {
    const side = castleSideOf(board, topo, ctx, piece.color, from, to);
    if (side && !castleCheckConditions(board, topo, piece.color, side)) return false;
  }
  return !moveLeavesKingInCheck(board, topo, from, to, ctx);
}

export function getLegalDestinations(board: ChessBoard, topo: Topology, from: Sq, ctx?: MoveContext): Set<string> {
  const legal = new Set<string>();
  for (const dest of getPseudoDestinations(board, topo, from[0], from[1], ctx)) {
    const [row, col] = dest.split(',').map(Number);
    if (isLegalChessMove(board, topo, from, [row, col], ctx)) legal.add(dest);
  }
  return legal;
}

export function hasAnyLegalMove(board: ChessBoard, topo: Topology, color: Color, ctx?: MoveContext): boolean {
  for (let row = 0; row < CHESS_SIZE; row++) {
    for (let col = 0; col < CHESS_SIZE; col++) {
      const piece = board[row][col];
      if (!piece || piece.color !== color) continue;
      if (getLegalDestinations(board, topo, [row, col], ctx).size > 0) return true;
    }
  }
  return false;
}

// ==================== STATE TRANSITIONS ====================
function endStateFor(board: ChessBoard, topo: Topology, toMove: Color, lastMover: Color, ctx: MoveContext): Color | 'draw' | null {
  if (hasAnyLegalMove(board, topo, toMove, ctx)) return null;
  return isInCheck(board, topo, toMove) ? lastMover : 'draw';
}

const fullRights = (): CastlingRights => ({ whiteK: true, whiteQ: true, blackK: true, blackQ: true });

// Moving from or capturing onto a king/rook start square burns the
// associated rights, whatever piece is involved now.
function clearRightsForSquare(c: CastlingRights, sq: Sq): void {
  const [r, col] = sq;
  if (r === 7) {
    if (col === 4) { c.whiteK = false; c.whiteQ = false; }
    else if (col === 7) c.whiteK = false;
    else if (col === 0) c.whiteQ = false;
  } else if (r === 0) {
    if (col === 4) { c.blackK = false; c.blackQ = false; }
    else if (col === 7) c.blackK = false;
    else if (col === 0) c.blackQ = false;
  }
}

export function initialChessState(topo: Topology): ChessState {
  const board = createInitialChessBoard();
  const turn: Color = 'white';
  const castling = fullRights();
  // Some topologies are decided before the first move (torus: white is
  // checkmated at move zero). Report that state honestly.
  const gameOver = endStateFor(board, topo, turn, opponentOf(turn), { castling, ep: null });
  return { board, turn, gameOver, topo, castling, ep: null };
}

// Applies a (presumed legal) move: side effects (castle rook hop, en passant
// removal) via boardAfterMove, auto-queens a promoting pawn on rows 0/7,
// updates castling rights and the one-ply ep window, flips the turn, and
// detects mate/stalemate.
export function applyChessMove(state: ChessState, move: ChessMove): { state: ChessState; result: GameResult } {
  const { from, to } = move;
  const mover = state.turn;
  const piece = state.board[from[0]][from[1]];
  const captured = state.board[to[0]][to[1]];
  const ctx = contextOf(state);
  const board = boardAfterMove(state.board, state.topo, from, to, ctx);

  const moved = board[to[0]][to[1]];
  if (moved && moved.type === 'pawn' && (to[0] === 0 || to[0] === CHESS_SIZE - 1)) {
    board[to[0]][to[1]] = { type: 'queen', color: moved.color };
  }

  const castling = { ...state.castling };
  clearRightsForSquare(castling, from);
  clearRightsForSquare(castling, to);

  // A projected double step opens the ep window for one ply.
  let ep: EnPassant | null = null;
  if (piece && piece.type === 'pawn' && !captured) {
    const dir = mover === 'white' ? -1 : 1;
    const startRow = mover === 'white' ? 6 : 1;
    if (from[0] === startRow) {
      const one = proj(state.topo, from[0] + dir, from[1]);
      const two = proj(state.topo, from[0] + 2 * dir, from[1]);
      if (one && two && eq(to, two) && !eq(to, one)) ep = { target: one, victim: to };
    }
  }

  const turn = opponentOf(mover);
  const nextCtx: MoveContext = { castling, ep };
  const gameOver = endStateFor(board, state.topo, turn, mover, nextCtx);
  const next: ChessState = { board, turn, gameOver, topo: state.topo, castling, ep };
  const result: GameResult = gameOver ? { status: 'done', winner: gameOver } : { status: 'active', turn };
  return { state: next, result };
}

// ==================== MODULE ====================
interface ChessSnapshot {
  board: ChessBoard;
  turn: Color;
  gameOver: Color | 'draw' | null;
  topo: string;
  castling?: CastlingRights; // absent on rows serialized before castling shipped
  ep?: EnPassant | null;     // absent likewise
}

// Back-compat for snapshots without rights: grant a right iff the king and
// the matching rook still sit on their start squares. A piece that moved
// away and back is wrongly re-granted, which old rows cannot distinguish.
function deriveRights(board: ChessBoard): CastlingRights {
  const at = (r: number, c: number, type: PieceType, color: Color): boolean => {
    const p = board[r][c];
    return !!p && p.type === type && p.color === color;
  };
  return {
    whiteK: at(7, 4, 'king', 'white') && at(7, 7, 'rook', 'white'),
    whiteQ: at(7, 4, 'king', 'white') && at(7, 0, 'rook', 'white'),
    blackK: at(0, 4, 'king', 'black') && at(0, 7, 'rook', 'black'),
    blackQ: at(0, 4, 'king', 'black') && at(0, 0, 'rook', 'black'),
  };
}

export const chessModule: GameModule<ChessState, ChessMove, Topology> = {
  id: 'chess',
  name: 'Chess',
  boardFamily: 'square-grid',
  initialState: (topo) => initialChessState(topo),
  isLegalMove: (state, move) => isLegalChessMove(state.board, state.topo, move.from, move.to, contextOf(state)),
  applyMove: (state, move) => applyChessMove(state, move),
  serialize: (state): ChessSnapshot => ({
    board: state.board,
    turn: state.turn,
    gameOver: state.gameOver,
    topo: state.topo.id,
    castling: state.castling,
    ep: state.ep,
  }),
  deserialize: (data) => {
    const d = data as ChessSnapshot;
    return {
      board: d.board,
      turn: d.turn,
      gameOver: d.gameOver,
      topo: TOPOLOGY_MAP.get(d.topo)!,
      castling: d.castling ?? deriveRights(d.board),
      ep: d.ep ?? null,
    };
  },
};
