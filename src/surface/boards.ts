// Stage boards for the catalog: a topology (or a non-square board that is
// still a known surface) plus a starting-position painting for the chosen game.

import { Topology, TOPOLOGY_MAP } from '../topology';
import { createInitialChessBoard } from '../engine/games/chess';
import type { GoBoard } from '../engine/games/go';
import { planSurface } from './plan';
import { edgeRamps, paintChess, paintEdgeStrips, paintGo, paintHexRhombus, paintSnake } from './texture';
import type { StageBoard } from './stage';

// A 9x9 position whose groups straddle the board edges, so the fold visibly
// reunites them.
const GO_DEMO: [number, number, 'black' | 'white'][] = [
  [0, 3, 'black'], [0, 4, 'black'], [8, 4, 'black'], [8, 5, 'white'], [0, 5, 'white'],
  [4, 0, 'white'], [4, 8, 'white'], [3, 0, 'white'], [5, 8, 'black'], [5, 0, 'black'],
  [2, 2, 'black'], [6, 6, 'white'], [2, 6, 'black'], [6, 2, 'white'], [4, 4, 'black'],
  [3, 4, 'white'], [4, 3, 'white'], [8, 8, 'black'], [0, 0, 'black'], [0, 8, 'white'],
];

function goDemo(): GoBoard {
  const b: GoBoard = Array.from({ length: 9 }, () => Array(9).fill(null));
  for (const [r, c, s] of GO_DEMO) b[r][c] = s;
  return b;
}

const SNAKE_DEMO = {
  size: 10,
  body: [[4, 9], [4, 8], [4, 7], [5, 7], [6, 7], [6, 6], [6, 5], [6, 4], [5, 4], [4, 4], [3, 4], [3, 3], [3, 2], [3, 1]] as [number, number][],
  food: [4, 1] as [number, number],
};

export type PaintKind = 'chess' | 'go' | 'snake' | 'hextorus';

export function catalogBoard(topo: Topology, kind: PaintKind): StageBoard {
  const plan = planSurface(topo);
  const ramps = edgeRamps(topo, plan);
  const chess = createInitialChessBoard();
  const go = goDemo();
  return {
    plan, topo, ramps,
    paint(ctx, px) {
      if (kind === 'chess') paintChess(ctx, px, { board: chess });
      else if (kind === 'go') paintGo(ctx, px, { board: go });
      else if (kind === 'snake') paintSnake(ctx, px, SNAKE_DEMO);
      else paintHexRhombus(ctx, px);
      paintEdgeStrips(ctx, px, ramps);
    },
  };
}

// The hex torus is the 11x11 axial rhombus with opposite edges glued: the
// same gluing as the square torus up to an affine map, so it rides the torus
// plan (and its comets) with a hex painting.
export function hexTorusBoard(): StageBoard {
  return catalogBoard(TOPOLOGY_MAP.get('torus')!, 'hextorus');
}
