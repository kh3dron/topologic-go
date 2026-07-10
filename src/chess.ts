import { Color, currentTopology, opponentOf } from './state';

export type PieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';

export interface ChessPiece {
  type: PieceType;
  color: Color;
}

export type ChessBoard = (ChessPiece | null)[][];

export const CHESS_SIZE = 8;

export const PIECE_SYMBOLS: Record<Color, Record<PieceType, string>> = {
  white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
  black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' }
};

export let chessBoard: ChessBoard;
export let chessCurrentTurn: Color = 'white';
export let selectedSquare: [number, number] | null = null;
export let chessGameOver: Color | 'draw' | null = null;

// The starting position is IDENTICAL on every topology - no per-topology
// adjustments, ever. Some topologies make the standard setup degenerate
// (e.g. on the torus the back ranks are glued, the kings start adjacent, and
// white is checkmated at move zero). That is deliberate: which topologies
// yield interesting games is an open research question for this project, and
// the engine's job is to evaluate the rules faithfully, not to patch them.
function createInitialChessBoard(): ChessBoard {
  const board: ChessBoard = Array(CHESS_SIZE).fill(null).map(() => Array(CHESS_SIZE).fill(null));
  const backRow: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];

  for (let col = 0; col < CHESS_SIZE; col++) {
    board[0][col] = { type: backRow[col], color: 'black' };
    board[1][col] = { type: 'pawn', color: 'black' };
    board[6][col] = { type: 'pawn', color: 'white' };
    board[7][col] = { type: backRow[col], color: 'white' };
  }

  return board;
}

export function resetChess(): void {
  chessBoard = createInitialChessBoard();
  chessCurrentTurn = 'white';
  selectedSquare = null;
  chessGameOver = null;

  // Some topologies are decided before the first move (torus: white is
  // checkmated at move zero). Report that state honestly.
  if (!hasAnyLegalMove(chessCurrentTurn)) {
    chessGameOver = isInCheck(chessCurrentTurn) ? opponentOf(chessCurrentTurn) : 'draw';
  }
}

// ==================== MOVE GENERATION ====================
// All moves are computed in the infinite plane and projected onto the board
// through the current topology, so every piece works on every topology.

function proj(row: number, col: number): [number, number] | null {
  return currentTopology.project(row, col, CHESS_SIZE);
}

const KNIGHT_OFFSETS = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2],
  [1, -2], [1, 2], [2, -1], [2, 1]
];

const KING_OFFSETS = [
  [-1, -1], [-1, 0], [-1, 1], [0, -1],
  [0, 1], [1, -1], [1, 0], [1, 1]
];

const STRAIGHT_DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];
const DIAGONAL_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

const SLIDE_CAP = CHESS_SIZE * 4;

function getPseudoDestinations(fromRow: number, fromCol: number): Set<string> {
  const dests = new Set<string>();
  const piece = chessBoard[fromRow][fromCol];
  if (!piece) return dests;

  const addOffsets = (offsets: number[][]) => {
    for (const [dr, dc] of offsets) {
      const p = proj(fromRow + dr, fromCol + dc);
      if (!p) continue;
      const [r, c] = p;
      if (r === fromRow && c === fromCol) continue;
      const target = chessBoard[r][c];
      if (!target || target.color !== piece.color) dests.add(`${r},${c}`);
    }
  };

  const slide = (dirs: number[][]) => {
    for (const [dr, dc] of dirs) {
      for (let t = 1; t <= SLIDE_CAP; t++) {
        const p = proj(fromRow + dr * t, fromCol + dc * t);
        if (!p) break;
        const [r, c] = p;
        if (r === fromRow && c === fromCol) break;
        const target = chessBoard[r][c];
        if (target) {
          if (target.color !== piece.color) dests.add(`${r},${c}`);
          break;
        }
        dests.add(`${r},${c}`);
      }
    }
  };

  switch (piece.type) {
    case 'pawn': {
      const dir = piece.color === 'white' ? -1 : 1;
      const startRow = piece.color === 'white' ? 6 : 1;

      const one = proj(fromRow + dir, fromCol);
      if (one && !chessBoard[one[0]][one[1]]) {
        dests.add(`${one[0]},${one[1]}`);
        if (fromRow === startRow) {
          const two = proj(fromRow + 2 * dir, fromCol);
          if (two && !chessBoard[two[0]][two[1]]) dests.add(`${two[0]},${two[1]}`);
        }
      }

      for (const dc of [-1, 1]) {
        const p = proj(fromRow + dir, fromCol + dc);
        if (!p) continue;
        const target = chessBoard[p[0]][p[1]];
        if (target && target.color !== piece.color) dests.add(`${p[0]},${p[1]}`);
      }
      break;
    }

    case 'knight':
      addOffsets(KNIGHT_OFFSETS);
      break;

    case 'king':
      addOffsets(KING_OFFSETS);
      break;

    case 'rook':
      slide(STRAIGHT_DIRS);
      break;

    case 'bishop':
      slide(DIAGONAL_DIRS);
      break;

    case 'queen':
      slide(STRAIGHT_DIRS);
      slide(DIAGONAL_DIRS);
      break;
  }

  return dests;
}

