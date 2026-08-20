// Stateful browser wrapper around the pure hyperbolic-Go engine
// (engine/games/hypergo.ts). Mirrors go.ts: live bindings + handlers; in
// online mode gates moves to one colour and reports committed moves.

import { Color } from './engine/core';
import {
  HyperGoState, HyperGoBoard, HYPERGO_KOMI, hyperGoModule,
  initialHyperGoState, isValidHyperGoMove as coreValid,
  applyHyperGoPlace, applyHyperGoPass, scoreHyperGo as coreScore, HyperGoScore,
} from './engine/games/hypergo';
import type { OnlineOpts } from './views/kit';
import { playStoneSound } from './sound';

export { HYPERGO_KOMI };
export type { HyperGoBoard, HyperGoScore };

let state: HyperGoState = initialHyperGoState();

// Live bindings read by the view.
export let hyperGoBoard: HyperGoBoard = state.board;
export let hyperGoCurrentTurn: Color = state.turn;
export let hyperGoGameOver: boolean = state.gameOver;
export let hyperGoPasses: number = state.passes;
export let hyperGoCaptures: { black: number; white: number } = state.captures;
export let hyperGoLastMove: number | null = state.lastMove;

let engaged = false;
let lockColor: Color | null = null;
let onCommit: ((move: unknown) => void) | null = null;

function sync(): void {
  hyperGoBoard = state.board;
  hyperGoCurrentTurn = state.turn;
  hyperGoGameOver = state.gameOver;
  hyperGoPasses = state.passes;
  hyperGoCaptures = state.captures;
  hyperGoLastMove = state.lastMove;
}

export function resetHyperGo(): void {
  state = initialHyperGoState();
  sync();
}

export function loadHyperGoState(serialized: unknown): void {
  state = hyperGoModule.deserialize(serialized);
  sync();
}

export function serializeHyperGo(): unknown {
  return hyperGoModule.serialize(state);
}

export function setHyperGoOnline(opts: OnlineOpts): void {
  engaged = opts.engaged;
  lockColor = opts.lockColor;
  onCommit = opts.engaged ? opts.onCommit : null;
}

export function isValidHyperGoMove(cell: number, color: Color): boolean {
  return coreValid(state, cell, color);
}

// Whether the local player may place a stone right now (offline always;
// online only on the seated colour's turn).
export function canPlayHyperGoNow(): boolean {
  if (state.gameOver) return false;
  return !engaged || (lockColor !== null && state.turn === lockColor);
}

export function placeHyperGoStone(cell: number): boolean {
  if (engaged && (lockColor === null || state.turn !== lockColor)) return false;
  if (!coreValid(state, cell, state.turn)) return false;
  state = applyHyperGoPlace(state, cell);
  sync();
  playStoneSound();
  onCommit?.({ kind: 'place', cell });
  return true;
}

export function passHyperGoTurn(): void {
  if (state.gameOver) return;
  if (engaged && (lockColor === null || state.turn !== lockColor)) return;
  state = applyHyperGoPass(state);
  sync();
  onCommit?.({ kind: 'pass' });
}

export function scoreHyperGo(): HyperGoScore {
  return coreScore(state);
}
