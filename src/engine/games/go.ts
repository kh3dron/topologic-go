// Pure Go engine. getNeighbors() projects the four plane neighbors through the
// topology, and group/liberty/capture/superko/scoring build on it, so all logic
// is topology-generic. On orbifold topologies a cell can be its own neighbor;
// the set-based group logic handles that. No module globals: the full GoState
// (including the superko position history) flows in and out explicitly.

import { Topology, TOPOLOGY_MAP } from '../../topology.ts';
import { Color, GameModule, GameResult, opponentOf } from '../core.ts';

export type GoStone = Color | null;
export type GoBoard = GoStone[][];

export const GO_SIZE = 19;
export const KOMI = 6.5;

export const STAR_POINTS = [
  [3, 3], [3, 9], [3, 15],
  [9, 3], [9, 9], [9, 15],
  [15, 3], [15, 9], [15, 15]
];

export type GoMove = { kind: 'place'; row: number; col: number } | { kind: 'pass' };

export interface GoState {
  board: GoBoard;
  turn: Color;
  gameOver: boolean;
  passes: number;
  captures: { black: number; white: number };
  lastMove: [number, number] | null;
  seen: Set<string>;
  topo: Topology;
}

function createInitialGoBoard(): GoBoard {
  return Array(GO_SIZE).fill(null).map(() => Array(GO_SIZE).fill(null));
}

function boardToString(board: GoBoard): string {
  return board.map(row => row.map(cell => cell ? cell[0] : '.').join('')).join('|');
}

export function getNeighbors(topo: Topology, row: number, col: number): [number, number][] {
  const neighbors: [number, number][] = [];
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const p = topo.project(row + dr, col + dc, GO_SIZE);
    if (p) neighbors.push(p);
  }
  return neighbors;
}

function getGroup(board: GoBoard, topo: Topology, row: number, col: number): Set<string> {
  const color = board[row][col];
  if (!color) return new Set();

  const group = new Set<string>();
  const stack: [number, number][] = [[row, col]];

  while (stack.length > 0) {
    const [r, c] = stack.pop()!;
    const key = `${r},${c}`;
    if (group.has(key)) continue;
    if (board[r][c] !== color) continue;

    group.add(key);

    for (const [nr, nc] of getNeighbors(topo, r, c)) {
      if (!group.has(`${nr},${nc}`) && board[nr][nc] === color) {
        stack.push([nr, nc]);
      }
    }
  }

  return group;
}

function getLiberties(board: GoBoard, topo: Topology, group: Set<string>): number {
  const liberties = new Set<string>();

  for (const pos of group) {
    const [row, col] = pos.split(',').map(Number);
    for (const [nr, nc] of getNeighbors(topo, row, col)) {
      if (board[nr][nc] === null) {
        liberties.add(`${nr},${nc}`);
      }
    }
  }

  return liberties.size;
}

function removeGroup(board: GoBoard, group: Set<string>): number {
  let count = 0;
  for (const pos of group) {
    const [row, col] = pos.split(',').map(Number);
    board[row][col] = null;
    count++;
  }
  return count;
}

export function isValidGoMove(state: GoState, row: number, col: number, color: Color): boolean {
  if (state.board[row][col] !== null) return false;

  const testBoard = state.board.map(r => [...r]);
  testBoard[row][col] = color;

  const opponent = opponentOf(color);
  let capturedAny = false;

  for (const [nr, nc] of getNeighbors(state.topo, row, col)) {
    if (testBoard[nr][nc] === opponent) {
      const group = getGroup(testBoard, state.topo, nr, nc);
      if (getLiberties(testBoard, state.topo, group) === 0) {
        removeGroup(testBoard, group);
        capturedAny = true;
      }
    }
  }

  const ourGroup = getGroup(testBoard, state.topo, row, col);
  if (getLiberties(testBoard, state.topo, ourGroup) === 0 && !capturedAny) {
    return false; // Suicide
  }

  // Positional superko: a move may not recreate any earlier board position
  if (state.seen.has(boardToString(testBoard))) {
    return false;
  }

  return true;
}

// Applies a (presumed valid) stone placement, returning a new state.
export function applyGoPlace(state: GoState, row: number, col: number): GoState {
  const board = state.board.map(r => [...r]);
  const mover = state.turn;
  board[row][col] = mover;

  const opponent = opponentOf(mover);
  let totalCaptured = 0;

  for (const [nr, nc] of getNeighbors(state.topo, row, col)) {
    if (board[nr][nc] === opponent) {
      const group = getGroup(board, state.topo, nr, nc);
      if (getLiberties(board, state.topo, group) === 0) {
        totalCaptured += removeGroup(board, group);
      }
    }
  }

  const captures = { ...state.captures };
  if (totalCaptured > 0) captures[mover] += totalCaptured;

  const seen = new Set(state.seen);
  seen.add(boardToString(board));

  return {
    board,
    turn: opponent,
    gameOver: false,
    passes: 0,
    captures,
    lastMove: [row, col],
    seen,
    topo: state.topo,
  };
}

