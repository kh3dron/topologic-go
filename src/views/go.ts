import { Topology } from '../topology';
import {
  GO_SIZE, KOMI, STAR_POINTS, goBoard, goCurrentTurn, goGameOver, goCaptures, goLastMove,
  isValidGoMove, placeGoStone, scoreGo, resetGo, loadGoState, setGoOnline,
} from '../go';
import { CellOpts, GameView, InfoPanel, RenderDeps, capitalize } from './kit';

const GO_CELL = 32;

// Per-render caches: legal-placement validity per intersection, and a map from
// canonical position to every tile element showing it (for hover sync).
let validCache: boolean[][] = [];
const intersectionMap = new Map<string, HTMLElement[]>();

function syncHover(row: number, col: number, on: boolean): void {
  const els = intersectionMap.get(`${row},${col}`);
  if (!els) return;
  for (const el of els) el.classList.toggle('hover-synced', on);
}

export const goView: GameView = {
  id: 'go',
  name: 'Go',
  shortName: 'Go',
  family: 'square-grid',
  usesTopology: true,
  showsPassButton: true,
  cellBase: GO_CELL,
  size: GO_SIZE,

  reset: () => resetGo(),
  loadState: (s) => loadGoState(s),
  setOnline: (o) => setGoOnline(o),

  status(): string {
    if (goGameOver) {
      const score = scoreGo();
      const result = score.winner === 'draw' ? 'Draw' : `${capitalize(score.winner)} wins`;
      return `Black ${score.blackTotal} : White ${score.whiteTotal} (komi ${KOMI}) - ${result}`;
    }
    return `${capitalize(goCurrentTurn)}'s turn - B: ${goCaptures.black} W: ${goCaptures.white}`;
  },

  infoPanel(topo: Topology): InfoPanel {
    return { description: topo.goDesc, article: topo.article, spec: topo.spec, links: topo.links };
  },

  prepareRender(): void {
    intersectionMap.clear();
    validCache = Array(GO_SIZE).fill(null).map(() => Array(GO_SIZE).fill(false));
    if (!goGameOver) {
      for (let row = 0; row < GO_SIZE; row++) {
        for (let col = 0; col < GO_SIZE; col++) {
          if (!goBoard[row][col]) validCache[row][col] = isValidGoMove(row, col, goCurrentTurn);
        }
      }
    }
  },

  createCell(row: number, col: number, opts: CellOpts, deps: RenderDeps): HTMLElement {
    const intersection = document.createElement('div');
    intersection.className = 'go-intersection';

    const key = `${row},${col}`;
    const mapped = intersectionMap.get(key);
    if (mapped) mapped.push(intersection); else intersectionMap.set(key, [intersection]);

    if (opts.walls.top) intersection.classList.add('edge-top');
    if (opts.walls.bottom) intersection.classList.add('edge-bottom');
    if (opts.walls.left) intersection.classList.add('edge-left');
    if (opts.walls.right) intersection.classList.add('edge-right');

    const isStarPoint = STAR_POINTS.some(([r, c]) => r === row && c === col);
    if (isStarPoint && !goBoard[row][col]) {
      intersection.classList.add('star-point');
      const starDot = document.createElement('div');
      starDot.className = 'star-dot';
      intersection.appendChild(starDot);
    }

    const stone = goBoard[row][col];
    if (stone) {
      intersection.classList.add('has-stone');
      const stoneEl = document.createElement('div');
      stoneEl.className = `go-stone ${stone}-stone`;
      intersection.appendChild(stoneEl);
    }

    if (goLastMove && goLastMove[0] === row && goLastMove[1] === col) {
      intersection.classList.add('last-move');
    }

    if (!stone && validCache[row][col]) {
      intersection.classList.add('valid-move');
      intersection.classList.add(`${goCurrentTurn}-turn`);
      const ghostStone = document.createElement('div');
      ghostStone.className = `ghost-stone ${goCurrentTurn}-ghost`;
      intersection.appendChild(ghostStone);
    }

    intersection.addEventListener('click', () => {
      if (goGameOver) return;
      if (placeGoStone(row, col)) {
        deps.refreshStatus();
        deps.rerender();
      }
    });

    intersection.addEventListener('mouseenter', () => {
      if (deps.hoverSuppressed()) return;
      if (deps.tessellated()) syncHover(row, col, true);
    });

    intersection.addEventListener('mouseleave', () => {
      if (deps.tessellated()) syncHover(row, col, false);
    });

    return intersection;
  },
};
