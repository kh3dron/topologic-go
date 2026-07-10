import { Color, gameMode, opponentOf } from './state';
import { wrap, wrapMirror } from './topology';

export type PieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';

export interface ChessPiece {
  type: PieceType;
  color: Color;
}

export type ChessBoard = (ChessPiece | null)[][];

export const PIECE_SYMBOLS: Record<Color, Record<PieceType, string>> = {
  white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
  black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' }
};

export let chessBoard: ChessBoard;
export let chessCurrentTurn: Color = 'white';
export let selectedSquare: [number, number] | null = null;
export let chessGameOver: Color | 'draw' | null = null;

function createInitialChessBoard(): ChessBoard {
  const board: ChessBoard = Array(8).fill(null).map(() => Array(8).fill(null));
  const backRow: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];

  for (let col = 0; col < 8; col++) {
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
}

function isValidChessMove(fromRow: number, fromCol: number, toRow: number, toCol: number): boolean {
  if (gameMode === 'rollover') {
    return isValidMoveRollover(fromRow, fromCol, toRow, toCol);
  }
  if (gameMode === 'mirror') {
    return isValidMoveMirror(fromRow, fromCol, toRow, toCol);
  }
  return isValidMoveClassic(fromRow, fromCol, toRow, toCol);
}

function isValidMoveClassic(fromRow: number, fromCol: number, toRow: number, toCol: number): boolean {
  const piece = chessBoard[fromRow][fromCol];
  if (!piece) return false;

  const target = chessBoard[toRow][toCol];
  if (target && target.color === piece.color) return false;

  const rowDiff = toRow - fromRow;
  const colDiff = toCol - fromCol;
  const absRowDiff = Math.abs(rowDiff);
  const absColDiff = Math.abs(colDiff);

  switch (piece.type) {
    case 'pawn': {
      const direction = piece.color === 'white' ? -1 : 1;
      const startRow = piece.color === 'white' ? 6 : 1;

      if (colDiff === 0 && !target) {
        if (rowDiff === direction) return true;
        if (fromRow === startRow && rowDiff === 2 * direction && !chessBoard[fromRow + direction][fromCol]) return true;
      }
      if (absColDiff === 1 && rowDiff === direction && target) return true;
      return false;
    }

    case 'rook':
      if (rowDiff !== 0 && colDiff !== 0) return false;
      return isPathClear(fromRow, fromCol, toRow, toCol);

    case 'knight':
      return (absRowDiff === 2 && absColDiff === 1) || (absRowDiff === 1 && absColDiff === 2);

    case 'bishop':
      if (absRowDiff !== absColDiff) return false;
      return isPathClear(fromRow, fromCol, toRow, toCol);

    case 'queen':
      if (rowDiff !== 0 && colDiff !== 0 && absRowDiff !== absColDiff) return false;
      return isPathClear(fromRow, fromCol, toRow, toCol);

    case 'king':
      return absRowDiff <= 1 && absColDiff <= 1;
  }
}

function isValidMoveRollover(fromRow: number, fromCol: number, toRow: number, toCol: number): boolean {
  const piece = chessBoard[fromRow][fromCol];
  if (!piece) return false;

  const target = chessBoard[toRow][toCol];
  if (target && target.color === piece.color) return false;

  switch (piece.type) {
    case 'pawn': {
      const direction = piece.color === 'white' ? -1 : 1;
      const startRow = piece.color === 'white' ? 6 : 1;
      const rowDiff = toRow - fromRow;

      const directColDiff = toCol - fromCol;
      const wrappedColDiff = directColDiff > 0 ? directColDiff - 8 : directColDiff + 8;

      if (directColDiff === 0 && !target) {
        if (rowDiff === direction) return true;
        if (fromRow === startRow && rowDiff === 2 * direction && !chessBoard[fromRow + direction][fromCol]) return true;
      }

      if (rowDiff === direction && target) {
        if (Math.abs(directColDiff) === 1 || Math.abs(wrappedColDiff) === 1) return true;
      }
      return false;
    }

    case 'knight': {
      const knightMoves = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
      ];
      for (const [dr, dc] of knightMoves) {
        if (wrap(fromRow + dr) === toRow && wrap(fromCol + dc) === toCol) {
          return true;
        }
      }
      return false;
    }

    case 'king': {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          if (wrap(fromRow + dr) === toRow && wrap(fromCol + dc) === toCol) {
            return true;
          }
        }
      }
      return false;
    }

    case 'rook':
      return isReachableStraight(fromRow, fromCol, toRow, toCol);

    case 'bishop':
      return isReachableDiagonal(fromRow, fromCol, toRow, toCol);

    case 'queen':
      return isReachableStraight(fromRow, fromCol, toRow, toCol) ||
             isReachableDiagonal(fromRow, fromCol, toRow, toCol);
  }
}