export function applyGoPass(state: GoState): GoState {
  const passes = state.passes + 1;
  const gameOver = passes >= 2;
  return {
    ...state,
    turn: gameOver ? state.turn : opponentOf(state.turn),
    gameOver,
    passes,
    lastMove: null,
    // seen/captures/board carry over unchanged
    captures: { ...state.captures },
    seen: new Set(state.seen),
  };
}

export function initialGoState(topo: Topology): GoState {
  const board = createInitialGoBoard();
  return {
    board,
    turn: 'black',
    gameOver: false,
    passes: 0,
    captures: { black: 0, white: 0 },
    lastMove: null,
    seen: new Set([boardToString(board)]),
    topo,
  };
}

// ==================== SCORING ====================
export interface GoScore {
  blackTerritory: number;
  whiteTerritory: number;
  blackTotal: number;
  whiteTotal: number;
  winner: Color | 'draw';
}

export function scoreGo(state: GoState): GoScore {
  const board = state.board;
  const territory = { black: 0, white: 0 };
  const visited = new Set<string>();

  for (let row = 0; row < GO_SIZE; row++) {
    for (let col = 0; col < GO_SIZE; col++) {
      const key = `${row},${col}`;
      if (board[row][col] !== null || visited.has(key)) continue;

      const region: [number, number][] = [];
      const borderColors = new Set<Color>();
      const stack: [number, number][] = [[row, col]];
      visited.add(key);

      while (stack.length > 0) {
        const [r, c] = stack.pop()!;
        region.push([r, c]);

        for (const [nr, nc] of getNeighbors(state.topo, r, c)) {
          const stone = board[nr][nc];
          if (stone) {
            borderColors.add(stone);
          } else {
            const nKey = `${nr},${nc}`;
            if (!visited.has(nKey)) {
              visited.add(nKey);
              stack.push([nr, nc]);
            }
          }
        }
      }

      if (borderColors.size === 1) {
        const owner = borderColors.values().next().value!;
        territory[owner] += region.length;
      }
    }
  }

  const blackTotal = territory.black + state.captures.black;
  const whiteTotal = territory.white + state.captures.white + KOMI;

  return {
    blackTerritory: territory.black,
    whiteTerritory: territory.white,
    blackTotal,
    whiteTotal,
    winner: blackTotal > whiteTotal ? 'black' : blackTotal < whiteTotal ? 'white' : 'draw',
  };
}

// ==================== MODULE ====================
interface GoSnapshot {
  board: GoBoard;
  turn: Color;
  gameOver: boolean;
  passes: number;
  captures: { black: number; white: number };
  lastMove: [number, number] | null;
  seen: string[];
  topo: string;
}

function goResult(state: GoState): GameResult {
  if (!state.gameOver) return { status: 'active', turn: state.turn };
  return { status: 'done', winner: scoreGo(state).winner };
}

export const goModule: GameModule<GoState, GoMove, Topology> = {
  id: 'go',
  name: 'Go',
  boardFamily: 'square-grid',
  initialState: (topo) => initialGoState(topo),
  isLegalMove: (state, move) => {
    if (state.gameOver) return false;
    if (move.kind === 'pass') return true;
    return isValidGoMove(state, move.row, move.col, state.turn);
  },
  applyMove: (state, move) => {
    const next = move.kind === 'pass' ? applyGoPass(state) : applyGoPlace(state, move.row, move.col);
    return { state: next, result: goResult(next) };
  },
  serialize: (state): GoSnapshot => ({
    board: state.board,
    turn: state.turn,
    gameOver: state.gameOver,
    passes: state.passes,
    captures: state.captures,
    lastMove: state.lastMove,
    seen: Array.from(state.seen),
    topo: state.topo.id,
  }),
  deserialize: (data) => {
    const d = data as GoSnapshot;
    return {
      board: d.board,
      turn: d.turn,
      gameOver: d.gameOver,
      passes: d.passes,
      captures: d.captures,
      lastMove: d.lastMove,
      seen: new Set(d.seen),
      topo: TOPOLOGY_MAP.get(d.topo)!,
    };
  },
};
