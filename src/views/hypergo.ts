import { Topology } from '../topology';
import {
  hyperGoBoard, hyperGoCurrentTurn, hyperGoGameOver, hyperGoCaptures, hyperGoLastMove,
  canPlayHyperGoNow, isValidHyperGoMove, placeHyperGoStone, passHyperGoTurn, scoreHyperGo,
  resetHyperGo, loadHyperGoState, serializeHyperGo, setHyperGoOnline, HYPERGO_KOMI,
} from '../hypergo';
import { HYPER_CELL_COUNT } from '../hyperchess';
import type { HyperCell, C } from '../hyperchess';
import { GameView, InfoPanel, capitalize } from './kit';
import { HYPER_CELL, createDiskRenderer } from './hyperdisk';
import { HYPER46_GEOMETRY } from './hyperchess';

const HOME: C = { re: 0, im: 0 }; // Go has no armies: start centred on the board

const HYPERGO_INFO: InfoPanel = {
  description: 'Go on the {4,6} tiling of the hyperbolic plane: stones sit on the square cells, capture and territory follow the tiling\'s adjacency. Drag to pan the Poincare disk.',
  article: 'The same 1352-cell patch of the {4,6} tiling that hyperbolic chess plays on, with untouched Go rules run over its adjacency graph: liberties are edge neighbours, groups flood-fill, suicide is banned, positional superko applies, two passes end the game, and territory is flood-filled area. What hyperbolic geometry changes is economics, not rules. On a Euclidean board a territory wall encloses area proportional to its length squared; here the area inside a loop grows only linearly with its circumference, so walls are ruinously expensive and the corner-opening wisdom of flat Go collapses. The board\'s walls and its equidistant sides are the only places where stones lean on the boundary the classical way.',
  spec: [
    `BOARD: ${HYPER_CELL_COUNT} CELLS OF {4,6}`,
    'STONES ON CELLS, 4 NEIGHBORS',
    'CAPTURE / SUPERKO / SCORING: STANDARD',
    `KOMI ${HYPERGO_KOMI} (PROVISIONAL)`,
    'AREA GROWS EXPONENTIALLY WITH RADIUS',
  ],
  links: [
    { label: 'Go (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Go_(game)' },
    { label: 'Hyperbolic geometry (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Hyperbolic_geometry' },
    { label: 'Poincare disk model (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Poincar%C3%A9_disk_model' },
  ],
};

const disk = createDiskRenderer<null>({
  geometry: HYPER46_GEOMETRY,
  home: HOME,

  prepareDraw: () => null,

  fillCell(ctx, cell: HyperCell): void {
    // Goban wood, with the checker parity kept as a subtle two-tone so the
    // tiling stays readable under stones.
    ctx.fillStyle = cell.light ? '#d8b06a' : '#cda65f';
    ctx.fill();
  },

  drawContents(ctx, cell: HyperCell, px, py, apparent): void {
    const stone = hyperGoBoard[cell.id];
    if (!stone || apparent < 1.5) return;
    const r = apparent * 0.78;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, 2 * Math.PI);
    ctx.fillStyle = stone === 'black' ? '#1c1c1e' : '#f2f2f0';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = Math.max(0.4, apparent * 0.05);
    ctx.stroke();
    if (hyperGoLastMove === cell.id) {
      ctx.beginPath();
      ctx.arc(px, py, r * 0.35, 0, 2 * Math.PI);
      ctx.strokeStyle = stone === 'black' ? '#f2f2f0' : '#1c1c1e';
      ctx.lineWidth = Math.max(0.6, apparent * 0.07);
      ctx.stroke();
    }
  },

  cursorFor(cell): string {
    if (cell === null || !canPlayHyperGoNow()) return 'grab';
    if (hyperGoBoard[cell] !== null) return 'grab';
    return isValidHyperGoMove(cell, hyperGoCurrentTurn) ? 'pointer' : 'grab';
  },

  onClick(cell, deps): void {
    if (hyperGoGameOver) return;
    if (placeHyperGoStone(cell)) {
      deps.refreshStatus();
      deps.rerender();
    }
  },
});

export const hyperGoView: GameView = {
  id: 'hypergo',
  name: 'Hyperbolic Go',
  shortName: 'HyperGo',
  family: 'custom',
  usesTopology: false,
  showsPassButton: true,
  cellBase: HYPER_CELL,
  size: () => 0,

  reset: () => {
    resetHyperGo();
    disk.resetView();
  },
  loadState: (s) => loadHyperGoState(s),
  saveState: () => serializeHyperGo(),
  setOnline: (o) => setHyperGoOnline(o),
  pass: () => passHyperGoTurn(),

  status(): string {
    if (hyperGoGameOver) {
      const score = scoreHyperGo();
      const result = score.winner === 'draw' ? 'Draw' : `${capitalize(score.winner)} wins`;
      return `Black ${score.blackTotal} : White ${score.whiteTotal} (komi ${HYPERGO_KOMI}) - ${result}`;
    }
    return `${capitalize(hyperGoCurrentTurn)}'s turn - B: ${hyperGoCaptures.black} W: ${hyperGoCaptures.white}`;
  },

  infoPanel(_topo: Topology): InfoPanel {
    return HYPERGO_INFO;
  },

  renderCustom: (boardEl, cellPx, deps) => disk.renderCustom(boardEl, cellPx, deps),
};