// ==================== CHECK / CHECKMATE ====================
function findKing(color: Color): [number, number] | null {
  for (let row = 0; row < CHESS_SIZE; row++) {
    for (let col = 0; col < CHESS_SIZE; col++) {
      const piece = chessBoard[row][col];
      if (piece && piece.type === 'king' && piece.color === color) {
        return [row, col];
      }
    }
  }
  return null;
}

function isSquareAttacked(row: number, col: number, byColor: Color): boolean {
  const key = `${row},${col}`;
  for (let r = 0; r < CHESS_SIZE; r++) {
    for (let c = 0; c < CHESS_SIZE; c++) {
      const piece = chessBoard[r][c];
      if (piece && piece.color === byColor && getPseudoDestinations(r, c).has(key)) {
        return true;
      }
    }
  }
  return false;
}

export function isInCheck(color: Color): boolean {
  const kingPos = findKing(color);
  if (!kingPos) return false;
  return isSquareAttacked(kingPos[0], kingPos[1], opponentOf(color));
}

function moveLeavesKingInCheck(fromRow: number, fromCol: number, toRow: number, toCol: number): boolean {
  const piece = chessBoard[fromRow][fromCol];
  if (!piece) return false;

  const savedBoard = chessBoard;
  chessBoard = savedBoard.map(r => [...r]);
  chessBoard[toRow][toCol] = chessBoard[fromRow][fromCol];
  chessBoard[fromRow][fromCol] = null;

  const inCheck = isInCheck(piece.color);
  chessBoard = savedBoard;
  return inCheck;
}

export function isLegalChessMove(fromRow: number, fromCol: number, toRow: number, toCol: number): boolean {
  return getPseudoDestinations(fromRow, fromCol).has(`${toRow},${toCol}`) &&
         !moveLeavesKingInCheck(fromRow, fromCol, toRow, toCol);
}

export function getLegalDestinations(fromRow: number, fromCol: number): Set<string> {
  const legal = new Set<string>();
  for (const dest of getPseudoDestinations(fromRow, fromCol)) {
    const [row, col] = dest.split(',').map(Number);
    if (!moveLeavesKingInCheck(fromRow, fromCol, row, col)) legal.add(dest);
  }
  return legal;
}

function hasAnyLegalMove(color: Color): boolean {
  for (let row = 0; row < CHESS_SIZE; row++) {
    for (let col = 0; col < CHESS_SIZE; col++) {
      const piece = chessBoard[row][col];
      if (!piece || piece.color !== color) continue;
      if (getLegalDestinations(row, col).size > 0) return true;
    }
  }
  return false;
}

// ==================== MOVE HANDLING ====================
export function clickChessSquare(row: number, col: number): void {
  if (chessGameOver) return;

  const piece = chessBoard[row][col];

  if (selectedSquare) {
    const [fromRow, fromCol] = selectedSquare;

    if (fromRow === row && fromCol === col) {
      selectedSquare = null;
    } else if (isLegalChessMove(fromRow, fromCol, row, col)) {
      const mover = chessCurrentTurn;
      chessBoard[row][col] = chessBoard[fromRow][fromCol];
      chessBoard[fromRow][fromCol] = null;

      if (chessBoard[row][col]?.type === 'pawn' && (row === 0 || row === CHESS_SIZE - 1)) {
        chessBoard[row][col] = { type: 'queen', color: chessBoard[row][col]!.color };
      }

      const next = opponentOf(mover);
      chessCurrentTurn = next;
      selectedSquare = null;

      if (!hasAnyLegalMove(next)) {
        chessGameOver = isInCheck(next) ? mover : 'draw';
      }
    } else if (piece && piece.color === chessCurrentTurn) {
      selectedSquare = [row, col];
    } else {
      selectedSquare = null;
    }
  } else if (piece && piece.color === chessCurrentTurn) {
    selectedSquare = [row, col];
  }
}
