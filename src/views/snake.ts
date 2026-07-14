import { Topology } from '../topology';
import {
  Cell, SNAKE_SIZE,
  snakeBodySet, snakeHeadKey, snakeFood, snakeScore, snakeStatus, snakeLength,
  resetSnake, tickSnake, steerSnake,
} from '../snake';
import { CellOpts, GameView, InfoPanel, RenderDeps } from './kit';

const SNAKE_CELL = 34;
const TICK_MS = 150;

// Arrow keys / WASD map to fixed plane directions (row grows downward). The
// engine keeps the head in plane space, so a held direction stays constant even
// as project() turns it into a climb / flip / teleport across a seam.
const DIRS: Record<string, Cell> = {
  ArrowUp: [-1, 0], w: [-1, 0], W: [-1, 0],
  ArrowDown: [1, 0], s: [1, 0], S: [1, 0],
  ArrowLeft: [0, -1], a: [0, -1], A: [0, -1],
  ArrowRight: [0, 1], d: [0, 1], D: [0, 1],
};

// Captured once per render from createCell so the tick loop can re-render / update
// the status line without views importing render.ts (keeps render -> views one-way).
let deps: RenderDeps | null = null;
let tickTimer: number | null = null;
let keysInstalled = false;

function installKeys(): void {
  if (keysInstalled) return;
  keysInstalled = true;
  window.addEventListener('keydown', (e) => {
    const dir = DIRS[e.key];
    if (!dir) return;
    e.preventDefault();
    steerSnake(dir);
    deps?.refreshStatus();
  });
}

function startLoop(): void {
  if (tickTimer !== null) return;
  tickTimer = window.setInterval(() => {
    if (snakeStatus !== 'playing') return;
    tickSnake();
    deps?.rerender();
    deps?.refreshStatus();
  }, TICK_MS);
}

export const snakeView: GameView = {
  id: 'snake',
  name: 'Snake',
  shortName: 'Snake',
  family: 'square-grid',
  usesTopology: true,
  showsPassButton: false,
  cellBase: SNAKE_CELL,
  size: SNAKE_SIZE,

  reset: () => {
    resetSnake();
    installKeys();
    startLoop();
  },
  loadState: () => {},   // solo game: no online state to load
  setOnline: () => {},

  status(): string {
    switch (snakeStatus) {
      case 'ready': return 'Press an arrow key or WASD to start';
      case 'dead': return `Game over - score ${snakeScore} - New Game to retry`;
      case 'won': return `Board filled - score ${snakeScore} - you win`;
      default: return `Score ${snakeScore} - length ${snakeLength}`;
    }
  },

  infoPanel(topo: Topology): InfoPanel {
    return {
      description: `Arrow keys or WASD to steer. ${topo.snakeDesc}`,
      article: topo.article,
      spec: topo.spec,
      links: topo.links,
    };
  },

  createCell(row: number, col: number, opts: CellOpts, d: RenderDeps): HTMLElement {
    deps = d;

    const cell = document.createElement('div');
    cell.className = `snake-cell ${opts.light ? 'light' : 'dark'}`;

    if (opts.walls.top) cell.classList.add('edge-top');
    if (opts.walls.bottom) cell.classList.add('edge-bottom');
    if (opts.walls.left) cell.classList.add('edge-left');
    if (opts.walls.right) cell.classList.add('edge-right');

    const k = `${row},${col}`;
    if (k === snakeHeadKey) cell.classList.add('snake-head');
    else if (snakeBodySet.has(k)) cell.classList.add('snake-body');

    if (snakeFood && snakeFood[0] === row && snakeFood[1] === col) cell.classList.add('snake-food');

    return cell;
  },
};
