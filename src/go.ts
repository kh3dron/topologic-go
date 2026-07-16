// Stateful browser wrapper around the pure Go engine (engine/games/go.ts).
// Preserves the renderer's surface (live bindings + handlers); in online mode
// gates moves to one colour and reports committed moves (place / pass).

import { Color } from './engine/core';
import { currentTopology } from './state';
import {
  GoState, GoBoard, GO_SIZE, GO_SIZES, KOMI, starPoints, goModule,
  initialGoState, isValidGoMove as coreValid,
  applyGoPlace, applyGoPass, scoreGo as coreScore, GoScore,
} from './engine/games/go';
import type { OnlineOpts } from './views/kit';
import { playStoneSound } from './sound';

export { GO_SIZE, GO_SIZES, KOMI, starPoints };
export type { GoStone, GoBoard, GoScore } from './engine/games/go';

// Size used for the next new local game (the size picker writes it).
let preferredSize: number = GO_SIZE;

let state: GoState = initialGoState(currentTopology);

// Live bindings read by render.ts.
export let goBoard: GoBoard = state.board;
export let goSize: number = state.size;
export let goCurrentTurn: Color = state.turn;
export let goGameOver: boolean = state.gameOver;
export let goPasses: number = state.passes;
export let goCaptures: { black: number; white: number } = state.captures;
export let goLastMove: [number, number] | null = state.lastMove;

let engaged = false;
let lockColor: Color | null = null;
let onCommit: ((move: unknown) => void) | null = null;

function sync(): void {
  goBoard = state.board;
  goSize = state.size;
  goCurrentTurn = state.turn;
  goGameOver = state.gameOver;
  goPasses = state.passes;
  goCaptures = state.captures;
  goLastMove = state.lastMove;
}

export function resetGo(): void {
  state = initialGoState(currentTopology, preferredSize);
  sync();
}

// Set the board size for subsequent local games; the caller resets/rerenders.
export function setGoSize(size: number): void {
  if (!GO_SIZES.includes(size)) return;
  preferredSize = size;
}

export function loadGoState(serialized: unknown): void {
  state = goModule.deserialize(serialized);
  sync();
}

export function setGoOnline(opts: OnlineOpts): void {
  engaged = opts.engaged;
  lockColor = opts.lockColor;
  onCommit = opts.engaged ? opts.onCommit : null;
}

export function isValidGoMove(row: number, col: number, color: Color): boolean {
  return coreValid(state, row, col, color);
}

// Whether the local player may place a stone right now. Offline hotseat always
// may; online only on the seated colour's turn (spectators never). The view
// uses this to suppress the hover ghost/crosshair when it isn't your move.
export function canPlayGoNow(): boolean {
  if (state.gameOver) return false;
  return !engaged || (lockColor !== null && state.turn === lockColor);
}

export function placeGoStone(row: number, col: number): boolean {
  if (engaged && (lockColor === null || state.turn !== lockColor)) return false;
  if (!coreValid(state, row, col, state.turn)) return false;
  state = applyGoPlace(state, row, col);
  sync();
  playStoneSound();
  onCommit?.({ kind: 'place', row, col });
  return true;
}

export function passGoTurn(): void {
  if (state.gameOver) return;
  if (engaged && (lockColor === null || state.turn !== lockColor)) return;
  state = applyGoPass(state);
  sync();
  onCommit?.({ kind: 'pass' });
}

export function scoreGo(): GoScore {
  return coreScore(state);
}
