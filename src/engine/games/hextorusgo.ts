// Pure Go engine on the hex torus: untouched Go rules over the 121-cell
// 11x11 axial rhombus with opposite edges glued (the same board hextorus
// chess plays on) and hexagonal adjacency - every cell has exactly six
// neighbours and the surface is closed, so there is no first-line, no
// corner, and no edge territory anywhere. Komi follows the closed-surface
// convention from the square-grid registry (7.5, provisional). This also
// delivers the TOPOLOGIES.md idea "Hex Go on a torus": the logic was always
// adjacency-agnostic; the board was the missing piece.

import { Color, GameModule, GameResult, opponentOf } from '../core.ts';
import { ROOK_DIRS, hexKey } from './hexchess.ts';
import { HEXT_N, HEXT_RADIUS, projectHexTorus, allHexTorusCells } from './hextorus.ts';

export const HEXTGO_KOMI = 7.5; // closed surface, provisional (see TOPOLOGIES.md)

export type HexTorusGoBoard = (Color | null)[]; // indexed by cell index

export const HEXTGO_CELL_COUNT = HEXT_N * HEXT_N;

// Cell index <-> axial coords. Index = (q + R) * N + (r + R).
export function hexTorusGoIndex(q: number, r: number): number {
  return (q + HEXT_RADIUS) * HEXT_N + (r + HEXT_RADIUS);
}

export function hexTorusGoCoords(i: number): [number, number] {
  return [Math.floor(i / HEXT_N) - HEXT_RADIUS, (i % HEXT_N) - HEXT_RADIUS];
}

// The six hex neighbours, projected through the gluing. Precomputed once.
const NEIGHBORS: number[][] = allHexTorusCells().map(() => []);
for (const [q, r] of allHexTorusCells()) {
  const list: number[] = [];
  for (const [dq, dr] of ROOK_DIRS) {
    const [nq, nr] = projectHexTorus(q + dq, r + dr);
    list.push(hexTorusGoIndex(nq, nr));
  }
  NEIGHBORS[hexTorusGoIndex(q, r)] = list;
}

export type HexTorusGoMove = { kind: 'place'; cell: number } | { kind: 'pass' };

export interface HexTorusGoState {
  board: HexTorusGoBoard;
  turn: Color;
  gameOver: boolean;
  passes: number;
  captures: { black: number; white: number };
  lastMove: number | null;
  seen: Set<string>;
}

function boardToString(board: HexTorusGoBoard): string {
  let s = '';
  for (const c of board) s += c ? c[0] : '.';
  return s;
}

function getGroup(board: HexTorusGoBoard, cell: number): Set<number> {
  const color = board[cell];
  if (!color) return new Set();
  const group = new Set<number>();
  const stack = [cell];
  while (stack.length > 0) {
    const c = stack.pop()!;
    if (group.has(c) || board[c] !== color) continue;
    group.add(c);
    for (const n of NEIGHBORS[c]) {
      if (!group.has(n) && board[n] === color) stack.push(n);
    }
  }
  return group;
}

function hasLiberty(board: HexTorusGoBoard, group: Set<number>): boolean {
  for (const c of group) {
    for (const n of NEIGHBORS[c]) {
      if (board[n] === null) return true;
    }
  }
  return false;
}

function tryPlace(board: HexTorusGoBoard, cell: number, color: Color): { board: HexTorusGoBoard; captured: number } | null {
  const test = board.slice();
  test[cell] = color;
  const opponent = opponentOf(color);
  let captured = 0;
  for (const n of NEIGHBORS[cell]) {
    if (test[n] === opponent) {
      const group = getGroup(test, n);
      if (!hasLiberty(test, group)) {
        for (const c of group) test[c] = null;
        captured += group.size;
      }
    }
  }
  if (captured === 0 && !hasLiberty(test, getGroup(test, cell))) return null; // suicide
  return { board: test, captured };
}

export function isValidHexTorusGoMove(state: HexTorusGoState, cell: number, color: Color): boolean {
  if (state.board[cell] !== null) return false;
  const placed = tryPlace(state.board, cell, color);
  if (!placed) return false;
  return !state.seen.has(boardToString(placed.board));
}

export function applyHexTorusGoPlace(state: HexTorusGoState, cell: number): HexTorusGoState {
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

export function applyHexTorusGoPass(state: HexTorusGoState): HexTorusGoState {
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

export function initialHexTorusGoState(): HexTorusGoState {
  const board: HexTorusGoBoard = new Array(HEXTGO_CELL_COUNT).fill(null);
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
export interface HexTorusGoScore {
  blackTerritory: number;
  whiteTerritory: number;
  blackTotal: number;
  whiteTotal: number;
  winner: Color | 'draw';
}

export function scoreHexTorusGo(state: HexTorusGoState): HexTorusGoScore {
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
      for (const n of NEIGHBORS[c]) {
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
  const whiteTotal = territory.white + state.captures.white + HEXTGO_KOMI;
  return {
    blackTerritory: territory.black,
    whiteTerritory: territory.white,
    blackTotal,
    whiteTotal,
    winner: blackTotal > whiteTotal ? 'black' : blackTotal < whiteTotal ? 'white' : 'draw',
  };
}

// ==================== MODULE ====================
interface HexTorusGoSnapshot {
  board: string;
  turn: Color;
  gameOver: boolean;
  passes: number;
  captures: { black: number; white: number };
  lastMove: number | null;
  seen: string[];
}

function parseBoard(s: string): HexTorusGoBoard {
  const board: HexTorusGoBoard = new Array(s.length).fill(null);
  for (let i = 0; i < s.length; i++) {
    if (s[i] === 'b') board[i] = 'black';
    else if (s[i] === 'w') board[i] = 'white';
  }
  return board;
}

function result(state: HexTorusGoState): GameResult {
  if (!state.gameOver) return { status: 'active', turn: state.turn };
  return { status: 'done', winner: scoreHexTorusGo(state).winner };
}

export const hexTorusGoModule: GameModule<HexTorusGoState, HexTorusGoMove, null> = {
  id: 'hextorusgo',
  name: 'Hex Torus Go',
  boardFamily: 'hex-torus',
  catalog: {
    group: 'Hexagonal',
    board: 'Hex torus',
    surface: '11x11 hex rhombus, opposite edges glued',
    spec: [
      '121 CELLS, 6 LIBERTIES EVERYWHERE',
      'NO CORNERS, NO EDGES, NO FIRST LINE',
      `KOMI ${HEXTGO_KOMI} (PROVISIONAL)`,
    ],
    badge: 'HEX TORUS',
    preview: 'hextorus',
  },
  initialState: () => initialHexTorusGoState(),
  isLegalMove: (state, move) => {
    if (state.gameOver) return false;
    if (move.kind === 'pass') return true;
    if (!Number.isInteger(move.cell) || move.cell < 0 || move.cell >= HEXTGO_CELL_COUNT) return false;
    return isValidHexTorusGoMove(state, move.cell, state.turn);
  },
  applyMove: (state, move) => {
    const next = move.kind === 'pass' ? applyHexTorusGoPass(state) : applyHexTorusGoPlace(state, move.cell);
    return { state: next, result: result(next) };
  },
  serialize: (state): HexTorusGoSnapshot => ({
    board: boardToString(state.board),
    turn: state.turn,
    gameOver: state.gameOver,
    passes: state.passes,
    captures: state.captures,
    lastMove: state.lastMove,
    seen: Array.from(state.seen),
  }),
  deserialize: (data) => {
    const d = data as HexTorusGoSnapshot;
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
