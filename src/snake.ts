// Stateful browser wrapper around the pure Snake engine (engine/games/snake.ts).
// Owns the single live SnakeState and exposes render-friendly live bindings, the
// same pattern as go.ts. Randomness (food placement) is injected here via
// Math.random so the engine stays deterministic. Snake is single-player, so
// there is no online gating.

import { currentTopology } from './state';
import {
  SnakeState, SnakeStatus, Cell, SNAKE_SIZE,
  initialSnakeState, stepSnake, setSnakeDir,
} from './engine/games/snake';

export { SNAKE_SIZE };
export type { SnakeStatus, Cell };

// Run log for server-side score validation (submit-snake-score replays it
// through the same engine). foodRands are the Math.random values consumed by
// food placement ([0] = initial food, one more per eat); events is the input
// stream in applied order — a positive integer is a run of that many ticks, a
// negative code is a steer (see DIR_CODES).
let runFoodRands: number[] = [];
let runEvents: number[] = [];
let runTicks = 0;

const DIR_CODES: [Cell, number][] = [
  [[-1, 0], -1], [[1, 0], -2], [[0, -1], -3], [[0, 1], -4],
];

export interface SnakeRunLog {
  topology: string;
  score: number;
  foodRands: number[];
  events: number[];
}

export function snakeEnded(): boolean {
  return state.status === 'dead' || state.status === 'won';
}

export function snakeRunLog(): SnakeRunLog {
  return {
    topology: state.topo.id,
    score: state.score,
    foodRands: runFoodRands.slice(),
    events: runEvents.slice(),
  };
}

function newRun(): SnakeState {
  const r = Math.random();
  runFoodRands = [r];
  runEvents = [];
  runTicks = 0;
  return initialSnakeState(currentTopology, r);
}

let state: SnakeState = newRun();

// Live bindings read by views/snake.ts.
export let snakeBodySet: Set<string> = new Set();
export let snakeHeadKey = '';
export let snakeFood: Cell | null = state.food;
export let snakeScore = state.score;
export let snakeStatus: SnakeStatus = state.status;
export let snakeLength = state.body.length;

function sync(): void {
  snakeBodySet = new Set(state.body.map(([r, c]) => `${r},${c}`));
  snakeHeadKey = `${state.body[0][0]},${state.body[0][1]}`;
  snakeFood = state.food;
  snakeScore = state.score;
  snakeStatus = state.status;
  snakeLength = state.body.length;
}

sync();

export function resetSnake(): void {
  state = newRun();
  sync();
}

const MAX_LOGGED_TICKS = 100_000; // mirrors the server cap; log just stops growing

export function tickSnake(): void {
  const r = Math.random();
  const before = state.score;
  state = stepSnake(state, r);
  if (state.score > before) runFoodRands.push(r);
  if (runTicks < MAX_LOGGED_TICKS) {
    runTicks++;
    const last = runEvents.length - 1;
    if (last >= 0 && runEvents[last] > 0) runEvents[last]++;
    else runEvents.push(1);
  }
  sync();
}

export function steerSnake(dir: Cell): void {
  state = setSnakeDir(state, dir);
  const code = DIR_CODES.find(([d]) => d[0] === dir[0] && d[1] === dir[1]);
  if (code) runEvents.push(code[1]);
  sync();
}
