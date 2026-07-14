// Board-fixed topology preview for the catalog picker. A short snake runs in a
// straight plane line; project() maps each step onto a single board tile, so the
// snake wraps / bounces / turns exactly the way it would in-game - the animation
// is the real topology, never a canned per-mode effect. Travel direction is the
// axis with the most interesting seam (reflect / rotate over plain wrap), derived
// by probing project() via tileOrientation, so new topologies animate for free.

import { Topology, tileOrientation } from './topology';
import { allHexCells, hexColorIndex } from './engine/games/hexchess';

const SIZE = 12;
const LEN = 4;
const TICK_MS = 150;
const DEAD_PAUSE = 7;   // ticks frozen on a wall hit before restarting
const PAD = 10;
const MID = Math.floor(SIZE / 2);

const LIGHT = '#1c1c1c';
const DARK = '#171717';
const HEAD = '#7be3a2';
const BODY = '#3c9a5f';
const BG = '#141414';
const HEX_COLORS = ['#e8e8e8', '#b0b0b0', '#7d7d7d'];   // Glinski 3-colouring

type Vec = [number, number];

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

type SeamType = 'wall' | 'wrap' | 'reflect' | 'rotate';
interface Seam { score: number; type: SeamType; }

// Classifies one axis by probing the neighbouring tile: a wall axis (null
// period) scores 0, a plain wrap 1, and a reflect / rotate 2 so the demo
// prefers to show off the more interesting glue.
function axisSeam(topo: Topology, axis: 'x' | 'y'): Seam {
  const period = axis === 'x' ? topo.periodX : topo.periodY;
  if (period == null) return { score: 0, type: 'wall' };
  const o0 = tileOrientation(topo, 0, 0, SIZE);
  const o1 = axis === 'x' ? tileOrientation(topo, 0, 1, SIZE) : tileOrientation(topo, 1, 0, SIZE);
  if (o0.key === o1.key) return { score: 1, type: 'wrap' };
  return { score: 2, type: o0.reflected !== o1.reflected ? 'reflect' : 'rotate' };
}

const CAPTION: Record<SeamType, string> = {
  wall: 'BOUNDED EDGES',
  wrap: 'EDGES WRAP',
  reflect: 'EDGES REFLECT',
  rotate: 'EDGES ROTATE',
};

export interface Preview {
  // Switches the animated board; pass null for a non-topology board (hex).
  // Returns a short caption describing the edge behaviour.
  setBoard(topo: Topology | null): string;
  destroy(): void;
}

