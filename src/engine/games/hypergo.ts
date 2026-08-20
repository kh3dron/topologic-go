// Pure Go engine on the {4,6} hyperbolic board. The rules are exactly square
// Go's - group capture, suicide ban, positional superko, two passes end, area
// flood-fill territory scoring - run over the hyperchess tiling's adjacency
// graph instead of project(). Stones sit on cells (area adjacency), not
// vertices: the board is the same 1352-cell patch chess uses, adjacency is
// hyperNeighbors(). No cell is self-adjacent here (a genuine tiling patch),
// so unlike the orbifold quotients there are no singular cells - what changes
// is the geometry: cell count grows exponentially with radius, so territory
// walls need far more stones per enclosed cell than on a Euclidean board.

import { HYPER_CELL_COUNT, hyperNeighbors } from './hyperchess.ts';
import { Color, GameModule, GameResult, opponentOf } from '../core.ts';

export type HyperGoBoard = (Color | null)[]; // indexed by cell id

// Provisional: the Euclidean 19x19 baseline value. Nobody has measured komi
// on a 1352-cell hyperbolic board; at this board size its relative weight is
// tiny anyway.
export const HYPERGO_KOMI = 6.5;

export type HyperGoMove = { kind: 'place'; cell: number } | { kind: 'pass' };

export interface HyperGoState {
  board: HyperGoBoard;
  turn: Color;
  gameOver: boolean;
  passes: number;
  captures: { black: number; white: number };
  lastMove: number | null;
  seen: Set<string>;
}

function neighborsOf(cell: number): number[] {
  return hyperNeighbors(cell).filter((n): n is number => n !== null);
}

function boardToString(board: HyperGoBoard): string {
  let s = '';
  for (const c of board) s += c ? c[0] : '.';
  return s;
}

function getGroup(board: HyperGoBoard, cell: number): Set<number> {
  const color = board[cell];
  if (!color) return new Set();
  const group = new Set<number>();
  const stack = [cell];
  while (stack.length > 0) {
    const c = stack.pop()!;
    if (group.has(c) || board[c] !== color) continue;
    group.add(c);
    for (const n of neighborsOf(c)) {
      if (!group.has(n) && board[n] === color) stack.push(n);
    }
  }
  return group;
}

function hasLiberty(board: HyperGoBoard, group: Set<number>): boolean {
  for (const c of group) {
    for (const n of neighborsOf(c)) {
      if (board[n] === null) return true;
    }
  }
  return false;
}

function removeGroup(board: HyperGoBoard, group: Set<number>): number {
  for (const c of group) board[c] = null;
  return group.size;
}

// Shared placement core: plays `color` at `cell` on a copy of the board,
// resolving captures. Returns the resulting board and capture count, or null
// if the move is suicide.
function tryPlace(board: HyperGoBoard, cell: number, color: Color): { board: HyperGoBoard; captured: number } | null {
  const test = board.slice();
  test[cell] = color;
  const opponent = opponentOf(color);
  let captured = 0;
  for (const n of neighborsOf(cell)) {
    if (test[n] === opponent) {
      const group = getGroup(test, n);
      if (!hasLiberty(test, group)) captured += removeGroup(test, group);
    }
  }
  if (captured === 0 && !hasLiberty(test, getGroup(test, cell))) return null; // suicide
  return { board: test, captured };
}

export function isValidHyperGoMove(state: HyperGoState, cell: number, color: Color): boolean {
  if (state.board[cell] !== null) return false;
  const placed = tryPlace(state.board, cell, color);
  if (!placed) return false;
  return !state.seen.has(boardToString(placed.board)); // positional superko
}

export function applyHyperGoPlace(state: HyperGoState, cell: number): HyperGoState {
  const mover = state.turn;
  const placed = tryPlace(state.board, cell, mover)!;
  const captures = { ...state.captures };
  captures[mover] += placed.captured;
  const seen = new Set(state.seen);
  seen.add(boardToString(placed.board));
  return {
    board: placed.board,
    turn: opponentOf(mover),
    gameOver: false,
    passes: 0,
    captures,
    lastMove: cell,
    seen,
  };
}

export function applyHyperGoPass(state: HyperGoState): HyperGoState {
  const passes = state.passes + 1;
  const gameOver = passes >= 2;
  return {
    ...state,
    turn: gameOver ? state.turn : opponentOf(state.turn),
    gameOver,
    passes,
    lastMove: null,
    captures: { ...state.captures },
    seen: new Set(state.seen),
  };
}

