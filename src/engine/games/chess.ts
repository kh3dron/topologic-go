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

export interface ChessState {
  board: ChessBoard;
  turn: Color;
  gameOver: Color | 'draw' | null;
  topo: Topology;
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

export function getPseudoDestinations(board: ChessBoard, topo: Topology, fromRow: number, fromCol: number): Set<string> {
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
      }
      break;
    }

    case 'knight':
      addOffsets(KNIGHT_OFFSETS);
      break;

    case 'king':
      addOffsets(KING_OFFSETS);
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

function moveLeavesKingInCheck(board: ChessBoard, topo: Topology, from: Sq, to: Sq): boolean {
  const piece = board[from[0]][from[1]];
  if (!piece) return false;

  const test = board.map(r => [...r]);
  test[to[0]][to[1]] = test[from[0]][from[1]];
  test[from[0]][from[1]] = null;

  return isInCheck(test, topo, piece.color);
}

export function isLegalChessMove(board: ChessBoard, topo: Topology, from: Sq, to: Sq): boolean {
  return getPseudoDestinations(board, topo, from[0], from[1]).has(`${to[0]},${to[1]}`) &&
         !moveLeavesKingInCheck(board, topo, from, to);
}

export function getLegalDestinations(board: ChessBoard, topo: Topology, from: Sq): Set<string> {
  const legal = new Set<string>();
  for (const dest of getPseudoDestinations(board, topo, from[0], from[1])) {
    const [row, col] = dest.split(',').map(Number);
    if (!moveLeavesKingInCheck(board, topo, from, [row, col])) legal.add(dest);
  }
  return legal;
}

export function hasAnyLegalMove(board: ChessBoard, topo: Topology, color: Color): boolean {
  for (let row = 0; row < CHESS_SIZE; row++) {
    for (let col = 0; col < CHESS_SIZE; col++) {
      const piece = board[row][col];
      if (!piece || piece.color !== color) continue;
      if (getLegalDestinations(board, topo, [row, col]).size > 0) return true;
    }
  }
  return false;
}

// ==================== STATE TRANSITIONS ====================
function endStateFor(board: ChessBoard, topo: Topology, toMove: Color, lastMover: Color): Color | 'draw' | null {
  if (hasAnyLegalMove(board, topo, toMove)) return null;
  return isInCheck(board, topo, toMove) ? lastMover : 'draw';
}

export function initialChessState(topo: Topology): ChessState {
  const board = createInitialChessBoard();
  const turn: Color = 'white';
  // Some topologies are decided before the first move (torus: white is
  // checkmated at move zero). Report that state honestly.
  const gameOver = endStateFor(board, topo, turn, opponentOf(turn));
  return { board, turn, gameOver, topo };
}

// Applies a (presumed legal) move: mutates a copy, auto-queens a promoting
// pawn on rows 0/7, flips the turn, and detects mate/stalemate.
export function applyChessMove(state: ChessState, move: ChessMove): { state: ChessState; result: GameResult } {
  const { from, to } = move;
  const board = state.board.map(r => [...r]);
  const mover = state.turn;

  board[to[0]][to[1]] = board[from[0]][from[1]];
  board[from[0]][from[1]] = null;

  const moved = board[to[0]][to[1]];
  if (moved && moved.type === 'pawn' && (to[0] === 0 || to[0] === CHESS_SIZE - 1)) {
    board[to[0]][to[1]] = { type: 'queen', color: moved.color };
  }

  const turn = opponentOf(mover);
  const gameOver = endStateFor(board, state.topo, turn, mover);
  const next: ChessState = { board, turn, gameOver, topo: state.topo };
  const result: GameResult = gameOver ? { status: 'done', winner: gameOver } : { status: 'active', turn };
  return { state: next, result };
}

// ==================== MODULE ====================
interface ChessSnapshot {
  board: ChessBoard;
  turn: Color;
  gameOver: Color | 'draw' | null;
  topo: string;
}

export const chessModule: GameModule<ChessState, ChessMove, Topology> = {
  id: 'chess',
  name: 'Chess',
  boardFamily: 'square-grid',
  initialState: (topo) => initialChessState(topo),
  isLegalMove: (state, move) => isLegalChessMove(state.board, state.topo, move.from, move.to),
  applyMove: (state, move) => applyChessMove(state, move),
  serialize: (state): ChessSnapshot => ({
    board: state.board,
    turn: state.turn,
    gameOver: state.gameOver,
    topo: state.topo.id,
  }),
  deserialize: (data) => {
    const d = data as ChessSnapshot;
    return { board: d.board, turn: d.turn, gameOver: d.gameOver, topo: TOPOLOGY_MAP.get(d.topo)! };
  },
};
