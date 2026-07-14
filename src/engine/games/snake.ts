// Pure Snake engine. The snake's head lives in the infinite plane: every tick
// it advances by its plane direction and project() maps the new plane cell onto
// the board, so wrapping / reflecting / rotating at each edge falls out of the
// topology with no per-mode code. The body is stored as board cells (the
// quotient identifies plane points, so self-collision is a board-cell test),
// while the head keeps true plane coordinates and a fixed plane direction - that
// is what makes a straight "rightward" run climb after a windmill seam or flip
// after a Mobius seam instead of being silently re-normalised. Randomness (food
// placement) is injected as a [0,1) number so the engine stays deterministic.

import { Topology, TOPOLOGY_MAP } from '../../topology.ts';
import { GameModule, GameResult } from '../core.ts';

export const SNAKE_SIZE = 13;

export type SnakeStatus = 'ready' | 'playing' | 'dead' | 'won';
export type Cell = [number, number];

// At most this many turns can be buffered ahead of the snake. A single-slot
// buffer would collapse two rapid presses into only the last one, letting the
// snake reverse straight into its neck in one tick; a short queue applies one
// turn per tick so quick presses become successive turns instead.
const MAX_QUEUE = 2;

export interface SnakeState {
  topo: Topology;
  size: number;
  body: Cell[];             // board cells, head at index 0
  headPlane: Cell;          // plane coordinates of the head (unbounded)
  dir: Cell;                // committed plane direction, one of the 4 unit steps
  dirQueue: Cell[];         // buffered turns, one applied per tick (FIFO)
  food: Cell | null;        // board cell
  score: number;
  status: SnakeStatus;
}

export type SnakeMove =
  | { kind: 'tick'; rand: number }
  | { kind: 'dir'; dir: Cell };

function key(r: number, c: number): string {
  return `${r},${c}`;
}

function freeCells(s: SnakeState): Cell[] {
  const occ = new Set(s.body.map(([r, c]) => key(r, c)));
  const free: Cell[] = [];
  for (let r = 0; r < s.size; r++) {
    for (let c = 0; c < s.size; c++) {
      if (!occ.has(key(r, c))) free.push([r, c]);
    }
  }
  return free;
}

// Places food on a random empty cell; a full board means the snake has won.
function withFood(s: SnakeState, rand: number): SnakeState {
  const free = freeCells(s);
  if (free.length === 0) return { ...s, food: null, status: 'won' };
  const idx = Math.min(free.length - 1, Math.floor(rand * free.length));
  return { ...s, food: free[idx] };
}

export function initialSnakeState(topo: Topology, rand: number): SnakeState {
  const size = SNAKE_SIZE;
  const mid = Math.floor(size / 2);
  const body: Cell[] = [[mid, mid], [mid, mid - 1], [mid, mid - 2]];
  const base: SnakeState = {
    topo,
    size,
    body,
    headPlane: [mid, mid],
    dir: [0, 1],
    dirQueue: [],
    food: null,
    score: 0,
    status: 'ready',
  };
  return withFood(base, rand);
}

// Buffers a turn. The reversal / no-op checks are against the last *queued*
// direction (falling back to the committed one), so two rapid presses become
// two successive turns rather than collapsing into a single-tick reversal into
// the neck. Any directional press also starts a game that is still 'ready'.
export function setSnakeDir(s: SnakeState, dir: Cell): SnakeState {
  if (s.status !== 'ready' && s.status !== 'playing') return s;

  const last = s.dirQueue.length ? s.dirQueue[s.dirQueue.length - 1] : s.dir;
  const reversal = s.body.length > 1 && dir[0] === -last[0] && dir[1] === -last[1];
  const noop = dir[0] === last[0] && dir[1] === last[1];
  const full = s.dirQueue.length >= MAX_QUEUE;
  const enqueue = !reversal && !noop && !full;

  if (!enqueue && s.status === 'playing') return s;
  return {
    ...s,
    status: 'playing',
    dirQueue: enqueue ? [...s.dirQueue, dir] : s.dirQueue,
  };
}

// Advances one tick, consuming one buffered turn if present. rand is only
// consumed if food gets eaten (respawn).
export function stepSnake(s: SnakeState, rand: number): SnakeState {
  if (s.status !== 'playing') return s;

  const dir = s.dirQueue.length ? s.dirQueue[0] : s.dir;
  const dirQueue = s.dirQueue.slice(1);
  const nextPlane: Cell = [s.headPlane[0] + dir[0], s.headPlane[1] + dir[1]];
  const p = s.topo.project(nextPlane[0], nextPlane[1], s.size);

  // Ran off a wall edge.
  if (!p) return { ...s, dir, dirQueue, status: 'dead' };

  const [hr, hc] = p;
  const eating = s.food != null && s.food[0] === hr && s.food[1] === hc;

  // The tail cell is about to vacate, so moving into it is legal unless growing.
  const occ = new Set(s.body.map(([r, c]) => key(r, c)));
  if (!eating) {
    const tail = s.body[s.body.length - 1];
    occ.delete(key(tail[0], tail[1]));
  }
  if (occ.has(key(hr, hc))) return { ...s, dir, dirQueue, status: 'dead' };

  const body: Cell[] = [[hr, hc], ...s.body];
  if (!eating) body.pop();

  let next: SnakeState = {
    ...s,
    body,
    headPlane: nextPlane,
    dir,
    dirQueue,
    food: eating ? null : s.food,
    score: eating ? s.score + 1 : s.score,
    status: 'playing',
  };
  if (eating) next = withFood(next, rand);
  return next;
}

function snakeResult(s: SnakeState): GameResult {
  if (s.status === 'dead' || s.status === 'won') return { status: 'done', winner: 'draw' };
  return { status: 'active', turn: 'black' };
}

// ==================== MODULE ====================
interface SnakeSnapshot {
  body: Cell[];
  headPlane: Cell;
  dir: Cell;
  dirQueue: Cell[];
  food: Cell | null;
  score: number;
  status: SnakeStatus;
  topo: string;
}

export const snakeModule: GameModule<SnakeState, SnakeMove, Topology> = {
  id: 'snake',
  name: 'Snake',
  boardFamily: 'square-grid',
  soloOnly: true,
  initialState: (topo) => initialSnakeState(topo, 0.5),
  isLegalMove: (state, move) =>
    move.kind === 'tick' ? state.status === 'playing' : state.status === 'ready' || state.status === 'playing',
  applyMove: (state, move) => {
    const next = move.kind === 'tick' ? stepSnake(state, move.rand) : setSnakeDir(state, move.dir);
    return { state: next, result: snakeResult(next) };
  },
  serialize: (state): SnakeSnapshot => ({
    body: state.body,
    headPlane: state.headPlane,
    dir: state.dir,
    dirQueue: state.dirQueue,
    food: state.food,
    score: state.score,
    status: state.status,
    topo: state.topo.id,
  }),
  deserialize: (data) => {
    const d = data as SnakeSnapshot;
    return {
      topo: TOPOLOGY_MAP.get(d.topo)!,
      size: SNAKE_SIZE,
      body: d.body,
      headPlane: d.headPlane,
      dir: d.dir,
      dirQueue: d.dirQueue ?? [],
      food: d.food,
      score: d.score,
      status: d.status,
    };
  },
};
