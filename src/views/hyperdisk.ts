// Shared Poincare-disk canvas scaffolding for games on the {4,6} hyperbolic
// board (hyperchess, hypergo). Owns everything game-agnostic: canvas setup,
// the view transform and hyperbolic drag-to-pan, cell hit-testing, the disk
// horizon, cell polygon paths, thin cell edges, and thick wall edges. A game
// supplies a DiskPaint: how to fill a cell, what to draw on top of it, the
// cursor, and the click handler. Each createDiskRenderer() instance keeps its
// own view transform and window listeners, so the two games pan independently
// and an inactive game's stale canvas can never react to events (dragging is
// only ever armed by that instance's live canvas).

import {
  hyperCells, hyperNeighbors, HYPER_BASE_BOUNDARY,
  HYPER_INRADIUS, HYPER_CIRCUMRADIUS,
  mobMul, mobInverse, mobApply, mobTranslation0, mobDistRatio,
} from '../hyperchess';
import type { HyperCell, Mob, C } from '../hyperchess';
import { Extent, RenderDeps } from './kit';

export const HYPER_CELL = 28; // zoom unit: cellPx / HYPER_CELL scales the disk
const ORIGIN: C = { re: 0, im: 0 };
const CELL_HIT_RATIO = Math.tanh(HYPER_CIRCUMRADIUS / 2) * 1.02;
const MAX_PAN_RATIO = 0.99999; // ~ hyperbolic distance 12 from board centre
const DRAG_CLICK_THRESHOLD = 5;

export interface DiskPaint<D> {
  // Initial view centre (board coordinates); reset returns here.
  home: C;
  // Compute per-draw shared state once (selection, legal dests, ...).
  prepareDraw(): D;
  // Fill the current path (the cell polygon is already constructed).
  fillCell(ctx: CanvasRenderingContext2D, cell: HyperCell, apparent: number, d: D): void;
  // Draw cell contents (pieces, stones, markers) on top of edges and walls.
  drawContents(ctx: CanvasRenderingContext2D, cell: HyperCell, px: number, py: number, apparent: number, d: D): void;
  // Pointer feedback while not dragging.
  cursorFor(cell: number | null): string;
  onClick(cell: number, deps: RenderDeps): void;
}

export interface DiskRenderer {
  renderCustom(boardEl: HTMLElement, cellPx: number, deps: RenderDeps): Extent;
  resetView(): void;
}

