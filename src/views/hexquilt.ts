// Shared hex-quotient SVG renderer: draws the 11x11 axial rhombus and its
// eight neighbouring copies (a 3x3 quilt), every drawn hex knowing its
// canonical cell through projectHexTorus - the hex analogue of render.ts's
// square tessellation. Echo copies carry .hex-echo (dimmed by CSS) so the
// fundamental domain reads at a glance while highlights, pieces and stones
// repeat in every copy exactly like the square-grid tessellation. Panning
// comes from the shell: the returned extent is bigger than the container, so
// #board is drag-pannable.

import { Extent, RenderDeps } from './kit';
import { HEXT_RADIUS, HEXT_N, projectHexTorus } from '../engine/games/hextorus';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const HEXQ_CELL = 24; // flat-top hexagon circumradius (base, pre-zoom)

export interface QuiltPaint {
  // Class list for the cell polygon (colour, selection, highlights) - the
  // canonical cell, so highlights repeat across all copies.
  cellClass(q: number, r: number): string;
  // Append cell contents (piece glyph, stone, move dot) to the cell group.
  content(g: SVGGElement, x: number, y: number, s: number, q: number, r: number): void;
  onClick(q: number, r: number, deps: RenderDeps): void;
}

export function renderHexQuilt(boardEl: HTMLElement, s: number, deps: RenderDeps, paint: QuiltPaint): Extent {
  const cx = (q: number) => 1.5 * s * q;
  const cy = (q: number, r: number) => Math.sqrt(3) * s * (r + q / 2);
  const halfW = s;
  const halfH = (Math.sqrt(3) / 2) * s;

  // Plane cells of the 3x3 quilt, in axial coordinates.
  const plane: [number, number][] = [];
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      for (let q = -HEXT_RADIUS; q <= HEXT_RADIUS; q++) {
        for (let r = -HEXT_RADIUS; r <= HEXT_RADIUS; r++) {
          plane.push([q + i * HEXT_N, r + j * HEXT_N]);
        }
      }
    }
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [q, r] of plane) {
    const x = cx(q), y = cy(q, r);
    minX = Math.min(minX, x - halfW); maxX = Math.max(maxX, x + halfW);
    minY = Math.min(minY, y - halfH); maxY = Math.max(maxY, y + halfH);
  }
  const pad = 2;
  const W = Math.ceil(maxX - minX) + pad * 2;
  const H = Math.ceil(maxY - minY) + pad * 2;
  const ox = -minX + pad, oy = -minY + pad;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(W));
  svg.setAttribute('height', String(H));
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.classList.add('hex-svg');

  for (const [pq, pr] of plane) {
    const [q, r] = projectHexTorus(pq, pr);
    const x = cx(pq) + ox, y = cy(pq, pr) + oy;
    const echo = pq !== q || pr !== r;

    const g = document.createElementNS(SVG_NS, 'g');
    g.classList.add('hexcell');
    if (echo) g.classList.add('hex-echo');

    const poly = document.createElementNS(SVG_NS, 'polygon');
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const ang = (Math.PI / 180) * (60 * i);
      pts.push(`${(x + s * Math.cos(ang)).toFixed(2)},${(y + s * Math.sin(ang)).toFixed(2)}`);
    }
    poly.setAttribute('points', pts.join(' '));
    poly.setAttribute('class', paint.cellClass(q, r));
    g.appendChild(poly);

    paint.content(g, x, y, s, q, r);

    g.addEventListener('click', () => paint.onClick(q, r, deps));
    svg.appendChild(g);
  }

  boardEl.style.display = 'block';
  boardEl.style.width = `${W}px`;
  boardEl.style.height = `${H}px`;
  boardEl.appendChild(svg);

  return { w: W, h: H };
}
