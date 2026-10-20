// Stage boards for the catalog: a topology (or a non-square board that is
// still a known surface), a starting-position painting for the chosen game,
// and a mover that walks the grid so the gluings are seen in motion.

import { Topology, TOPOLOGY_MAP } from '../topology';
import { createInitialChessBoard } from '../engine/games/chess';
import type { GoBoard } from '../engine/games/go';
import { planSurface } from './plan';
import { paintChess, paintGo, paintHexRhombus, paintSnake, pieceSprite, snakeSprite } from './texture';
import type { MoverSpec, StageBoard } from './stage';

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

const SNAKE_SIZE = 8;
const SNAKE_FOOD: [number, number] = [1, 6];

export type PaintKind = 'chess' | 'go' | 'snake' | 'hextorus';

let rookSprite: HTMLCanvasElement | null = null;
let snakeSprites: HTMLCanvasElement[] | null = null;

// Chess: a white rook slides along the empty middle ranks of the starting
// position. Snake: a six-segment snake roams an empty board.
function moverFor(kind: PaintKind): MoverSpec | undefined {
  if (kind === 'chess') {
    rookSprite ??= pieceSprite('rook', 'white');
    return { sprites: [rookSprite], chain: 1, step: 0.36, pause: 0.7, free: r => r >= 2 && r <= 5 };
  }
  if (kind === 'snake') {
    snakeSprites ??= [snakeSprite(true), snakeSprite(false)];
    return {
      sprites: snakeSprites, chain: 6, step: 0.24, pause: 0,
      free: (r, c) => !(r === SNAKE_FOOD[0] && c === SNAKE_FOOD[1]),
    };
  }
  return undefined;
}

export function catalogBoard(topo: Topology, kind: PaintKind): StageBoard {
  const plan = planSurface(topo);
  const chess = createInitialChessBoard();
  const go = goDemo();
  return {
    plan, topo,
    mover: moverFor(kind),
    paint(ctx, px) {
      if (kind === 'chess') paintChess(ctx, px, { board: chess });
      else if (kind === 'go') paintGo(ctx, px, { board: go });
      else if (kind === 'snake') paintSnake(ctx, px, { size: SNAKE_SIZE, body: [], food: SNAKE_FOOD });
      else paintHexRhombus(ctx, px);
    },
  };
}

// The hex torus is the 11x11 axial rhombus with opposite edges glued: the
// same gluing as the square torus up to an affine map, so it rides the torus
// plan (and its tiling) with a hex painting.
export function hexTorusBoard(): StageBoard {
  return catalogBoard(TOPOLOGY_MAP.get('torus')!, 'hextorus');
}
