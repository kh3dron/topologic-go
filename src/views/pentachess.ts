import { Topology } from '../topology';
import { PIECE_SYMBOLS } from '../chess';
import {
  pentaBoard, pentaSelected, pentaCurrentTurn, pentaGameOver,
  pentaLegalDestinations, pentaCheckedKingCell, isPentaInCheck,
  clickPenta, resetPenta, loadPentaState, serializePenta, setPentaOnline,
  pentaCells, pentaNeighbors, PENTA_BASE_BOUNDARY,
  PENTA_VIEW_HOME, PENTA_CELL_COUNT, PENTA_INRADIUS, PENTA_CIRCUMRADIUS,
} from '../pentachess';
import { GameView, InfoPanel, capitalize } from './kit';
import { DiskGeometry, HYPER_CELL, createDiskRenderer } from './hyperdisk';

const PENTA_INFO: InfoPanel = {
  description: 'Chess on the {5,4} tiling of the hyperbolic plane - pentagons, four around every vertex - completing the variant Andrea Hawksley sketches in "Non-Euclidean Chess, Part 2". Drag to pan the Poincare disk.',
  article: 'A pentagon has no opposite edge: the feature opposite an edge is a corner and vice versa, so the geodesic through a cell alternates edge and vertex crossings. Hawksley\'s article stops at a framework - rooks start across an edge, bishops across a vertex, queens either, knights go through an edge then one of the two far edges - and this board completes it. Rooks ride the alternating geodesic; bishops cross vertices only (four pentagons meet at each vertex, so the cell across a vertex is unique) and keep their colour, because {5,4} does checkerboard; knights get exactly the article\'s 10 jumps. Pawns carry their next crossing as a heading, alternately an edge and a corner, capturing across the features flanking it. The back ranks bend: no geodesic runs perpendicular to the spine through a spine cell, so each army\'s rank follows the two most-sideways rays, curling away from the enemy.',
  spec: [
    `BOARD: ${PENTA_CELL_COUNT} PENTAGONS OF {5,4}`,
    'ROOK: 5 RAYS, ALTERNATING EDGE / VERTEX',
    'BISHOP: 10 VERTEX RAYS, KEEPS COLOUR',
    'KNIGHT: 10 JUMPS (EDGE, THEN FAR EDGE)',
    'KING: 10 x ONE CROSSING',
    'PAWN HEADING ALTERNATES EDGE / CORNER',
    'PROMOTE AT A WALL, NO CASTLING / EN PASSANT',
    'QUEENS 7 APART ON THE SPINE',
  ],
  links: [
    { label: 'Non-Euclidean Chess, Part 2 (Hawksley)', url: 'https://andreahawksley.com/non-euclidean-chess-part-2/' },
    { label: 'Order-4 pentagonal tiling (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Order-4_pentagonal_tiling' },
    { label: 'Poincare disk model (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Poincar%C3%A9_disk_model' },
  ],
};

const PENTA_GEOMETRY: DiskGeometry = {
  cells: pentaCells,
  neighbors: pentaNeighbors,
  boundary: PENTA_BASE_BOUNDARY,
  inradius: PENTA_INRADIUS,
  circumradius: PENTA_CIRCUMRADIUS,
};

interface PentaDraw {
  legal: Set<number> | null;
  checked: number | null;
}

const disk = createDiskRenderer<PentaDraw>({
  geometry: PENTA_GEOMETRY,
  home: PENTA_VIEW_HOME,

  prepareDraw: () => ({
    legal: pentaSelected !== null ? pentaLegalDestinations(pentaSelected) : null,
    checked: pentaCheckedKingCell(),
  }),

  fillCell(ctx, cell, _apparent, d): void {
    const piece = pentaBoard.get(cell.id);
    if (cell.id === pentaSelected) {
      ctx.fillStyle = d.legal && d.legal.size === 0 ? '#a35c5c' : '#7a9a7a';
    } else if (cell.id === d.checked) {
      ctx.fillStyle = '#a35c5c';
    } else {
      ctx.fillStyle = cell.light ? '#e8e8e8' : '#888';
    }
    ctx.fill();
    if (d.legal && d.legal.has(cell.id)) {
      ctx.fillStyle = piece ? 'rgba(176, 112, 112, 0.55)' : 'rgba(201, 201, 122, 0.5)';
      ctx.fill();
    }
  },

  drawContents(ctx, cell, px, py, apparent, d): void {
    const piece = pentaBoard.get(cell.id);

    if (d.legal && d.legal.has(cell.id) && !piece && apparent > 3) {
      ctx.beginPath();
      ctx.arc(px, py, apparent * 0.28, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(30, 30, 30, 0.55)';
      ctx.fill();
    }

    if (piece && apparent > 4) {
      const fontPx = apparent * 1.5;
      ctx.font = `${fontPx}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const glyph = PIECE_SYMBOLS[piece.color][piece.type];
      if (piece.color === 'white') {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = Math.max(0.5, fontPx / 16);
        ctx.strokeText(glyph, px, py);
        ctx.fillStyle = '#fff';
      } else {
        ctx.fillStyle = '#000';
      }
      ctx.fillText(glyph, px, py);
    }
  },

  cursorFor(cell): string {
    const piece = cell !== null ? pentaBoard.get(cell) : undefined;
    const legal = pentaSelected !== null ? pentaLegalDestinations(pentaSelected) : null;
    const actionable = cell !== null &&
      ((piece && piece.color === pentaCurrentTurn && !pentaGameOver) || (legal?.has(cell) ?? false));
    return actionable ? 'pointer' : 'grab';
  },

  onClick(cell, deps): void {
    clickPenta(cell);
    deps.refreshStatus();
    deps.rerender();
  },
});

export const pentaView: GameView = {
  id: 'pentachess',
  name: 'Pentagonal Chess',
  shortName: 'Penta',
  family: 'custom',
  usesTopology: false,
  showsPassButton: false,
  cellBase: HYPER_CELL,
  size: () => 0,

  reset: () => {
    resetPenta();
    disk.resetView();
  },
  loadState: (s) => loadPentaState(s),
  saveState: () => serializePenta(),
  setOnline: (o) => setPentaOnline(o),

  selectionActive: () => pentaSelected !== null,

  status(): string {
    if (pentaGameOver === 'draw') return 'Stalemate';
    if (pentaGameOver) return `Checkmate - ${capitalize(pentaGameOver)} wins`;
    const check = isPentaInCheck(pentaCurrentTurn) ? ' - check' : '';
    return `${capitalize(pentaCurrentTurn)}'s turn${check}`;
  },

  infoPanel(_topo: Topology): InfoPanel {
    return PENTA_INFO;
  },

  renderCustom: (boardEl, cellPx, deps) => disk.renderCustom(boardEl, cellPx, deps),
};
