// Stateful browser wrapper around the pure pentagonal-chess engine
// (engine/games/pentachess.ts). Mirrors hyperchess.ts: live bindings +
// handlers; in online mode gates moves to one colour and reports committed
// moves.

import { Color } from './engine/core';
import {
  PentaState, PentaBoard, pentaModule,
  initialPentaState, applyPentaMove,
  pentaLegalDestinations as coreLegalDests,
  pentaCheckedKingCell as coreCheckedKing,
  isPentaInCheck as coreInCheck,
} from './engine/games/pentachess';
import type { OnlineOpts } from './views/kit';

// Pure geometry passes straight through to the renderer.
export {
  pentaCells, pentaNeighbors, PENTA_CELL_COUNT, PENTA_BASE_BOUNDARY,
  PENTA_VIEW_HOME, PENTA_INRADIUS, PENTA_CIRCUMRADIUS,
} from './engine/games/pentachess';
export type { PentaPiece, PentaPieceType, PentaCell } from './engine/games/pentachess';

let state: PentaState = initialPentaState();

// Live bindings read by the view.
export let pentaBoard: PentaBoard = state.board;
export let pentaCurrentTurn: Color = state.turn;
export let pentaSelected: number | null = null;
export let pentaGameOver: Color | 'draw' | null = state.gameOver;

let engaged = false;
let lockColor: Color | null = null;
let onCommit: ((move: unknown) => void) | null = null;

function sync(): void {
  pentaBoard = state.board;
  pentaCurrentTurn = state.turn;
  pentaGameOver = state.gameOver;
}

export function resetPenta(): void {
  state = initialPentaState();
  pentaSelected = null;
  sync();
}

export function loadPentaState(serialized: unknown): void {
  state = pentaModule.deserialize(serialized);
  pentaSelected = null;
  sync();
}

export function serializePenta(): unknown {
  return pentaModule.serialize(state);
}

export function setPentaOnline(opts: OnlineOpts): void {
  engaged = opts.engaged;
  lockColor = opts.lockColor;
  onCommit = opts.engaged ? opts.onCommit : null;
}

export function isPentaInCheck(color: Color): boolean {
  return coreInCheck(state, color);
}

export function pentaLegalDestinations(from: number): Set<number> {
  return coreLegalDests(state, from);
}

export function pentaCheckedKingCell(): number | null {
  return coreCheckedKing(state);
}

export function clickPenta(cell: number): void {
  if (state.gameOver) return;
  if (engaged && (lockColor === null || state.turn !== lockColor)) return;

  const piece = state.board.get(cell);

  if (pentaSelected !== null) {
    if (pentaSelected === cell) {
      pentaSelected = null;
    } else if (coreLegalDests(state, pentaSelected).has(cell)) {
      const from = pentaSelected;
      state = applyPentaMove(state, from, cell);
      pentaSelected = null;
      sync();
      onCommit?.({ from, to: cell });
    } else if (piece && piece.color === state.turn) {
      pentaSelected = cell;
    } else {
      pentaSelected = null;
    }
  } else if (piece && piece.color === state.turn) {
    pentaSelected = cell;
  }
}