export function initialHyperGoState(): HyperGoState {
  const board: HyperGoBoard = new Array(HYPER_CELL_COUNT).fill(null);
  return {
    board,
    turn: 'black',
    gameOver: false,
    passes: 0,
    captures: { black: 0, white: 0 },
    lastMove: null,
    seen: new Set([boardToString(board)]),
  };
}

// ==================== SCORING ====================
export interface HyperGoScore {
  blackTerritory: number;
  whiteTerritory: number;
  blackTotal: number;
  whiteTotal: number;
  winner: Color | 'draw';
}

export function scoreHyperGo(state: HyperGoState): HyperGoScore {
  const board = state.board;
  const territory = { black: 0, white: 0 };
  const visited = new Array<boolean>(board.length).fill(false);

  for (let cell = 0; cell < board.length; cell++) {
    if (board[cell] !== null || visited[cell]) continue;
    const region: number[] = [];
    const borderColors = new Set<Color>();
    const stack = [cell];
    visited[cell] = true;
    while (stack.length > 0) {
      const c = stack.pop()!;
      region.push(c);
      for (const n of neighborsOf(c)) {
        const stone = board[n];
        if (stone) borderColors.add(stone);
        else if (!visited[n]) {
          visited[n] = true;
          stack.push(n);
        }
      }
    }
    if (borderColors.size === 1) {
      territory[borderColors.values().next().value!] += region.length;
    }
  }

  const blackTotal = territory.black + state.captures.black;
  const whiteTotal = territory.white + state.captures.white + HYPERGO_KOMI;
  return {
    blackTerritory: territory.black,
    whiteTerritory: territory.white,
    blackTotal,
    whiteTotal,
    winner: blackTotal > whiteTotal ? 'black' : blackTotal < whiteTotal ? 'white' : 'draw',
  };
}

// ==================== MODULE ====================
// Board serialized as one char per cell ('b'/'w'/'.') - 1352-char strings
// keep snapshots (and the embedded superko history) an order of magnitude
// smaller than a JSON array.
interface HyperGoSnapshot {
  board: string;
  turn: Color;
  gameOver: boolean;
  passes: number;
  captures: { black: number; white: number };
  lastMove: number | null;
  seen: string[];
}

function parseBoard(s: string): HyperGoBoard {
  const board: HyperGoBoard = new Array(s.length).fill(null);
  for (let i = 0; i < s.length; i++) {
    if (s[i] === 'b') board[i] = 'black';
    else if (s[i] === 'w') board[i] = 'white';
  }
  return board;
}

function hyperGoResult(state: HyperGoState): GameResult {
  if (!state.gameOver) return { status: 'active', turn: state.turn };
  return { status: 'done', winner: scoreHyperGo(state).winner };
}

export const hyperGoModule: GameModule<HyperGoState, HyperGoMove, null> = {
  id: 'hypergo',
  name: 'Hyperbolic Go',
  boardFamily: 'hyperbolic-46',
  catalog: {
    group: 'Hyperbolic',
    board: 'Hyperbolic plane',
    surface: '{4,6} tiling of the hyperbolic plane',
    spec: [
      `${HYPER_CELL_COUNT} CELLS`,
      'STONES ON CELLS, 4 NEIGHBORS',
      'AREA GROWS EXPONENTIALLY WITH RADIUS',
    ],
    badge: 'HYPERBOLIC BOARD',
    preview: 'hyper',
  },
  initialState: () => initialHyperGoState(),
  isLegalMove: (state, move) => {
    if (state.gameOver) return false;
    if (move.kind === 'pass') return true;
    if (!Number.isInteger(move.cell) || move.cell < 0 || move.cell >= HYPER_CELL_COUNT) return false;
    return isValidHyperGoMove(state, move.cell, state.turn);
  },
  applyMove: (state, move) => {
    const next = move.kind === 'pass' ? applyHyperGoPass(state) : applyHyperGoPlace(state, move.cell);
    return { state: next, result: hyperGoResult(next) };
  },
  serialize: (state): HyperGoSnapshot => ({
    board: boardToString(state.board),
    turn: state.turn,
    gameOver: state.gameOver,
    passes: state.passes,
    captures: state.captures,
    lastMove: state.lastMove,
    seen: Array.from(state.seen),
  }),
  deserialize: (data) => {
    const d = data as HyperGoSnapshot;
    return {
      board: parseBoard(d.board),
      turn: d.turn,
      gameOver: d.gameOver,
      passes: d.passes,
      captures: d.captures,
      lastMove: d.lastMove,
      seen: new Set(d.seen),
    };
  },
};
