// Stateful browser wrapper around the pure hex-chess engine
// (engine/games/hexchess.ts). Preserves the renderer's surface; in online mode
// gates moves to one colour and reports committed moves.

import { Color } from './engine/core';
import {
  HexState, HexBoard, hexModule,
  initialHexState, applyHexMove, hexKey,
  hexLegalDestinations as coreLegalDests,
  hexCheckedKingKey as coreCheckedKing,
  isHexInCheck as coreInCheck,
} from './engine/games/hexchess';
import type { OnlineOpts } from './views/kit';

// Pure geometry helpers pass straight through to the renderer.
export {
  allHexCells, hexKey, parseHexKey, hexOnBoard, hexColorIndex,
  hexFileLabel, hexRankLabel, hexCellName, HEX_RADIUS,
} from './engine/games/hexchess';
export type { HexPiece, HexPieceType } from './engine/games/hexchess';

let state: HexState = initialHexState();

// Live bindings read by render.ts / play.ts.
export let hexBoard: HexBoard = state.board;
export let hexCurrentTurn: Color = state.turn;
export let hexSelected: string | null = null;
export let hexGameOver: Color | 'draw' | null = state.gameOver;

let engaged = false;
let lockColor: Color | null = null;
let onCommit: ((move: unknown) => void) | null = null;

function sync(): void {
  hexBoard = state.board;
  hexCurrentTurn = state.turn;
  hexGameOver = state.gameOver;
}

export function resetHex(): void {
  state = initialHexState();
  hexSelected = null;
  sync();
}

export function loadHexState(serialized: unknown): void {
  state = hexModule.deserialize(serialized);
  hexSelected = null;
  sync();
}

export function setHexOnline(opts: OnlineOpts): void {
  engaged = opts.engaged;
  lockColor = opts.lockColor;
  onCommit = opts.engaged ? opts.onCommit : null;
}

export function isHexInCheck(color: Color): boolean {
  return coreInCheck(state, color);
}

export function hexLegalDestinations(fromKey: string): Set<string> {
  return coreLegalDests(state, fromKey);
}

export function hexCheckedKingKey(): string | null {
  return coreCheckedKing(state);
}

export function clickHex(q: number, r: number): void {
  if (state.gameOver) return;
  if (engaged && (lockColor === null || state.turn !== lockColor)) return;

  const key = hexKey(q, r);
  const piece = state.board.get(key);

  if (hexSelected) {
    if (hexSelected === key) {
      hexSelected = null;
    } else if (coreLegalDests(state, hexSelected).has(key)) {
      const from = hexSelected;
      state = applyHexMove(state, from, key);
      hexSelected = null;
      sync();
      onCommit?.({ from, to: key });
    } else if (piece && piece.color === state.turn) {
      hexSelected = key;
    } else {
      hexSelected = null;
    }
  } else if (piece && piece.color === state.turn) {
    hexSelected = key;
  }
}
