import { Color, gameMode } from './state';
import { wrap, wrapMirror } from './topology';

export type GoStone = Color | null;
export type GoBoard = GoStone[][];

export const GO_SIZE = 19;
export const KOMI = 6.5;

export const STAR_POINTS = [
  [3, 3], [3, 9], [3, 15],
  [9, 3], [9, 9], [9, 15],
  [15, 3], [15, 9], [15, 15]
];

export let goBoard: GoBoard;
export let goCurrentTurn: Color = 'black';
export let goGameOver: boolean = false;
export let goPasses: number = 0;
export let goCaptures: { black: number; white: number } = { black: 0, white: 0 };
export let goLastMove: [number, number] | null = null;

let seenPositions = new Set<string>();

function createInitialGoBoard(): GoBoard {
  return Array(GO_SIZE).fill(null).map(() => Array(GO_SIZE).fill(null));
}

export function resetGo(): void {
  goBoard = createInitialGoBoard();
  goCurrentTurn = 'black';
  goGameOver = false;
  goPasses = 0;
  goCaptures = { black: 0, white: 0 };
  goLastMove = null;
  seenPositions = new Set([boardToString(goBoard)]);
}

function boardToString(board: GoBoard): string {
  return board.map(row => row.map(cell => cell ? cell[0] : '.').join('')).join('|');
}

function getNeighbors(row: number, col: number): [number, number][] {
  const neighbors: [number, number][] = [];

  if (gameMode === 'classic') {
    if (row > 0) neighbors.push([row - 1, col]);
    if (row < GO_SIZE - 1) neighbors.push([row + 1, col]);
    if (col > 0) neighbors.push([row, col - 1]);
    if (col < GO_SIZE - 1) neighbors.push([row, col + 1]);
  } else if (gameMode === 'rollover') {
    neighbors.push([wrap(row - 1, GO_SIZE), col]);
    neighbors.push([wrap(row + 1, GO_SIZE), col]);
    neighbors.push([row, wrap(col - 1, GO_SIZE)]);
    neighbors.push([row, wrap(col + 1, GO_SIZE)]);
  } else if (gameMode === 'mirror') {
    const [upRow, upCol] = wrapMirror(row - 1, col, GO_SIZE);
    const [downRow, downCol] = wrapMirror(row + 1, col, GO_SIZE);
    neighbors.push([upRow, upCol]);
    neighbors.push([downRow, downCol]);
    neighbors.push([row, wrap(col - 1, GO_SIZE)]);
    neighbors.push([row, wrap(col + 1, GO_SIZE)]);
  }

  return neighbors;
}

function getGroup(board: GoBoard, row: number, col: number): Set<string> {
  const color = board[row][col];
  if (!color) return new Set();

  const group = new Set<string>();
  const stack: [number, number][] = [[row, col]];

  while (stack.length > 0) {
    const [r, c] = stack.pop()!;
    const key = `${r},${c}`;
    if (group.has(key)) continue;
    if (board[r][c] !== color) continue;

    group.add(key);

    for (const [nr, nc] of getNeighbors(r, c)) {
      if (!group.has(`${nr},${nc}`) && board[nr][nc] === color) {
        stack.push([nr, nc]);
      }
    }
  }

  return group;
}

function getLiberties(board: GoBoard, group: Set<string>): number {
  const liberties = new Set<string>();

  for (const pos of group) {
    const [row, col] = pos.split(',').map(Number);
    for (const [nr, nc] of getNeighbors(row, col)) {
      if (board[nr][nc] === null) {
        liberties.add(`${nr},${nc}`);
      }
    }
  }

  return liberties.size;
}

function removeGroup(board: GoBoard, group: Set<string>): number {
  let count = 0;
  for (const pos of group) {
    const [row, col] = pos.split(',').map(Number);
    board[row][col] = null;
    count++;
  }
  return count;
}

export function isValidGoMove(row: number, col: number, color: Color): boolean {
  if (goBoard[row][col] !== null) return false;

  const testBoard = goBoard.map(r => [...r]);
  testBoard[row][col] = color;

  const opponent = color === 'black' ? 'white' : 'black';
  let capturedAny = false;

  for (const [nr, nc] of getNeighbors(row, col)) {
    if (testBoard[nr][nc] === opponent) {
      const group = getGroup(testBoard, nr, nc);
      if (getLiberties(testBoard, group) === 0) {
        removeGroup(testBoard, group);
        capturedAny = true;
      }
    }
  }

  const ourGroup = getGroup(testBoard, row, col);
  if (getLiberties(testBoard, ourGroup) === 0 && !capturedAny) {
    return false; // Suicide
  }

  // Positional superko: a move may not recreate any earlier board position
  if (seenPositions.has(boardToString(testBoard))) {
    return false;
  }

  return true;
}

export function placeGoStone(row: number, col: number): boolean {
  if (!isValidGoMove(row, col, goCurrentTurn)) return false;

  goBoard[row][col] = goCurrentTurn;

  const opponent = goCurrentTurn === 'black' ? 'white' : 'black';
  let totalCaptured = 0;

  for (const [nr, nc] of getNeighbors(row, col)) {
    if (goBoard[nr][nc] === opponent) {
      const group = getGroup(goBoard, nr, nc);
      if (getLiberties(goBoard, group) === 0) {
        totalCaptured += removeGroup(goBoard, group);
      }
    }
  }

  if (totalCaptured > 0) {
    goCaptures[goCurrentTurn] += totalCaptured;
  }

  goLastMove = [row, col];
  seenPositions.add(boardToString(goBoard));
  goPasses = 0;

  goCurrentTurn = goCurrentTurn === 'black' ? 'white' : 'black';
  return true;
}

export function passGoTurn(): void {
  if (goGameOver) return;

  goPasses++;
  goLastMove = null;

  if (goPasses >= 2) {
    goGameOver = true;
    return;
  }

  goCurrentTurn = goCurrentTurn === 'black' ? 'white' : 'black';
}

// ==================== SCORING ====================
export interface GoScore {
  blackTerritory: number;
  whiteTerritory: number;
  blackTotal: number;
  whiteTotal: number;
  winner: Color | 'draw';
}

export function scoreGo(): GoScore {
  const territory = { black: 0, white: 0 };
  const visited = new Set<string>();

  for (let row = 0; row < GO_SIZE; row++) {
    for (let col = 0; col < GO_SIZE; col++) {
      const key = `${row},${col}`;
      if (goBoard[row][col] !== null || visited.has(key)) continue;

      const region: [number, number][] = [];
      const borderColors = new Set<Color>();
      const stack: [number, number][] = [[row, col]];
      visited.add(key);

      while (stack.length > 0) {
        const [r, c] = stack.pop()!;
        region.push([r, c]);

        for (const [nr, nc] of getNeighbors(r, c)) {
          const stone = goBoard[nr][nc];
          if (stone) {
            borderColors.add(stone);
          } else {
            const nKey = `${nr},${nc}`;
            if (!visited.has(nKey)) {
              visited.add(nKey);
              stack.push([nr, nc]);
            }
          }
        }
      }

      if (borderColors.size === 1) {
        const owner = borderColors.values().next().value!;
        territory[owner] += region.length;
      }
    }
  }

  const blackTotal = territory.black + goCaptures.black;
  const whiteTotal = territory.white + goCaptures.white + KOMI;

  return {
    blackTerritory: territory.black,
    whiteTerritory: territory.white,
    blackTotal,
    whiteTotal,
    winner: blackTotal > whiteTotal ? 'black' : blackTotal < whiteTotal ? 'white' : 'draw',
  };
}
