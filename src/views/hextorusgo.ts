import { Topology } from '../topology';
import {
  hexTorusGoBoard, hexTorusGoCurrentTurn, hexTorusGoGameOver, hexTorusGoCaptures, hexTorusGoLastMove,
  canPlayHexTorusGoNow, isValidHexTorusGoMove, placeHexTorusGoStone, passHexTorusGoTurn, scoreHexTorusGo,
  resetHexTorusGo, loadHexTorusGoState, serializeHexTorusGo, setHexTorusGoOnline,
  hexTorusGoIndex, HEXTGO_KOMI,
} from '../hextorusgo';
import { Extent, GameView, InfoPanel, RenderDeps, capitalize } from './kit';
import { HEXQ_CELL, renderHexQuilt } from './hexquilt';

const SVG_NS = 'http://www.w3.org/2000/svg';

const INFO: InfoPanel = {
  description: 'Go on the hex torus: 121 cells, six liberties everywhere, no corners or edges anywhere on the surface. Untouched rules; drag to pan the quilt of copies.',
  article: 'The same glued rhombus hex-torus chess plays on, with untouched Go rules over hexagonal adjacency: every cell has exactly six neighbours and the surface is closed, so first-line moves, corner enclosures, and edge territory simply do not exist - the whole game is middle game. Six liberties per stone also make single stones harder to capture than on the square board (six-way surrounds), while the extra connectivity makes eyes correspondingly harder to seal. Komi follows the closed-surface convention (7.5, provisional and unmeasured, like the square torus).',
  spec: [
    'BOARD: 11x11 RHOMBUS = 121 CELLS, GLUED',
    '6 LIBERTIES EVERYWHERE, NO EDGES',
    'CAPTURE / SUPERKO / SCORING: STANDARD',
    `KOMI ${HEXTGO_KOMI} (PROVISIONAL)`,
  ],
  links: [
    { label: 'Go (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Go_(game)' },
    { label: 'Torus (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Torus' },
  ],
};

export const hexTorusGoView: GameView = {
  id: 'hextorusgo',
  name: 'Hex Torus Go',
  shortName: 'HexTorGo',
  family: 'custom',
  usesTopology: false,
  showsPassButton: true,
  cellBase: HEXQ_CELL,
  size: () => 0,

  reset: () => resetHexTorusGo(),
  loadState: (s) => loadHexTorusGoState(s),
  saveState: () => serializeHexTorusGo(),
  setOnline: (o) => setHexTorusGoOnline(o),
  pass: () => passHexTorusGoTurn(),

  status(): string {
    if (hexTorusGoGameOver) {
      const score = scoreHexTorusGo();
      const result = score.winner === 'draw' ? 'Draw' : `${capitalize(score.winner)} wins`;
      return `Black ${score.blackTotal} : White ${score.whiteTotal} (komi ${HEXTGO_KOMI}) - ${result}`;
    }
    return `${capitalize(hexTorusGoCurrentTurn)}'s turn - B: ${hexTorusGoCaptures.black} W: ${hexTorusGoCaptures.white}`;
  },

  infoPanel(_topo: Topology): InfoPanel {
    return INFO;
  },

  renderCustom(boardEl: HTMLElement, s: number, deps: RenderDeps): Extent {
    const canPlay = canPlayHexTorusGoNow();

    return renderHexQuilt(boardEl, s, deps, {
      cellClass(): string {
        return 'hex hex-goban';
      },
      content(g, x, y, s2, q, r): void {
        const cell = hexTorusGoIndex(q, r);
        const stone = hexTorusGoBoard[cell];
        if (stone) {
          const circle = document.createElementNS(SVG_NS, 'circle');
          circle.setAttribute('cx', x.toFixed(2));
          circle.setAttribute('cy', y.toFixed(2));
          circle.setAttribute('r', (s2 * 0.62).toFixed(2));
          circle.setAttribute('class', `hexgo-stone ${stone}`);
          g.appendChild(circle);
          if (hexTorusGoLastMove === cell) {
            const ring = document.createElementNS(SVG_NS, 'circle');
            ring.setAttribute('cx', x.toFixed(2));
            ring.setAttribute('cy', y.toFixed(2));
            ring.setAttribute('r', (s2 * 0.28).toFixed(2));
            ring.setAttribute('class', `hexgo-last ${stone}`);
            g.appendChild(ring);
          }
        } else if (canPlay && isValidHexTorusGoMove(cell, hexTorusGoCurrentTurn)) {
          const ghost = document.createElementNS(SVG_NS, 'circle');
          ghost.setAttribute('cx', x.toFixed(2));
          ghost.setAttribute('cy', y.toFixed(2));
          ghost.setAttribute('r', (s2 * 0.62).toFixed(2));
          ghost.setAttribute('class', `hexgo-ghost ${hexTorusGoCurrentTurn}`);
          g.appendChild(ghost);
        }
      },
      onClick(q, r, deps2): void {
        if (hexTorusGoGameOver) return;
        if (placeHexTorusGoStone(hexTorusGoIndex(q, r))) {
          deps2.refreshStatus();
          deps2.rerender();
        }
      },
    });
  },
};
