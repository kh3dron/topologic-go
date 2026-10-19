// 2D paint for the board that gets wrapped onto the 3D surface: the board
// itself (chess / Go / snake / hex rhombus) plus a coloured strip on every
// edge. Glued edges carry the shared seam gradient, so matching colours meet
// when the surface closes; mirrors are silver, walls dark.

import { SEAM_SCHEME_COLORS, seamColoring, Topology } from '../topology';
import type { ChessBoard } from '../engine/games/chess';
import { PIECE_SYMBOLS } from '../engine/games/chess';
import type { GoBoard } from '../engine/games/go';
import { EDGES, EdgeName, PROBE, SurfacePlan } from './plan';

export type RGB = [number, number, number];

export const WALL_RGB: RGB = [0.16, 0.17, 0.2];
export const MIRROR_RGB: RGB = [0.86, 0.9, 0.97];

function hexRgb(hex: string): RGB {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as RGB;
}

function mixRgb(a: RGB, b: RGB, k: number): RGB {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

export function rgbCss(c: RGB): string {
  return `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
}

function edgeCell(edge: EdgeName, i: number, n: number): [[number, number], [number, number]] {
  switch (edge) {
    case 'left': return [[i, 0], [i, -1]];
    case 'right': return [[i, n - 1], [i, n]];
    case 'top': return [[0, i], [-1, i]];
    case 'bottom': return [[n - 1, i], [n, i]];
  }
}

// Colour along an edge as a function of s in [0,1] (top->bottom for left /
// right, left->right for top / bottom). Seam colours are sampled per probe
// cell and interpolated between cell centres, so two glued points get the
// same colour whatever the gluing's orientation.
export type EdgeRamp = (s: number) => RGB;

export function edgeRamps(topo: Topology, plan: SurfacePlan): Record<EdgeName, EdgeRamp> {
  const n = PROBE;
  const coloring = seamColoring(topo, n);
  const out = {} as Record<EdgeName, EdgeRamp>;
  for (const edge of EDGES) {
    const kind = plan.edges[edge].kind;
    if (kind === 'wall') { out[edge] = () => WALL_RGB; continue; }
    if (kind === 'mirror') { out[edge] = () => MIRROR_RGB; continue; }
    const samples: RGB[] = [];
    for (let i = 0; i < n; i++) {
      const [a, b] = edgeCell(edge, i, n);
      const pa = topo.project(a[0], a[1], n);
      const pb = topo.project(b[0], b[1], n);
      const col = coloring.lookup(pa, pb);
      if (!col) { samples.push(MIRROR_RGB); continue; }
      const [c0, c1] = SEAM_SCHEME_COLORS[col.scheme % SEAM_SCHEME_COLORS.length];
      samples.push(mixRgb(hexRgb(c0), hexRgb(c1), col.t));
    }
    out[edge] = (s: number) => {
      const x = Math.min(n - 1, Math.max(0, s * n - 0.5));
      const i = Math.min(n - 2, Math.floor(x));
      return mixRgb(samples[i], samples[i + 1], x - i);
    };
  }
  return out;
}

const GLYPH_FONT = '"Apple Symbols","Segoe UI Symbol","Noto Sans Symbols 2","DejaVu Sans",serif';

export interface ChessPaint { board: ChessBoard; selected?: [number, number] | null; dests?: Set<string> | null; }
export interface GoPaint { board: GoBoard; lastMove?: [number, number] | null; }

export function paintChess(ctx: CanvasRenderingContext2D, px: number, p: ChessPaint): void {
  const n = p.board.length;
  const cell = px / n;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#e8dcc6' : '#9c7656';
      ctx.fillRect(c * cell, r * cell, cell + 1, cell + 1);
    }
  }
  if (p.selected) {
    ctx.fillStyle = 'rgba(255,92,40,0.55)';
    ctx.fillRect(p.selected[1] * cell, p.selected[0] * cell, cell, cell);
  }
  if (p.dests) {
    ctx.fillStyle = 'rgba(255,92,40,0.6)';
    for (const key of p.dests) {
      const [r, c] = key.split(',').map(Number);
      ctx.beginPath();
      ctx.arc((c + 0.5) * cell, (r + 0.5) * cell, cell * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(cell * 0.78)}px ${GLYPH_FONT}`;
  ctx.lineJoin = 'round';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const piece = p.board[r][c];
      if (!piece) continue;
      // VS15 forces text presentation (U+265F is also an emoji). White
      // pieces: light silhouette under the outline glyph; black: dark
      // silhouette with a light rim so they read on dark squares.
      const solid = PIECE_SYMBOLS.black[piece.type] + '\uFE0E';
      const x = (c + 0.5) * cell, y = (r + 0.54) * cell;
      if (piece.color === 'white') {
        ctx.fillStyle = '#fbf6ec';
        ctx.fillText(solid, x, y);
        ctx.fillStyle = '#1d1712';
        ctx.fillText(PIECE_SYMBOLS.white[piece.type] + '\uFE0E', x, y);
      } else {
        ctx.lineWidth = cell * 0.035;
        ctx.strokeStyle = 'rgba(243,234,219,0.85)';
        ctx.strokeText(solid, x, y);
        ctx.fillStyle = '#18120d';
        ctx.fillText(solid, x, y);
      }
    }
  }
}

