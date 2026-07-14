// Stateful browser wrapper around the pure chess engine (engine/games/chess.ts).
// Holds the live game state + selection as module globals and exposes the same
// surface the renderer has always read (live ESM bindings + a click handler).
// All rules live in the pure core; this layer only tracks "the current game"
// and, in online mode, gates moves to one colour and reports committed moves.

import { Color } from './engine/core';
import { currentTopology } from './state';
import {
  ChessState, ChessBoard, CHESS_SIZE, PIECE_SYMBOLS, chessModule,
  initialChessState, applyChessMove,
  isLegalChessMove as coreIsLegal,
  getLegalDestinations as coreLegalDests,
  isInCheck as coreIsInCheck,
} from './engine/games/chess';
import type { OnlineOpts } from './views/kit';

export { CHESS_SIZE, PIECE_SYMBOLS };
export type { PieceType, ChessPiece, ChessBoard } from './engine/games/chess';

let state: ChessState = initialChessState(currentTopology);

// Live bindings read by render.ts / census.ts.
export let chessBoard: ChessBoard = state.board;
export let chessCurrentTurn: Color = state.turn;
export let selectedSquare: [number, number] | null = null;
export let chessGameOver: Color | 'draw' | null = state.gameOver;

// Online integration (inert offline: engaged = false).
let engaged = false;
let lockColor: Color | null = null;
let onCommit: ((move: unknown) => void) | null = null;

function sync(): void {
  chessBoard = state.board;
  chessCurrentTurn = state.turn;
  chessGameOver = state.gameOver;
}

export function resetChess(): void {
  state = initialChessState(currentTopology);
  selectedSquare = null;
  sync();
}

// Online: replace local state with the server's authoritative board_state.
export function loadChessState(serialized: unknown): void {
  state = chessModule.deserialize(serialized);
  selectedSquare = null;
  sync();
}

export function setChessOnline(opts: OnlineOpts): void {
  engaged = opts.engaged;
  lockColor = opts.lockColor;
  onCommit = opts.engaged ? opts.onCommit : null;
}

export function isInCheck(color: Color): boolean {
  return coreIsInCheck(state.board, state.topo, color);
}

export function isLegalChessMove(fromRow: number, fromCol: number, toRow: number, toCol: number): boolean {
  return coreIsLegal(state.board, state.topo, [fromRow, fromCol], [toRow, toCol]);
}

export function getLegalDestinations(fromRow: number, fromCol: number): Set<string> {
  return coreLegalDests(state.board, state.topo, [fromRow, fromCol]);
}

export function clickChessSquare(row: number, col: number): void {
  if (state.gameOver) return;
  if (engaged && (lockColor === null || state.turn !== lockColor)) return; // not my turn / spectator

  const piece = state.board[row][col];

  if (selectedSquare) {
    const [fromRow, fromCol] = selectedSquare;

    if (fromRow === row && fromCol === col) {
      selectedSquare = null;
    } else if (coreIsLegal(state.board, state.topo, [fromRow, fromCol], [row, col])) {
      state = applyChessMove(state, { from: [fromRow, fromCol], to: [row, col] }).state;
      selectedSquare = null;
      sync();
      onCommit?.({ from: [fromRow, fromCol], to: [row, col] });
    } else if (piece && piece.color === state.turn) {
      selectedSquare = [row, col];
    } else {
      selectedSquare = null;
    }
  } else if (piece && piece.color === state.turn) {
    selectedSquare = [row, col];
  }
}
