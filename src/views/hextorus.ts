import { Topology } from '../topology';
import { PIECE_SYMBOLS } from '../chess';
import { hexKey } from '../engine/games/hexchess';
import {
  hexTorusBoard, hexTorusCurrentTurn, hexTorusSelected, hexTorusGameOver,
  hexTorusLegalDestinations, hexTorusCheckedKingKey, isHexTorusInCheck,
  clickHexTorus, resetHexTorus, loadHexTorusState, serializeHexTorus, setHexTorusOnline,
  hexTorusColorIndex,
} from '../hextorus';
import { Extent, GameView, InfoPanel, RenderDeps, capitalize } from './kit';
import { HEXQ_CELL, renderHexQuilt } from './hexquilt';

const SVG_NS = 'http://www.w3.org/2000/svg';

const INFO: InfoPanel = {
  description: "Glinski's hexagonal chess on the hex torus: the 11x11 axial bounding rhombus of the Glinski board, opposite edges glued. Setup and rules untouched; drag to pan the quilt of copies.",
  article: 'The Glinski hexagon does not tile the plane by translation, but its axial bounding rhombus does - so the board is that rhombus (the 91 Glinski cells plus the 30 cut corners, now ordinary cells) with opposite edges glued into a torus. Rules and setup are exactly Glinski\'s; every line simply continues through the gluing. The engine reports the consequences honestly: both kings start in compound double check through the seams, and whoever moves has exactly one legal reply - the game opens on a forced king walk instead of dying outright, the hexagonal sibling of the square torus\'s mate at move zero. The three-colouring also dies: 11 is not divisible by 3, so a bishop crossing a seam shifts its colour class and can eventually reach the whole board. Pawns promote on the seam row they march toward, the analogue of the square torus keeping rows 0 and 7.',
  spec: [
    'BOARD: 11x11 RHOMBUS = 121 CELLS, GLUED',
    "SETUP: GLINSKI'S, UNTOUCHED",
    'MOVE 0: MUTUAL DOUBLE CHECK, ONE LEGAL REPLY',
    'SEAMS BREAK THE 3-COLOURING (11 % 3 != 0)',
    'PROMOTE ON THE SEAM ROW',
    'EN PASSANT PROJECTS THROUGH THE GLUING',
  ],
  links: [
    { label: 'Hexagonal chess (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Hexagonal_chess' },
    { label: 'Torus (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Torus' },
  ],
};

export const hexTorusView: GameView = {
  id: 'hextorus',
  name: 'Hex Torus Chess',
  shortName: 'HexTorus',
  family: 'custom',
  usesTopology: false,
  showsPassButton: false,
  cellBase: HEXQ_CELL,
  size: () => 0,

  reset: () => resetHexTorus(),
  loadState: (s) => loadHexTorusState(s),
  saveState: () => serializeHexTorus(),
  setOnline: (o) => setHexTorusOnline(o),

  selectionActive: () => hexTorusSelected !== null,

  status(): string {
    if (hexTorusGameOver === 'draw') return 'Stalemate';
    if (hexTorusGameOver) return `Checkmate - ${capitalize(hexTorusGameOver)} wins`;
    const check = isHexTorusInCheck(hexTorusCurrentTurn) ? ' - check' : '';
    return `${capitalize(hexTorusCurrentTurn)}'s turn${check}`;
  },

  infoPanel(_topo: Topology): InfoPanel {
    return INFO;
  },

  renderCustom(boardEl: HTMLElement, s: number, deps: RenderDeps): Extent {
    const legal = hexTorusSelected ? hexTorusLegalDestinations(hexTorusSelected) : null;
    const checkKey = hexTorusCheckedKingKey();

    return renderHexQuilt(boardEl, s, deps, {
      cellClass(q, r): string {
        const key = hexKey(q, r);
        let cls = `hex hex-c${hexTorusColorIndex(q, r)}`;
        if (key === hexTorusSelected) cls += ' sel';
        if (key === checkKey) cls += ' check';
        if (legal && legal.has(key) && hexTorusBoard.get(key)) cls += ' cap';
        return cls;
      },
      content(g, x, y, s2, q, r): void {
        const key = hexKey(q, r);
        const piece = hexTorusBoard.get(key);
        if (legal && legal.has(key) && !piece) {
          const dot = document.createElementNS(SVG_NS, 'circle');
          dot.setAttribute('cx', x.toFixed(2));
          dot.setAttribute('cy', y.toFixed(2));
          dot.setAttribute('r', (s2 * 0.18).toFixed(2));
          dot.setAttribute('class', 'hex-move-dot');
          g.appendChild(dot);
        }
        if (piece) {
          const text = document.createElementNS(SVG_NS, 'text');
          text.setAttribute('x', x.toFixed(2));
          text.setAttribute('y', y.toFixed(2));
          text.setAttribute('text-anchor', 'middle');
          text.setAttribute('dominant-baseline', 'central');
          text.setAttribute('font-size', (s2 * 1.2).toFixed(1));
          text.setAttribute('class', `hex-piece ${piece.color}`);
          text.textContent = PIECE_SYMBOLS[piece.color][piece.type];
          g.appendChild(text);
        }
      },
      onClick(q, r, deps2): void {
        clickHexTorus(q, r);
        deps2.refreshStatus();
        deps2.rerender();
      },
    });
  },
};
