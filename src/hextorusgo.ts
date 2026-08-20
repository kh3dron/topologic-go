// Stateful browser wrapper around the pure hex-torus Go engine
// (engine/games/hextorusgo.ts). Mirrors hypergo.ts.

import { Color } from './engine/core';
import {
  HexTorusGoState, HexTorusGoBoard, HEXTGO_KOMI, hexTorusGoModule,
  initialHexTorusGoState, isValidHexTorusGoMove as coreValid,
  applyHexTorusGoPlace, applyHexTorusGoPass, scoreHexTorusGo as coreScore, HexTorusGoScore,
} from './engine/games/hextorusgo';
import type { OnlineOpts } from './views/kit';
import { playStoneSound } from './sound';

export { HEXTGO_KOMI };
export { hexTorusGoIndex, hexTorusGoCoords, HEXTGO_CELL_COUNT } from './engine/games/hextorusgo';
export type { HexTorusGoBoard, HexTorusGoScore };

let state: HexTorusGoState = initialHexTorusGoState();

// Live bindings read by the view.
export let hexTorusGoBoard: HexTorusGoBoard = state.board;
export let hexTorusGoCurrentTurn: Color = state.turn;
export let hexTorusGoGameOver: boolean = state.gameOver;
export let hexTorusGoCaptures: { black: number; white: number } = state.captures;
export let hexTorusGoLastMove: number | null = state.lastMove;

let engaged = false;
let lockColor: Color | null = null;
let onCommit: ((move: unknown) => void) | null = null;

function sync(): void {
  hexTorusGoBoard = state.board;
  hexTorusGoCurrentTurn = state.turn;
  hexTorusGoGameOver = state.gameOver;
  hexTorusGoCaptures = state.captures;
  hexTorusGoLastMove = state.lastMove;
}

export function resetHexTorusGo(): void {
  state = initialHexTorusGoState();
  sync();
}

export function loadHexTorusGoState(serialized: unknown): void {
  state = hexTorusGoModule.deserialize(serialized);
  sync();
}

export function serializeHexTorusGo(): unknown {
  return hexTorusGoModule.serialize(state);
}

export function setHexTorusGoOnline(opts: OnlineOpts): void {
  engaged = opts.engaged;
  lockColor = opts.lockColor;
  onCommit = opts.engaged ? opts.onCommit : null;
}

export function isValidHexTorusGoMove(cell: number, color: Color): boolean {
  return coreValid(state, cell, color);
}

export function canPlayHexTorusGoNow(): boolean {
  if (state.gameOver) return false;
  return !engaged || (lockColor !== null && state.turn === lockColor);
}

export function placeHexTorusGoStone(cell: number): boolean {
  if (engaged && (lockColor === null || state.turn !== lockColor)) return false;
  if (!coreValid(state, cell, state.turn)) return false;
  state = applyHexTorusGoPlace(state, cell);
  sync();
  playStoneSound();
  onCommit?.({ kind: 'place', cell });
  return true;
}

export function passHexTorusGoTurn(): void {
  if (state.gameOver) return;
  if (engaged && (lockColor === null || state.turn !== lockColor)) return;
  state = applyHexTorusGoPass(state);
  sync();
  onCommit?.({ kind: 'pass' });
}

export function scoreHexTorusGo(): HexTorusGoScore {
  return coreScore(state);
}