function isValidMoveMirror(fromRow: number, fromCol: number, toRow: number, toCol: number): boolean {
  const piece = chessBoard[fromRow][fromCol];
  if (!piece) return false;

  const target = chessBoard[toRow][toCol];
  if (target && target.color === piece.color) return false;

  switch (piece.type) {
    case 'pawn': {
      const direction = piece.color === 'white' ? -1 : 1;
      const startRow = piece.color === 'white' ? 6 : 1;
      const rowDiff = toRow - fromRow;

      const directColDiff = toCol - fromCol;
      const wrappedColDiff = directColDiff > 0 ? directColDiff - 8 : directColDiff + 8;

      if (directColDiff === 0 && !target) {
        if (rowDiff === direction) return true;
        if (fromRow === startRow && rowDiff === 2 * direction && !chessBoard[fromRow + direction][fromCol]) return true;
      }

      if (rowDiff === direction && target) {
        if (Math.abs(directColDiff) === 1 || Math.abs(wrappedColDiff) === 1) return true;
      }
      return false;
    }

    case 'knight': {
      const knightMoves = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
      ];
      for (const [dr, dc] of knightMoves) {
        const [newRow, newCol] = wrapMirror(fromRow + dr, fromCol + dc);
        if (newRow === toRow && newCol === toCol) {
          return true;
        }
      }
      return false;
    }

    case 'king': {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const [newRow, newCol] = wrapMirror(fromRow + dr, fromCol + dc);
          if (newRow === toRow && newCol === toCol) {
            return true;
          }
        }
      }
      return false;
    }

    case 'rook':
      return isReachableStraightMirror(fromRow, fromCol, toRow, toCol);

    case 'bishop':
      return isReachableDiagonalMirror(fromRow, fromCol, toRow, toCol);

    case 'queen':
      return isReachableStraightMirror(fromRow, fromCol, toRow, toCol) ||
             isReachableDiagonalMirror(fromRow, fromCol, toRow, toCol);
  }
}

function isReachableStraightMirror(fromRow: number, fromCol: number, toRow: number, toCol: number): boolean {
  const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  for (const [dr, dc] of directions) {
    if (isPathClearMirror(fromRow, fromCol, toRow, toCol, dr, dc)) return true;
  }
  return false;
}

function isReachableDiagonalMirror(fromRow: number, fromCol: number, toRow: number, toCol: number): boolean {
  const directions = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (const [dr, dc] of directions) {
    if (isPathClearMirror(fromRow, fromCol, toRow, toCol, dr, dc)) return true;
  }
  return false;
}

function isPathClearMirror(fromRow: number, fromCol: number, toRow: number, toCol: number, dr: number, dc: number): boolean {
  let row = fromRow + dr;
  let col = fromCol + dc;
  let steps = 0;
  const maxSteps = 16;

  while (steps < maxSteps) {
    const [newRow, newCol] = wrapMirror(row, col);

    if (newRow === toRow && newCol === toCol) {
      return true;
    }
    if (chessBoard[newRow][newCol]) {
      return false;
    }
    row += dr;
    col += dc;
    steps++;
  }
  return false;
}

function isReachableStraight(fromRow: number, fromCol: number, toRow: number, toCol: number): boolean {
  if (fromRow === toRow) {
    if (isPathClearWrapped(fromRow, fromCol, toRow, toCol, 0, 1)) return true;
    if (isPathClearWrapped(fromRow, fromCol, toRow, toCol, 0, -1)) return true;
  }
  if (fromCol === toCol) {
    if (isPathClearWrapped(fromRow, fromCol, toRow, toCol, 1, 0)) return true;
    if (isPathClearWrapped(fromRow, fromCol, toRow, toCol, -1, 0)) return true;
  }
  return false;
}

function isReachableDiagonal(fromRow: number, fromCol: number, toRow: number, toCol: number): boolean {
  const directions = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (const [dr, dc] of directions) {
    if (isPathClearWrapped(fromRow, fromCol, toRow, toCol, dr, dc)) return true;
  }
  return false;
}

function isPathClearWrapped(fromRow: number, fromCol: number, toRow: number, toCol: number, dr: number, dc: number): boolean {
  let row = wrap(fromRow + dr);
  let col = wrap(fromCol + dc);
  let steps = 0;
  const maxSteps = 8;

  while (steps < maxSteps) {
    if (row === toRow && col === toCol) {
      return true;
    }
    if (chessBoard[row][col]) {
      return false;
    }
    row = wrap(row + dr);
    col = wrap(col + dc);
    steps++;
  }
  return false;
}

function isPathClear(fromRow: number, fromCol: number, toRow: number, toCol: number): boolean {
  const rowStep = Math.sign(toRow - fromRow);
  const colStep = Math.sign(toCol - fromCol);

  let row = fromRow + rowStep;
  let col = fromCol + colStep;

  while (row !== toRow || col !== toCol) {
    if (chessBoard[row][col]) return false;
    row += rowStep;
    col += colStep;
  }

  return true;
}

// ==================== CHECK / CHECKMATE ====================
function findKing(color: Color): [number, number] | null {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = chessBoard[row][col];
      if (piece && piece.type === 'king' && piece.color === color) {
        return [row, col];
      }
    }
  }
  return null;
}

function isSquareAttacked(row: number, col: number, byColor: Color): boolean {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = chessBoard[r][c];
      if (piece && piece.color === byColor && isValidChessMove(r, c, row, col)) {
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
  return isValidChessMove(fromRow, fromCol, toRow, toCol) &&
         !moveLeavesKingInCheck(fromRow, fromCol, toRow, toCol);
}

export function getLegalDestinations(fromRow: number, fromCol: number): Set<string> {
  const destinations = new Set<string>();
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (isLegalChessMove(fromRow, fromCol, row, col)) {
        destinations.add(`${row},${col}`);
      }
    }
  }
  return destinations;
}

function hasAnyLegalMove(color: Color): boolean {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = chessBoard[row][col];
      if (!piece || piece.color !== color) continue;
      for (let toRow = 0; toRow < 8; toRow++) {
        for (let toCol = 0; toCol < 8; toCol++) {
          if (isLegalChessMove(row, col, toRow, toCol)) return true;
        }
      }
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

      if (chessBoard[row][col]?.type === 'pawn' && (row === 0 || row === 7)) {
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
