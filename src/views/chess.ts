import { Topology } from '../topology';
import {
  CHESS_SIZE, PIECE_SYMBOLS, chessBoard, chessCurrentTurn, selectedSquare, chessGameOver,
  clickChessSquare, getLegalDestinations, isInCheck, resetChess, loadChessState, serializeChess, setChessOnline,
} from '../chess';
import { CellOpts, GameView, InfoPanel, RenderDeps, capitalize } from './kit';

const CHESS_CELL = 72;

// Per-render cache: legal destinations for the current selection, computed once.
let legalDests: Set<string> | null = null;

export const chessView: GameView = {
  id: 'chess',
  name: 'Chess',
  shortName: 'Chess',
  family: 'square-grid',
  usesTopology: true,
  showsPassButton: false,
  keyboardCursor: true,
  cellBase: CHESS_CELL,
  size: () => CHESS_SIZE,

  reset: () => resetChess(),
  loadState: (s) => loadChessState(s),
  saveState: () => serializeChess(),
  setOnline: (o) => setChessOnline(o),

  selectionActive: () => selectedSquare !== null,

  status(): string {
    if (chessGameOver === 'draw') return 'Stalemate - draw';
    if (chessGameOver) return `Checkmate - ${capitalize(chessGameOver)} wins`;
    const check = isInCheck(chessCurrentTurn) ? ' - check' : '';
    return `${capitalize(chessCurrentTurn)}'s turn${check}`;
  },

  infoPanel(topo: Topology): InfoPanel {
    return { description: topo.chessDesc, article: topo.article, spec: topo.spec, links: topo.links };
  },

  prepareRender(): void {
    legalDests = selectedSquare ? getLegalDestinations(selectedSquare[0], selectedSquare[1]) : null;
  },

  createCell(row: number, col: number, opts: CellOpts, deps: RenderDeps): HTMLElement {
    const square = document.createElement('div');
    syncSquare(square, row, col, opts);

    square.addEventListener('click', () => {
      clickChessSquare(row, col);
      deps.refreshStatus();
      deps.rerender();
    });

    return square;
  },

  updateCell(el: HTMLElement, row: number, col: number, opts: CellOpts): void {
    syncSquare(el, row, col, opts);
  },
};

// Desired presentation of the square, shared by create and in-place update.
function syncSquare(el: HTMLElement, row: number, col: number, opts: CellOpts): void {
  let cls = 'square ' + (opts.light ? 'light' : 'dark');
  if (selectedSquare && selectedSquare[0] === row && selectedSquare[1] === col) {
    cls += ' selected';
    if (legalDests && legalDests.size === 0) cls += ' no-moves';
  } else if (legalDests && legalDests.has(`${row},${col}`)) {
    cls += chessBoard[row][col] ? ' capturable' : ' moveable';
  }

  const piece = chessBoard[row][col];
  let glyph = '';
  if (piece) {
    glyph = PIECE_SYMBOLS[piece.color][piece.type];
    cls += ` ${piece.color}`;
  }

  if (el.className !== cls) el.className = cls;
  if (el.textContent !== glyph) el.textContent = glyph;
}
