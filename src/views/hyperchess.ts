import { Topology } from '../topology';
import { PIECE_SYMBOLS } from '../chess';
import {
  hyperBoard, hyperSelected, hyperCurrentTurn, hyperGameOver,
  hyperLegalDestinations, hyperCheckedKingCell, isHyperInCheck,
  clickHyper, resetHyper, loadHyperState, serializeHyper, setHyperOnline,
  HYPER_VIEW_HOME, HYPER_CELL_COUNT,
} from '../hyperchess';
import type { HyperCell } from '../hyperchess';
import { GameView, InfoPanel, capitalize } from './kit';
import { HYPER_CELL, createDiskRenderer } from './hyperdisk';

const HYPER_INFO: InfoPanel = {
  description: 'Chess on the {4,6} tiling of the hyperbolic plane - square cells, six around every vertex - after Andrea Hawksley\'s construction. Queens face off 7 cells apart along a central geodesic. Drag to pan the Poincare disk.',
  article: 'The hyperbolic plane is not a quotient of the Euclidean plane, so this board sits outside the project() machinery entirely: it is a patch of the {4,6} tiling, rendered in the Poincare disk model. Straight lines survive (a rook still leaves through the edge opposite where it entered), and because six is even the checkerboard colouring survives too, so bishops keep their colour. But almost everything else bends: each back rank runs along its own geodesic, and geodesics through neighbouring cells of the spine diverge - the pawn line only shields the files nearest the queen, bishops start with open diagonals, and the outermost files are cramped against the board\'s equidistant side walls. The knight\'s two Euclidean paths (two-then-one and one-then-two) land on different cells here, giving it up to sixteen jumps. Exponential space means armies lose each other easily; the action funnels along the spine.',
  spec: [
    `BOARD: ${HYPER_CELL_COUNT} CELLS OF {4,6}`,
    'ROOK: 4 GEODESIC RAYS',
    'BISHOP: 8 DIAGONAL RAYS (VERTEX + COLOUR)',
    'KNIGHT: 16 JUMPS (2+1 AND 1+2 DIFFER)',
    'KING: 12 x ONE STEP',
    'PAWNS: HEADING PARALLEL-TRANSPORTS',
    'PROMOTE AT A WALL, NO CASTLING / EN PASSANT',
    'QUEENS 7 APART ON THE SPINE',
  ],
  links: [
    { label: 'Non-Euclidean Chess, Part 2 (Hawksley)', url: 'https://andreahawksley.com/non-euclidean-chess-part-2/' },
    { label: 'Hyperbolic geometry (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Hyperbolic_geometry' },
    { label: 'Poincare disk model (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Poincar%C3%A9_disk_model' },
  ],
};

interface ChessDraw {
  legal: Set<number> | null;
  checked: number | null;
}

const disk = createDiskRenderer<ChessDraw>({
  home: HYPER_VIEW_HOME,

  prepareDraw: () => ({
    legal: hyperSelected !== null ? hyperLegalDestinations(hyperSelected) : null,
    checked: hyperCheckedKingCell(),
  }),

  fillCell(ctx, cell: HyperCell, _apparent, d): void {
    const piece = hyperBoard.get(cell.id);
    if (cell.id === hyperSelected) {
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

  drawContents(ctx, cell: HyperCell, px, py, apparent, d): void {
    const piece = hyperBoard.get(cell.id);

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
    const piece = cell !== null ? hyperBoard.get(cell) : undefined;
    const legal = hyperSelected !== null ? hyperLegalDestinations(hyperSelected) : null;
    const actionable = cell !== null &&
      ((piece && piece.color === hyperCurrentTurn && !hyperGameOver) || (legal?.has(cell) ?? false));
    return actionable ? 'pointer' : 'grab';
  },

  onClick(cell, deps): void {
    clickHyper(cell);
    deps.refreshStatus();
    deps.rerender();
  },
});

export const hyperView: GameView = {
  id: 'hyperchess',
  name: 'Hyperbolic Chess',
  shortName: 'Hyper',
  family: 'custom',
  usesTopology: false,
  showsPassButton: false,
  cellBase: HYPER_CELL,
  size: () => 0,

  reset: () => {
    resetHyper();
    disk.resetView();
  },
  loadState: (s) => loadHyperState(s),
  saveState: () => serializeHyper(),
  setOnline: (o) => setHyperOnline(o),

  selectionActive: () => hyperSelected !== null,

  status(): string {
    if (hyperGameOver === 'draw') return 'Stalemate';
    if (hyperGameOver) return `Checkmate - ${capitalize(hyperGameOver)} wins`;
    const check = isHyperInCheck(hyperCurrentTurn) ? ' - check' : '';
    return `${capitalize(hyperCurrentTurn)}'s turn${check}`;
  },

  infoPanel(_topo: Topology): InfoPanel {
    return HYPER_INFO;
  },

  // The board is a patch of the hyperbolic plane, so it renders on a canvas in
  // the Poincare disk model; dragging pans by hyperbolic translation.
  renderCustom: (boardEl, cellPx, deps) => disk.renderCustom(boardEl, cellPx, deps),
};
