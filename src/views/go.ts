import { Topology } from '../topology';
import {
  starPoints, goBoard, goSize, goKomi, goCurrentTurn, goGameOver, goCaptures, goLastMove,
  canPlayGoNow, isValidGoMove, placeGoStone, scoreGo, resetGo, loadGoState, serializeGo, setGoOnline,
} from '../go';
import { CellOpts, GameView, InfoPanel, RenderDeps, capitalize } from './kit';

const GO_CELL = 32;

// Per-render caches: legal-placement validity per intersection, star-point
// positions for the current size, and a map from canonical position to every
// tile element showing it (for hover sync).
let validCache: boolean[][] = [];
let starSet = new Set<string>();
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
  keyboardCursor: true,
  cellBase: GO_CELL,
  size: () => goSize,

  reset: () => resetGo(),
  loadState: (s) => loadGoState(s),
  saveState: () => serializeGo(),
  setOnline: (o) => setGoOnline(o),

  status(): string {
    if (goGameOver) {
      const score = scoreGo();
      const result = score.winner === 'draw' ? 'Draw' : `${capitalize(score.winner)} wins`;
      return `Black ${score.blackTotal} : White ${score.whiteTotal} (komi ${goKomi}) - ${result}`;
    }
    return `${capitalize(goCurrentTurn)}'s turn - B: ${goCaptures.black} W: ${goCaptures.white}`;
  },

  infoPanel(topo: Topology): InfoPanel {
    return { description: topo.goDesc, article: topo.article, spec: topo.spec, links: topo.links };
  },

  prepareRender(): void {
    intersectionMap.clear();
    starSet = new Set(starPoints(goSize).map(([r, c]) => `${r},${c}`));
    validCache = Array(goSize).fill(null).map(() => Array(goSize).fill(false));
    // Hover ghosts/crosshair only when the local player can actually move
    // (offline always; online only on their turn, never for spectators).
    if (canPlayGoNow()) {
      for (let row = 0; row < goSize; row++) {
        for (let col = 0; col < goSize; col++) {
          if (!goBoard[row][col]) validCache[row][col] = isValidGoMove(row, col, goCurrentTurn);
        }
      }
    }
  },

  createCell(row: number, col: number, opts: CellOpts, deps: RenderDeps): HTMLElement {
    const intersection = document.createElement('div');
    registerIntersection(intersection, row, col);
    syncIntersection(intersection, row, col, opts);

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

  updateCell(el: HTMLElement, row: number, col: number, opts: CellOpts): void {
    registerIntersection(el, row, col); // prepareRender cleared the hover map
    syncIntersection(el, row, col, opts);
  },
};

function registerIntersection(el: HTMLElement, row: number, col: number): void {
  const key = `${row},${col}`;
  const mapped = intersectionMap.get(key);
  if (mapped) mapped.push(el); else intersectionMap.set(key, [el]);
}

// Signature of the last-applied presentation per element, so the in-place
// update touches only cells that actually changed.
const cellSig = new WeakMap<HTMLElement, string>();

// Desired presentation of the intersection, shared by create and in-place
// update. Children (star dot / stone / ghost) are rebuilt only when the
// signature moved.
function syncIntersection(el: HTMLElement, row: number, col: number, opts: CellOpts): void {
  const key = `${row},${col}`;
  let cls = 'go-intersection';
  if (opts.walls.top) cls += ' edge-top';
  if (opts.walls.bottom) cls += ' edge-bottom';
  if (opts.walls.left) cls += ' edge-left';
  if (opts.walls.right) cls += ' edge-right';

  const stone = goBoard[row][col];
  const star = starSet.has(key) && !stone;
  const ghost = !stone && validCache[row][col];
  if (star) cls += ' star-point';
  if (stone) cls += ' has-stone';
  if (goLastMove && goLastMove[0] === row && goLastMove[1] === col) cls += ' last-move';
  if (ghost) cls += ` valid-move ${goCurrentTurn}-turn`;

  const sig = `${cls}|${stone ?? ''}`;
  if (cellSig.get(el) === sig) return;
  cellSig.set(el, sig);

  el.className = cls;
  const kids: HTMLElement[] = [];
  if (star) {
    const starDot = document.createElement('div');
    starDot.className = 'star-dot';
    kids.push(starDot);
  }
  if (stone) {
    const stoneEl = document.createElement('div');
    stoneEl.className = `go-stone ${stone}-stone`;
    kids.push(stoneEl);
  }
  if (ghost) {
    const ghostStone = document.createElement('div');
    ghostStone.className = `ghost-stone ${goCurrentTurn}-ghost`;
    kids.push(ghostStone);
  }
  el.replaceChildren(...kids);
}
