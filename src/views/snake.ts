import { Topology } from '../topology';
import {
  Cell, SNAKE_SIZE, SnakeRunLog,
  snakeBodySet, snakeHeadKey, snakeFood, snakeScore, snakeStatus, snakeLength,
  resetSnake, tickSnake, steerSnake, snakeRunLog, snakeEnded,
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
    if (snakeEnded()) void submitScore(snakeRunLog());
    deps?.rerender();
    deps?.refreshStatus();
  }, TICK_MS);
}

// Appended to the end-of-game status line once the leaderboard submission
// resolves (empty while playing / offline / signed out).
let scoreNote = '';

// Post the finished run to the leaderboard. Lazy imports keep the Supabase SDK
// out of the offline play bundle (same rule as net/online.ts); the env check
// avoids even loading the modules on builds without a backend.
async function submitScore(log: SnakeRunLog): Promise<void> {
  scoreNote = '';
  if (!import.meta.env.VITE_SUPABASE_URL || log.score <= 0) return;
  try {
    const [{ currentUser }, { submitSnakeScore }] = await Promise.all([
      import('../net/auth'),
      import('../net/scores'),
    ]);
    const me = await currentUser();
    if (!me) {
      scoreNote = 'sign in to post scores';
    } else {
      const res = await submitSnakeScore(log);
      scoreNote = res.improved
        ? 'new personal best, saved to the leaderboard'
        : `your best here is ${res.best}`;
    }
  } catch {
    scoreNote = '';
  }
  deps?.refreshStatus();
}

export const snakeView: GameView = {
  id: 'snake',
  name: 'Snake',
  shortName: 'Snake',
  family: 'square-grid',
  usesTopology: true,
  showsPassButton: false,
  cellBase: SNAKE_CELL,
  size: () => SNAKE_SIZE,

  reset: () => {
    resetSnake();
    scoreNote = '';
    installKeys();
    startLoop();
  },
  loadState: () => {},   // solo game: no online state to load
  setOnline: () => {},

  status(): string {
    const note = scoreNote ? ` - ${scoreNote}` : '';
    switch (snakeStatus) {
      case 'ready': return 'Press an arrow key or WASD to start';
      case 'dead': return `Game over - score ${snakeScore}${note} - New Game to retry`;
      case 'won': return `Board filled - score ${snakeScore}${note} - you win`;
      default: return `Score ${snakeScore} - length ${snakeLength}`;
    }
  },

  scoreHud: () => `Score ${snakeScore}`,

  infoPanel(topo: Topology): InfoPanel {
    return {
      description: `Arrow keys or WASD to steer. ${topo.snakeDesc}`,
      article: topo.article,
      spec: topo.spec,
      links: [{ label: 'Snake leaderboard', url: './leaderboard.html' }, ...topo.links],
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