export function createDiskRenderer<D>(paint: DiskPaint<D>): DiskRenderer {
  const homeView = (): Mob => mobInverse(mobTranslation0(paint.home));

  let viewT: Mob = homeView();

  interface CanvasHandle {
    canvas: HTMLCanvasElement;
    draw: () => void;
    toDisk: (e: MouseEvent) => C | null;
    deps: RenderDeps;
  }
  let current: CanvasHandle | null = null;
  let listenersInstalled = false;
  let dragging = false;
  let dragMoved = 0;
  let dragZ: C | null = null;

  function hitCell(z: C): number | null {
    const w = mobApply(mobInverse(viewT), z);
    let best: number | null = null;
    let bestD = CELL_HIT_RATIO;
    for (const cell of hyperCells()) {
      const d = mobDistRatio(cell.center, w);
      if (d < bestD) {
        bestD = d;
        best = cell.id;
      }
    }
    return best;
  }

  function installListeners(): void {
    if (listenersInstalled) return;
    listenersInstalled = true;

    window.addEventListener('mousemove', (e) => {
      if (!current || !dragging) return;
      const z = current.toDisk(e);
      if (!z || !dragZ) return;
      dragMoved += Math.abs(e.movementX) + Math.abs(e.movementY);
      const t = mobMul(mobTranslation0(z), mobInverse(mobTranslation0(dragZ)));
      const next = mobMul(t, viewT);
      const centre = mobApply(mobInverse(next), ORIGIN);
      if (Math.hypot(centre.re, centre.im) < MAX_PAN_RATIO) {
        viewT = next;
        current.draw();
      }
      dragZ = z;
    });

    window.addEventListener('mouseup', (e) => {
      if (!current || !dragging) return;
      dragging = false;
      current.canvas.style.cursor = 'grab';
      if (dragMoved <= DRAG_CLICK_THRESHOLD) {
        const z = current.toDisk(e);
        const cell = z ? hitCell(z) : null;
        if (cell !== null) paint.onClick(cell, current.deps);
      }
    });
  }

  return {
    resetView(): void {
      viewT = homeView();
    },

    renderCustom(boardEl: HTMLElement, cellPx: number, deps: RenderDeps): Extent {
      const container = boardEl.parentElement as HTMLElement | null;
      const W = container?.clientWidth || 800;
      const H = container?.clientHeight || 600;
      const dpr = window.devicePixelRatio || 1;
      const diskR = (Math.min(W, H) / 2 - 12) * (cellPx / HYPER_CELL);
      const cx = W / 2;
      const cy = H / 2;

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      canvas.className = 'hyper-canvas';
      const ctx = canvas.getContext('2d')!;

      const toScreen = (z: C): [number, number] => [cx + z.re * diskR, cy - z.im * diskR];
      const toDisk = (e: MouseEvent): C | null => {
        const rect = canvas.getBoundingClientRect();
        const z: C = { re: (e.clientX - rect.left - cx) / diskR, im: -(e.clientY - rect.top - cy) / diskR };
        return Math.hypot(z.re, z.im) < 0.999 ? z : null;
      };

      const draw = (): void => {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);

        // The horizon: everything inside is the (infinite) hyperbolic plane.
        ctx.beginPath();
        ctx.arc(cx, cy, diskR, 0, 2 * Math.PI);
        ctx.fillStyle = '#3a3a3e';
        ctx.fill();
        ctx.strokeStyle = '#565660';
        ctx.lineWidth = 1;
        ctx.stroke();

        const d = paint.prepareDraw();

        for (const cell of hyperCells()) {
          const m = mobMul(viewT, cell.transform);
          const centre = mobApply(m, ORIGIN);
          // Conformal factor: hyperbolic length L at z spans ~ L*(1-|z|^2)/2
          // Euclidean units, so this is the cell's apparent inradius in px.
          const apparent = HYPER_INRADIUS * ((1 - centre.re * centre.re - centre.im * centre.im) / 2) * diskR;
          if (apparent < 0.75) continue;

          const pts = HYPER_BASE_BOUNDARY.map(p => toScreen(mobApply(m, p)));
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
          ctx.closePath();

          paint.fillCell(ctx, cell, apparent, d);

          ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.lineWidth = Math.min(1, Math.max(0.3, apparent * 0.02));
          ctx.stroke();

          // Wall edges: the board ends here (thick ink, like the classic border).
          const neighbors = hyperNeighbors(cell.id);
          for (let e = 0; e < 4; e++) {
            if (neighbors[e] !== null) continue;
            ctx.beginPath();
            ctx.moveTo(pts[4 * e][0], pts[4 * e][1]);
            for (let i = 1; i <= 4; i++) {
              const p = pts[(4 * e + i) % pts.length];
              ctx.lineTo(p[0], p[1]);
            }
            ctx.strokeStyle = '#17171a';
            ctx.lineWidth = Math.max(1, apparent * 0.14);
            ctx.stroke();
          }

          const [px, py] = toScreen(centre);
          paint.drawContents(ctx, cell, px, py, apparent, d);
        }
      };

      draw();

      canvas.style.cursor = 'grab';
      canvas.addEventListener('mousedown', (e) => {
        dragging = true;
        dragMoved = 0;
        dragZ = toDisk(e);
        canvas.style.cursor = 'grabbing';
        e.preventDefault();
      });
      canvas.addEventListener('mousemove', (e) => {
        if (dragging) return;
        const z = toDisk(e);
        canvas.style.cursor = paint.cursorFor(z ? hitCell(z) : null);
      });

      current = { canvas, draw, toDisk, deps };
      installListeners();

      boardEl.style.display = 'block';
      boardEl.style.width = `${W}px`;
      boardEl.style.height = `${H}px`;
      boardEl.appendChild(canvas);

      return { w: W, h: H };
    },
  };
}
