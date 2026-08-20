// Stateful browser wrapper around the pure hex-torus chess engine
// (engine/games/hextorus.ts). Mirrors hexchess.ts: live bindings + click
// handler; in online mode gates moves to one colour and reports committed
// moves.

import { Color } from './engine/core';
import {
  HexTorusState, HexTorusBoard, hexTorusModule,
  initialHexTorusState, applyHexTorusMove,
  hexTorusLegalDestinations as coreLegalDests,
  hexTorusCheckedKingKey as coreCheckedKing,
  isHexTorusInCheck as coreInCheck,
} from './engine/games/hextorus';
import { hexKey } from './engine/games/hexchess';
import type { OnlineOpts } from './views/kit';

export {
  allHexTorusCells, projectHexTorus, hexTorusColorIndex, HEXT_N, HEXT_RADIUS,
} from './engine/games/hextorus';

let state: HexTorusState = initialHexTorusState();

// Live bindings read by the view.
export let hexTorusBoard: HexTorusBoard = state.board;
export let hexTorusCurrentTurn: Color = state.turn;
export let hexTorusSelected: string | null = null;
export let hexTorusGameOver: Color | 'draw' | null = state.gameOver;

let engaged = false;
let lockColor: Color | null = null;
let onCommit: ((move: unknown) => void) | null = null;

function sync(): void {
  hexTorusBoard = state.board;
  hexTorusCurrentTurn = state.turn;
  hexTorusGameOver = state.gameOver;
}

export function resetHexTorus(): void {
  state = initialHexTorusState();
  hexTorusSelected = null;
  sync();
}

export function loadHexTorusState(serialized: unknown): void {
  state = hexTorusModule.deserialize(serialized);
  hexTorusSelected = null;
  sync();
}

export function serializeHexTorus(): unknown {
  return hexTorusModule.serialize(state);
}

export function setHexTorusOnline(opts: OnlineOpts): void {
  engaged = opts.engaged;
  lockColor = opts.lockColor;
  onCommit = opts.engaged ? opts.onCommit : null;
}

export function isHexTorusInCheck(color: Color): boolean {
  return coreInCheck(state, color);
}

export function hexTorusLegalDestinations(fromKey: string): Set<string> {
  return coreLegalDests(state, fromKey);
}

export function hexTorusCheckedKingKey(): string | null {
  return coreCheckedKing(state);
}

export function clickHexTorus(q: number, r: number): void {
  if (state.gameOver) return;
  if (engaged && (lockColor === null || state.turn !== lockColor)) return;

  const key = hexKey(q, r);
  const piece = state.board.get(key);

  if (hexTorusSelected) {
    if (hexTorusSelected === key) {
      hexTorusSelected = null;
    } else if (coreLegalDests(state, hexTorusSelected).has(key)) {
      const from = hexTorusSelected;
      state = applyHexTorusMove(state, from, key);
      hexTorusSelected = null;
      sync();
      onCommit?.({ from, to: key });
    } else if (piece && piece.color === state.turn) {
      hexTorusSelected = key;
    } else {
      hexTorusSelected = null;
    }
  } else if (piece && piece.color === state.turn) {
    hexTorusSelected = key;
  }
}
