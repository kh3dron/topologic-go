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
import { createStage, Stage, StageBoard, View } from './stage';
import { planSurface } from './plan';
import { paintChess, paintGo } from './texture';

export interface LiveSurface {
  refresh(): void;          // game or topology changed: rebuild the board
  destroy(): void;
}

function paintSnakeLive(ctx: CanvasRenderingContext2D, px: number, n: number): void {
  const cell = px / n;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#2f5a43' : '#284e3a';
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

export function mountLiveSurface(canvas: HTMLCanvasElement, nameEl: HTMLElement, viewButtons: HTMLButtonElement[]): LiveSurface {
  const syncButtons = (v: View) => {
    for (const b of viewButtons) b.classList.toggle('active', b.dataset.view === v);
  };
  const stage: Stage = createStage(canvas, {
    initialView: 'surface', autoSpin: 0.12, distance: 5.3, onView: syncButtons,
  });
  let dirty = 0;

  function boardNow(): StageBoard {
    const topo = currentTopology;
    const plan = planSurface(topo);
    return {
      plan, topo,
      paint(ctx, px) {
        if (currentGame === 'go') {
          paintGo(ctx, px, { board: goBoard, lastMove: goLastMove });
        } else if (currentGame === 'snake') {
          paintSnakeLive(ctx, px, viewFor('snake').size());
        } else {
          const dests = selectedSquare ? getLegalDestinations(selectedSquare[0], selectedSquare[1]) : null;
          paintChess(ctx, px, { board: chessBoard, selected: selectedSquare, dests });
        }
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

  for (const b of viewButtons) {
    b.addEventListener('click', () => stage.setView(b.dataset.view as View));
  }
  syncButtons('surface');

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

  return {
    refresh,
    destroy() {
      cancelAnimationFrame(dirty);
      stage.destroy();
    },
  };
}