export function paintGo(ctx: CanvasRenderingContext2D, px: number, p: GoPaint): void {
  const n = p.board.length;
  const cell = px / n;
  ctx.fillStyle = '#d9a95b';
  ctx.fillRect(0, 0, px, px);
  // faint grain
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = i % 2 ? '#7a4a14' : '#fff3d0';
    ctx.fillRect(0, (i / 40) * px, px, px / 90);
  }
  ctx.globalAlpha = 1;
  // lines run through cell centres and continue to the edge, so the grid
  // stays continuous across a glued seam
  ctx.strokeStyle = '#3a2610';
  ctx.lineWidth = Math.max(1, cell * 0.05);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const o = (i + 0.5) * cell;
    ctx.moveTo(0, o); ctx.lineTo(px, o);
    ctx.moveTo(o, 0); ctx.lineTo(o, px);
  }
  ctx.stroke();
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const s = p.board[r][c];
      if (!s) continue;
      const x = (c + 0.5) * cell, y = (r + 0.5) * cell, rad = cell * 0.46;
      const g = ctx.createRadialGradient(x - rad * 0.35, y - rad * 0.35, rad * 0.1, x, y, rad);
      if (s === 'black') { g.addColorStop(0, '#5a5a5e'); g.addColorStop(1, '#09090b'); }
      else { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c9c6bd'); }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (p.lastMove) {
    const [r, c] = p.lastMove;
    ctx.strokeStyle = '#ff5c28';
    ctx.lineWidth = cell * 0.09;
    ctx.beginPath();
    ctx.arc((c + 0.5) * cell, (r + 0.5) * cell, cell * 0.2, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export interface SnakePaint { size: number; body: [number, number][]; food: [number, number] | null; }

export function paintSnake(ctx: CanvasRenderingContext2D, px: number, p: SnakePaint): void {
  const n = p.size;
  const cell = px / n;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#1f3b2c' : '#1a3226';
      ctx.fillRect(c * cell, r * cell, cell + 1, cell + 1);
    }
  }
  p.body.forEach(([r, c], i) => {
    const k = 1 - i / Math.max(1, p.body.length);
    ctx.fillStyle = `rgb(${Math.round(120 + 110 * k)},${Math.round(200 + 40 * k)},${Math.round(90 + 40 * k)})`;
    const pad = cell * 0.08;
    ctx.fillRect(c * cell + pad, r * cell + pad, cell - 2 * pad, cell - 2 * pad);
  });
  if (p.food) {
    ctx.fillStyle = '#ff4d3a';
    ctx.beginPath();
    ctx.arc((p.food[1] + 0.5) * cell, (p.food[0] + 0.5) * cell, cell * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }
}

// The hex torus is the Glinski 11x11 axial rhombus with opposite edges glued;
// the rhombus maps affinely onto the unit square, so cells are drawn in axial
// coordinates (q along u, r along v) and stay exact on the torus.
export function paintHexRhombus(ctx: CanvasRenderingContext2D, px: number, n = 11): void {
  const cu = px / n;
  const corners: [number, number][] = [
    [1 / 3, 1 / 3], [2 / 3, -1 / 3], [1 / 3, -2 / 3], [-1 / 3, -1 / 3], [-2 / 3, 1 / 3], [-1 / 3, 2 / 3],
  ];
  const colors = ['#e8dcc6', '#c4a27f', '#8f6a4c'];
  ctx.fillStyle = colors[1];
  ctx.fillRect(0, 0, px, px);
  for (let q = -1; q <= n; q++) {
    for (let r = -1; r <= n; r++) {
      ctx.fillStyle = colors[(((q - r) % 3) + 3) % 3];
      ctx.beginPath();
      corners.forEach(([dq, dr], i) => {
        const x = (q + 0.5 + dq) * cu, y = (r + 0.5 + dr) * cu;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,24,12,0.35)';
      ctx.lineWidth = px / 400;
      ctx.stroke();
    }
  }
}

// Edge strips over a painted board. Width is a fraction of the texture.
export function paintEdgeStrips(ctx: CanvasRenderingContext2D, px: number, ramps: Record<EdgeName, EdgeRamp>, frac = 0.022): void {
  const w = Math.max(2, px * frac);
  const steps = 64;
  for (const edge of EDGES) {
    for (let k = 0; k < steps; k++) {
      const s = (k + 0.5) / steps;
      ctx.fillStyle = rgbCss(ramps[edge](s));
      const a = (k / steps) * px, len = px / steps + 1;
      if (edge === 'left') ctx.fillRect(0, a, w, len);
      else if (edge === 'right') ctx.fillRect(px - w, a, w, len);
      else if (edge === 'top') ctx.fillRect(a, 0, len, w);
      else ctx.fillRect(a, px - w, len, w);
    }
  }
}
