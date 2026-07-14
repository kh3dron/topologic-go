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

let state: SnakeState = initialSnakeState(currentTopology, Math.random());

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
  state = initialSnakeState(currentTopology, Math.random());
  sync();
}

export function tickSnake(): void {
  state = stepSnake(state, Math.random());
  sync();
}

export function steerSnake(dir: Cell): void {
  state = setSnakeDir(state, dir);
  sync();
}
