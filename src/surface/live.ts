// Live 3D surface for the play page: the current position painted onto the
// glued surface, repainted after every board render, and clickable - a click
// on the surface resolves to a canonical cell and clicks that cell's DOM
// element, so moves made in 3D ride the exact same code path as the grid.

import { currentGame, currentTopology } from '../state';
import { chessBoard, getLegalDestinations, selectedSquare } from '../chess';
import { goBoard, goLastMove } from '../go';
import { snakeBodySet, snakeFood, snakeHeadKey } from '../snake';
import { viewFor } from '../views';
import { clickCanonicalCell, onBoardRendered } from '../render';
import { createStage, Stage, StageBoard } from './stage';
import { planSurface } from './plan';
import { edgeRamps, paintChess, paintEdgeStrips, paintGo } from './texture';

export interface LiveSurface {
  refresh(): void;          // game or topology changed: rebuild the board
  destroy(): void;
}

const FOLD_SECONDS = 1.4;

function paintSnakeLive(ctx: CanvasRenderingContext2D, px: number, n: number): void {
  const cell = px / n;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#1f3b2c' : '#1a3226';
      ctx.fillRect(c * cell, r * cell, cell + 1, cell + 1);
    }
  }
  const pad = cell * 0.08;
  for (const key of snakeBodySet) {
    const [r, c] = key.split(',').map(Number);
    ctx.fillStyle = key === snakeHeadKey ? '#b8f5c9' : '#4fbf78';
    ctx.fillRect(c * cell + pad, r * cell + pad, cell - 2 * pad, cell - 2 * pad);
  }
  if (snakeFood) {
    ctx.fillStyle = '#ff4d3a';
    ctx.beginPath();
    ctx.arc((snakeFood[1] + 0.5) * cell, (snakeFood[0] + 0.5) * cell, cell * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function mountLiveSurface(canvas: HTMLCanvasElement, nameEl: HTMLElement, foldBtn: HTMLButtonElement): LiveSurface {
  const stage: Stage = createStage(canvas, { autoFold: false, comets: false, autoSpin: 0.12, distance: 5.3 });
  let fold = 1;
  let target = 1;
  let tween = 0;
  let dirty = 0;

  function boardNow(): StageBoard {
    const topo = currentTopology;
    const plan = planSurface(topo);
    const ramps = edgeRamps(topo, plan);
    return {
      plan, topo, ramps,
      paint(ctx, px) {
        if (currentGame === 'go') {
          paintGo(ctx, px, { board: goBoard, lastMove: goLastMove });
        } else if (currentGame === 'snake') {
          paintSnakeLive(ctx, px, viewFor('snake').size());
        } else {
          const dests = selectedSquare ? getLegalDestinations(selectedSquare[0], selectedSquare[1]) : null;
          paintChess(ctx, px, { board: chessBoard, selected: selectedSquare, dests });
        }
        paintEdgeStrips(ctx, px, ramps, 0.012);
      },
    };
  }

  function refresh(): void {
    const b = boardNow();
    nameEl.textContent = b.plan.name;
    stage.setBoard(b);
  }

  // Coalesce bursts of renders (drag, snake ticks) into one repaint per frame.
  onBoardRendered(() => {
    if (dirty) return;
    dirty = requestAnimationFrame(() => { dirty = 0; stage.repaint(); });
  });

  function animateFold(now: number, last: number): void {
    const dt = (now - last) / 1000;
    const step = dt / FOLD_SECONDS;
    fold = target > fold ? Math.min(target, fold + step) : Math.max(target, fold - step);
    const k = fold * fold * (3 - 2 * fold);
    stage.setFold(k);
    if (fold !== target) tween = requestAnimationFrame(t => animateFold(t, now));
    else tween = 0;
  }

  foldBtn.addEventListener('click', () => {
    target = target === 1 ? 0 : 1;
    foldBtn.textContent = target === 1 ? 'Unfold' : 'Fold';
    if (!tween) {
      const t0 = performance.now();
      tween = requestAnimationFrame(t => animateFold(t, t0));
    }
  });

  // click (not drag) on the surface plays the cell under the pointer
  let downX = 0, downY = 0;
  canvas.addEventListener('pointerdown', e => { downX = e.clientX; downY = e.clientY; });
  canvas.addEventListener('pointerup', e => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
    const uv = stage.pick(e.clientX, e.clientY);
    if (!uv) return;
    const n = viewFor(currentGame).size();
    const col = Math.min(n - 1, Math.max(0, Math.floor(uv[0] * n)));
    const row = Math.min(n - 1, Math.max(0, Math.floor(uv[1] * n)));
    clickCanonicalCell(row, col);
  });

  refresh();
  stage.setFold(1);

  return {
    refresh,
    destroy() {
      cancelAnimationFrame(tween);
      cancelAnimationFrame(dirty);
      stage.destroy();
    },
  };
}
