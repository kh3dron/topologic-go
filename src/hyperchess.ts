// Stateful browser wrapper around the pure hyperbolic-chess engine
// (engine/games/hyperchess.ts). Preserves the renderer's surface; in online
// mode gates moves to one colour and reports committed moves.

import { Color } from './engine/core';
import {
  HyperState, HyperBoard, hyperModule,
  initialHyperState, applyHyperMove,
  hyperLegalDestinations as coreLegalDests,
  hyperCheckedKingCell as coreCheckedKing,
  isHyperInCheck as coreInCheck,
} from './engine/games/hyperchess';
import type { OnlineOpts } from './views/kit';

// Pure geometry helpers pass straight through to the renderer.
export {
  hyperCells, hyperNeighbors, HYPER_CELL_COUNT, HYPER_BASE_BOUNDARY, HYPER_VIEW_HOME,
  HYPER_INRADIUS, HYPER_CIRCUMRADIUS, MOB_ID,
  mobMul, mobInverse, mobApply, mobTranslation0, mobDistRatio,
} from './engine/games/hyperchess';
export type { HyperPiece, HyperPieceType, HyperCell, Mob, C } from './engine/games/hyperchess';

let state: HyperState = initialHyperState();

// Live bindings read by the view.
export let hyperBoard: HyperBoard = state.board;
export let hyperCurrentTurn: Color = state.turn;
export let hyperSelected: number | null = null;
export let hyperGameOver: Color | 'draw' | null = state.gameOver;

let engaged = false;
let lockColor: Color | null = null;
let onCommit: ((move: unknown) => void) | null = null;

function sync(): void {
  hyperBoard = state.board;
  hyperCurrentTurn = state.turn;
  hyperGameOver = state.gameOver;
}

export function resetHyper(): void {
  state = initialHyperState();
  hyperSelected = null;
  sync();
}

export function loadHyperState(serialized: unknown): void {
  state = hyperModule.deserialize(serialized);
  hyperSelected = null;
  sync();
}

export function setHyperOnline(opts: OnlineOpts): void {
  engaged = opts.engaged;
  lockColor = opts.lockColor;
  onCommit = opts.engaged ? opts.onCommit : null;
}

export function isHyperInCheck(color: Color): boolean {
  return coreInCheck(state, color);
}

export function hyperLegalDestinations(from: number): Set<number> {
  return coreLegalDests(state, from);
}

export function hyperCheckedKingCell(): number | null {
  return coreCheckedKing(state);
}

export function clickHyper(cell: number): void {
  if (state.gameOver) return;
  if (engaged && (lockColor === null || state.turn !== lockColor)) return;

  const piece = state.board.get(cell);

  if (hyperSelected !== null) {
    if (hyperSelected === cell) {
      hyperSelected = null;
    } else if (coreLegalDests(state, hyperSelected).has(cell)) {
      const from = hyperSelected;
      state = applyHyperMove(state, from, cell);
      hyperSelected = null;
      sync();
      onCommit?.({ from, to: cell });
    } else if (piece && piece.color === state.turn) {
      hyperSelected = cell;
    } else {
      hyperSelected = null;
    }
  } else if (piece && piece.color === state.turn) {
    hyperSelected = cell;
  }
}