export function createPreview(canvas: HTMLCanvasElement): Preview {
  const ctx = canvas.getContext('2d')!;
  const accent = cssVar('--accent', '#f40');
  const inkDim = cssVar('--ink-dim', '#9c9c9c');

  let topo: Topology | null = null;
  let dir: Vec = [0, 1];
  let headPlane: Vec = [MID, MID];
  let body: Vec[] = [];
  let dead = 0;

  let cw = 0;
  let ch = 0;

  function reset(): void {
    headPlane = [MID, MID];
    dead = 0;
    body = topo ? [topo.project(MID, MID, SIZE)!] : [];
  }

  function tick(): void {
    if (!topo) return;
    if (dead > 0) {
      dead--;
      if (dead === 0) reset();
      return;
    }
    const nr = headPlane[0] + dir[0];
    const nc = headPlane[1] + dir[1];
    const p = topo.project(nr, nc, SIZE);
    if (!p) { dead = DEAD_PAUSE; return; }   // ran into a wall
    headPlane = [nr, nc];
    body.unshift(p);
    while (body.length > LEN) body.pop();
  }

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cw = rect.width;
    ch = rect.height;
  }

  function roundRect(x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
    ctx.fill();
  }

  function drawBoard(): void {
    if (cw === 0) resize();
    if (cw === 0) return;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, cw, ch);

    const boardPx = Math.min(cw, ch) - 2 * PAD;
    const cell = boardPx / SIZE;
    const ox = (cw - boardPx) / 2;
    const oy = (ch - boardPx) / 2;

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? LIGHT : DARK;
        ctx.fillRect(ox + c * cell, oy + r * cell, cell + 0.5, cell + 0.5);
      }
    }

    if (topo) drawSnake(ox, oy, cell);
    drawEdges(ox, oy, boardPx, cell);
  }

  function drawSnake(ox: number, oy: number, cell: number): void {
    for (let i = body.length - 1; i >= 0; i--) {
      const [r, c] = body[i];
      const head = i === 0;
      ctx.fillStyle = head ? (dead > 0 ? accent : HEAD) : BODY;
      const inset = head ? 2 : 3;
      roundRect(ox + c * cell + inset, oy + r * cell + inset, cell - 2 * inset, cell - 2 * inset, head ? 5 : 3);
    }
  }

  // A board edge is a lethal wall if the plane cell just past it maps to null;
  // otherwise it glues to another copy (wrap / reflect / rotate) and is drawn as
  // a passable dashed seam.
  function drawEdges(ox: number, oy: number, boardPx: number, _cell: number): void {
    if (!topo) return;
    const sides: { probe: Vec; a: Vec; b: Vec }[] = [
      { probe: [-1, MID], a: [ox, oy], b: [ox + boardPx, oy] },
      { probe: [SIZE, MID], a: [ox, oy + boardPx], b: [ox + boardPx, oy + boardPx] },
      { probe: [MID, -1], a: [ox, oy], b: [ox, oy + boardPx] },
      { probe: [MID, SIZE], a: [ox + boardPx, oy], b: [ox + boardPx, oy + boardPx] },
    ];
    for (const s of sides) {
      const wall = !topo.project(s.probe[0], s.probe[1], SIZE);
      ctx.beginPath();
      ctx.moveTo(s.a[0], s.a[1]);
      ctx.lineTo(s.b[0], s.b[1]);
      if (wall) {
        ctx.strokeStyle = accent;
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = inkDim;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function render(): void {
    if (topo) drawBoard();
    else drawHexBoard();
  }

  const timer = window.setInterval(() => {
    tick();
    render();
  }, TICK_MS);

  const ro = new ResizeObserver(() => { resize(); render(); });
  ro.observe(canvas);

  return {
    setBoard(next: Topology | null): string {
      topo = next;
      if (next) {
        const sx = axisSeam(next, 'x');
        const sy = axisSeam(next, 'y');
        const useX = sx.score >= sy.score;
        dir = useX ? [0, 1] : [1, 0];
        reset();
        render();
        return CAPTION[(useX ? sx : sy).type];
      }
      body = [];
      resize();
      render();
      return 'HEXAGONAL BOARD';
    },
    destroy(): void {
      window.clearInterval(timer);
      ro.disconnect();
    },
  };

  // Static preview for non-topology games (hex): the actual Gliński board - a
  // radius-5 hexagon of 91 flat-top hexes in the real 3-colouring - fitted to the
  // frame. No animation, since project() does not apply to the hex family. Cell
  // list, colours and geometry are the same the game view uses, so it reads as a
  // hex chess board rather than a generic honeycomb slab.
  function drawHexBoard(): void {
    if (cw === 0) resize();
    if (cw === 0) return;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, cw, ch);

    const cells = allHexCells();
    const ux = (q: number) => 1.5 * q;
    const uy = (q: number, r: number) => Math.sqrt(3) * (r + q / 2);
    const halfH = Math.sqrt(3) / 2;   // hex half-height in unit (circumradius=1) space

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [q, r] of cells) {
      const x = ux(q), y = uy(q, r);
      minX = Math.min(minX, x - 1); maxX = Math.max(maxX, x + 1);
      minY = Math.min(minY, y - halfH); maxY = Math.max(maxY, y + halfH);
    }
    const scale = Math.min((cw - 2 * PAD) / (maxX - minX), (ch - 2 * PAD) / (maxY - minY));
    const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;

    ctx.lineWidth = Math.max(1, scale * 0.06);
    ctx.strokeStyle = BG;
    for (const [q, r] of cells) {
      const x = (ux(q) - midX) * scale + cw / 2;
      const y = (uy(q, r) - midY) * scale + ch / 2;
      ctx.fillStyle = HEX_COLORS[hexColorIndex(q, r)];
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI / 180) * (60 * i);
        const px = x + scale * Math.cos(ang);
        const py = y + scale * Math.sin(ang);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
}
