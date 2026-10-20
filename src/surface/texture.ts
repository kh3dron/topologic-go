// 2D paint for the board that gets wrapped onto the 3D surface (chess / Go /
// snake / hex rhombus), plus the sprites of the catalog's moving pieces.

import type { ChessBoard, PieceType } from '../engine/games/chess';
import { PIECE_SYMBOLS } from '../engine/games/chess';
import type { Color } from '../engine/core';
import type { GoBoard } from '../engine/games/go';

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
      drawPiece(ctx, piece.type, piece.color, (c + 0.5) * cell, (r + 0.54) * cell, cell);
    }
  }
}

// VS15 forces text presentation (U+265F is also an emoji). White pieces: light
// silhouette under the outline glyph; black: dark silhouette with a light rim
// so they read on dark squares. Font must already be set on ctx.
function drawPiece(ctx: CanvasRenderingContext2D, type: PieceType, color: Color, x: number, y: number, cell: number): void {
  const solid = PIECE_SYMBOLS.black[type] + '\uFE0E';
  if (color === 'white') {
    ctx.fillStyle = '#fbf6ec';
    ctx.fillText(solid, x, y);
    ctx.fillStyle = '#1d1712';
    ctx.fillText(PIECE_SYMBOLS.white[type] + '\uFE0E', x, y);
  } else {
    ctx.lineWidth = cell * 0.035;
    ctx.strokeStyle = 'rgba(243,234,219,0.85)';
    ctx.strokeText(solid, x, y);
    ctx.fillStyle = '#18120d';
    ctx.fillText(solid, x, y);
  }
}

// Transparent square sprite of one piece, for the catalog mover.
export function pieceSprite(type: PieceType, color: Color, px = 160): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d')!;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(px * 0.86)}px ${GLYPH_FONT}`;
  ctx.lineJoin = 'round';
  drawPiece(ctx, type, color, px / 2, px * 0.54, px);
  return c;
}

// Snake segment sprite: rounded square, head lighter.
export function snakeSprite(head: boolean, px = 96): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d')!;
  const pad = px * 0.06, r = px * (head ? 0.3 : 0.18);
  ctx.fillStyle = head ? '#b8f5c9' : '#4fbf78';
  ctx.beginPath();
  ctx.roundRect(pad, pad, px - 2 * pad, px - 2 * pad, r);
  ctx.fill();
  if (head) {
    ctx.fillStyle = '#123322';
    for (const ex of [0.36, 0.64]) {
      ctx.beginPath();
      ctx.arc(px * ex, px * 0.36, px * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return c;
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
      ctx.fillStyle = (r + c) % 2 === 0 ? '#2f5a43' : '#284e3a';
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
