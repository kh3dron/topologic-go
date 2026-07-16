import { Topology } from '../topology';
import { PIECE_SYMBOLS } from '../chess';
import {
  allHexCells, hexKey, hexColorIndex, hexBoard, hexCurrentTurn, hexSelected, hexGameOver,
  hexLegalDestinations, hexCheckedKingKey, isHexInCheck, clickHex, resetHex, loadHexState, setHexOnline,
} from '../hexchess';
import { Extent, GameView, InfoPanel, RenderDeps, capitalize } from './kit';

const HEX_CELL = 28; // flat-top hexagon circumradius (base, pre-zoom)
const SVG_NS = 'http://www.w3.org/2000/svg';

const HEX_INFO: InfoPanel = {
  description: "Gliński's hexagonal chess on the 91-cell board. Each side has three bishops (one per cell colour) and nine pawns. There is no castling.",
  article: 'Hexagonal chess is a different board geometry, not a topology of the square board - so it sits outside this site\'s project()/quotient machinery as its own game. The rook slides through the six cell edges, the bishop through the six vertices (staying on its colour forever), and the knight jumps to the twelve nearest cells that lie on no rook or bishop line. Pawns march straight up their file and capture on the two forward diagonals; they promote on reaching the far end of any file.',
  spec: [
    'ROOK: 6 EDGE DIRECTIONS',
    'BISHOP: 6 VERTEX DIRECTIONS',
    'QUEEN: ROOK + BISHOP',
    'KING: 12 x ONE STEP',
    'KNIGHT: 12 JUMPS',
    'PAWNS x9: STRAIGHT / CAPTURE DIAGONAL',
    'PROMOTE AT FILE END, EN PASSANT',
    'BOARD: 91 CELLS, 3 COLOURS',
  ],
  links: [
    { label: 'Hexagonal chess (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Hexagonal_chess' },
    { label: 'Wladyslaw Gliński (Wikipedia)', url: 'https://en.wikipedia.org/wiki/W%C5%82adys%C5%82aw_Gli%C5%84ski' },
  ],
};

export const hexView: GameView = {
  id: 'hexchess',
  name: 'Hexagonal Chess',
  shortName: 'Hex',
  family: 'custom',
  usesTopology: false,
  showsPassButton: false,
  cellBase: HEX_CELL,
  size: () => 0,

  reset: () => resetHex(),
  loadState: (s) => loadHexState(s),
  setOnline: (o) => setHexOnline(o),

  selectionActive: () => hexSelected !== null,

  status(): string {
    if (hexGameOver === 'draw') return 'Stalemate';
    if (hexGameOver) return `Checkmate - ${capitalize(hexGameOver)} wins`;
    const check = isHexInCheck(hexCurrentTurn) ? ' - check' : '';
    return `${capitalize(hexCurrentTurn)}'s turn${check}`;
  },

  infoPanel(_topo: Topology): InfoPanel {
    return HEX_INFO;
  },

  // Gliński's board is a different geometry (flat-top hexagons on a radius-5
  // hexagon), so it renders as inline SVG rather than the CSS-grid path.
  renderCustom(boardEl: HTMLElement, s: number, deps: RenderDeps): Extent {
    const halfW = s;                        // centre -> left/right point
    const halfH = (Math.sqrt(3) / 2) * s;   // centre -> top/bottom edge
    const cx = (q: number) => 1.5 * s * q;
    const cy = (q: number, r: number) => Math.sqrt(3) * s * (r + q / 2);

    const cells = allHexCells();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [q, r] of cells) {
      const x = cx(q), y = cy(q, r);
      minX = Math.min(minX, x - halfW); maxX = Math.max(maxX, x + halfW);
      minY = Math.min(minY, y - halfH); maxY = Math.max(maxY, y + halfH);
    }
    const pad = 2;
    const W = Math.ceil(maxX - minX) + pad * 2;
    const H = Math.ceil(maxY - minY) + pad * 2;
    const ox = -minX + pad, oy = -minY + pad;

    const legal = hexSelected ? hexLegalDestinations(hexSelected) : null;
    const checkKey = hexCheckedKingKey();

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.classList.add('hex-svg');

    for (const [q, r] of cells) {
      const x = cx(q) + ox, y = cy(q, r) + oy;
      const key = hexKey(q, r);
      const piece = hexBoard.get(key);

      const g = document.createElementNS(SVG_NS, 'g');
      g.classList.add('hexcell');

      const poly = document.createElementNS(SVG_NS, 'polygon');
      const pts: string[] = [];
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI / 180) * (60 * i);
        pts.push(`${(x + s * Math.cos(ang)).toFixed(2)},${(y + s * Math.sin(ang)).toFixed(2)}`);
      }
      poly.setAttribute('points', pts.join(' '));
      poly.setAttribute('class', `hex hex-c${hexColorIndex(q, r)}`);
      if (key === hexSelected) poly.classList.add('sel');
      if (key === checkKey) poly.classList.add('check');
      if (legal && legal.has(key) && piece) poly.classList.add('cap');
      g.appendChild(poly);

      if (legal && legal.has(key) && !piece) {
        const dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('cx', x.toFixed(2));
        dot.setAttribute('cy', y.toFixed(2));
        dot.setAttribute('r', (s * 0.18).toFixed(2));
        dot.setAttribute('class', 'hex-move-dot');
        g.appendChild(dot);
      }

      if (piece) {
        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', x.toFixed(2));
        text.setAttribute('y', y.toFixed(2));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        text.setAttribute('font-size', (s * 1.2).toFixed(1));
        text.setAttribute('class', `hex-piece ${piece.color}`);
        text.textContent = PIECE_SYMBOLS[piece.color][piece.type];
        g.appendChild(text);
      }

      g.addEventListener('click', () => {
        clickHex(q, r);
        deps.refreshStatus();
        deps.rerender();
      });

      svg.appendChild(g);
    }

    boardEl.style.display = 'block';
    boardEl.style.width = `${W}px`;
    boardEl.style.height = `${H}px`;
    boardEl.appendChild(svg);

    return { w: W, h: H };
  },
};
