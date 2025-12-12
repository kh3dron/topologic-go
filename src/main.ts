// ==================== SHARED TYPES ====================
type Color = 'white' | 'black';
type GameMode = 'classic' | 'rollover' | 'mirror';
type GameType = 'chess' | 'go';

let currentGame: GameType = 'chess';
let gameMode: GameMode = 'classic';

// Tessellation view state
const CHESS_TILE_COUNT = 5;
const GO_TILE_COUNT = 5;
const CHESS_BOARD_SIZE = 8 * 60; // 480px
const GO_BOARD_SIZE = 19 * 30; // 570px
let panOffsetX = 0;
let panOffsetY = 0;
let dragStartX = 0;
let dragStartY = 0;
let dragStartPanX = 0;
let dragStartPanY = 0;
let shouldResetPanPosition = true;

// Animate state
let isSliding = false;
let slideAnimationId: number | null = null;
const SLIDE_SPEED_X = 0.3;
const SLIDE_SPEED_Y = 0.2;

// ==================== CHESS TYPES & STATE ====================
type PieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';

interface ChessPiece {
  type: PieceType;
  color: Color;
}

type ChessBoard = (ChessPiece | null)[][];

const PIECE_SYMBOLS: Record<Color, Record<PieceType, string>> = {
  white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
  black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' }
};

let chessBoard: ChessBoard;
let chessCurrentTurn: Color = 'white';
let selectedSquare: [number, number] | null = null;
let chessGameOver: Color | null = null;

// ==================== GO TYPES & STATE ====================
type GoStone = Color | null;
type GoBoard = GoStone[][];

const GO_SIZE = 19;

let goBoard: GoBoard;
let goCurrentTurn: Color = 'black';
let goGameOver: boolean = false;
let goPasses: number = 0;
let goCaptures: { black: number; white: number } = { black: 0, white: 0 };
let goLastMove: [number, number] | null = null;
let goPreviousBoardState: string | null = null; // For ko rule
let goMoveHistory: string[] = []; // Track board states for superko
let goHoveredIntersection: [number, number] | null = null; // Track hovered position for tessellated view

// Star points for 19x19 board
const STAR_POINTS = [
  [3, 3], [3, 9], [3, 15],
  [9, 3], [9, 9], [9, 15],
  [15, 3], [15, 9], [15, 15]
];

// ==================== HELPER FUNCTIONS ====================
function wrap(n: number, size: number = 8): number {
  return ((n % size) + size) % size;
}

function wrapMirror(row: number, col: number, size: number = 8): [number, number, boolean] {
  const newCol = ((col % size) + size) % size;
  let newRow = row;
  let flipped = false;

  while (newRow < 0 || newRow > size - 1) {
    if (newRow < 0) {
      newRow = -1 - newRow;
      flipped = !flipped;
    } else if (newRow > size - 1) {
      newRow = (size * 2 - 1) - newRow;
      flipped = !flipped;
    }
  }

  return [newRow, newCol, flipped];
}

// ==================== CHESS LOGIC ====================
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

function handleChessSquareClick(row: number, col: number): void {
  if (chessGameOver) return;

  const piece = chessBoard[row][col];

  if (selectedSquare) {
    const [fromRow, fromCol] = selectedSquare;

    if (fromRow === row && fromCol === col) {
      selectedSquare = null;
    } else if (isValidChessMove(fromRow, fromCol, row, col)) {
      const captured = chessBoard[row][col];
      chessBoard[row][col] = chessBoard[fromRow][fromCol];
      chessBoard[fromRow][fromCol] = null;

      if (captured?.type === 'king') {
        chessGameOver = chessCurrentTurn;
        selectedSquare = null;
        updateStatus();
        renderBoard();
        return;
      }

      if (chessBoard[row][col]?.type === 'pawn' && (row === 0 || row === 7)) {
        chessBoard[row][col] = { type: 'queen', color: chessBoard[row][col]!.color };
      }

      chessCurrentTurn = chessCurrentTurn === 'white' ? 'black' : 'white';
      selectedSquare = null;
      updateStatus();
    } else if (piece && piece.color === chessCurrentTurn) {
      selectedSquare = [row, col];
    } else {
      selectedSquare = null;
    }
  } else if (piece && piece.color === chessCurrentTurn) {
    selectedSquare = [row, col];
  }

  renderBoard();
}

// ==================== GO LOGIC ====================
function createInitialGoBoard(): GoBoard {
  return Array(GO_SIZE).fill(null).map(() => Array(GO_SIZE).fill(null));
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
    // Toroidal - all edges wrap
    neighbors.push([wrap(row - 1, GO_SIZE), col]);
    neighbors.push([wrap(row + 1, GO_SIZE), col]);
    neighbors.push([row, wrap(col - 1, GO_SIZE)]);
    neighbors.push([row, wrap(col + 1, GO_SIZE)]);
  } else if (gameMode === 'mirror') {
    // Mirror - vertical reflection, horizontal wrap
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

function isValidGoMove(row: number, col: number, color: Color): boolean {
  // Must be empty
  if (goBoard[row][col] !== null) return false;

  // Simulate the move
  const testBoard = goBoard.map(r => [...r]);
  testBoard[row][col] = color;

  // Check for captures first
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

  // Check if our own group has liberties
  const ourGroup = getGroup(testBoard, row, col);
  if (getLiberties(testBoard, ourGroup) === 0 && !capturedAny) {
    return false; // Suicide
  }

  // Check for ko (simple ko rule)
  const newBoardState = boardToString(testBoard);
  if (newBoardState === goPreviousBoardState) {
    return false; // Ko violation
  }

  return true;
}

function placeGoStone(row: number, col: number): boolean {
  if (!isValidGoMove(row, col, goCurrentTurn)) return false;

  const previousState = boardToString(goBoard);
  goBoard[row][col] = goCurrentTurn;

  // Capture opponent stones
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
  goPreviousBoardState = previousState;
  goMoveHistory.push(boardToString(goBoard));
  goPasses = 0;

  goCurrentTurn = goCurrentTurn === 'black' ? 'white' : 'black';
  return true;
}

function passGoTurn(): void {
  if (goGameOver) return;

  goPasses++;
  goLastMove = null;

  if (goPasses >= 2) {
    goGameOver = true;
    updateStatus();
    renderBoard();
    return;
  }

  goCurrentTurn = goCurrentTurn === 'black' ? 'white' : 'black';
  updateStatus();
  renderBoard();
}

function handleGoIntersectionClick(row: number, col: number): void {
  if (goGameOver) return;

  if (placeGoStone(row, col)) {
    updateStatus();
    renderBoard();
  }
}

// ==================== RENDERING ====================
function renderBoard(): void {
  const boardEl = document.getElementById('board')!;
  const containerEl = document.getElementById('board-container')!;
  boardEl.innerHTML = '';

  if (currentGame === 'chess') {
    boardEl.classList.remove('go-board');
    renderChessBoard(boardEl, containerEl);
  } else {
    boardEl.classList.add('go-board');
    renderGoBoard(boardEl, containerEl);
  }
}

function renderChessBoard(boardEl: HTMLElement, containerEl: HTMLElement): void {
  if (gameMode === 'rollover') {
    boardEl.classList.add('tessellated');
    containerEl.classList.add('tessellated');
    renderTessellatedChessBoard(boardEl, shouldResetPanPosition);
    shouldResetPanPosition = false;
  } else if (gameMode === 'mirror') {
    boardEl.classList.add('tessellated');
    containerEl.classList.add('tessellated');
    renderMirrorTessellatedChessBoard(boardEl, shouldResetPanPosition);
    shouldResetPanPosition = false;
  } else {
    boardEl.classList.remove('tessellated');
    containerEl.classList.remove('tessellated');
    boardEl.style.left = '';
    boardEl.style.top = '';
    renderSingleChessBoard(boardEl);
  }
}

function renderSingleChessBoard(boardEl: HTMLElement): void {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const square = createChessSquare(row, col);
      boardEl.appendChild(square);
    }
  }
}

function renderTessellatedChessBoard(boardEl: HTMLElement, resetPosition: boolean = false): void {
  for (let tileRow = 0; tileRow < CHESS_TILE_COUNT; tileRow++) {
    for (let boardRow = 0; boardRow < 8; boardRow++) {
      for (let tileCol = 0; tileCol < CHESS_TILE_COUNT; tileCol++) {
        for (let boardCol = 0; boardCol < 8; boardCol++) {
          const square = createChessSquare(boardRow, boardCol);
          boardEl.appendChild(square);
        }
      }
    }
  }

  if (resetPosition) {
    const centerOffset = Math.floor(CHESS_TILE_COUNT / 2) * CHESS_BOARD_SIZE;
    panOffsetX = -centerOffset;
    panOffsetY = -centerOffset;
  }
  updateBoardPosition();
}

function renderMirrorTessellatedChessBoard(boardEl: HTMLElement, resetPosition: boolean = false): void {
  for (let tileRow = 0; tileRow < CHESS_TILE_COUNT; tileRow++) {
    const isReflectedRow = tileRow % 2 === 1;
    for (let boardRow = 0; boardRow < 8; boardRow++) {
      const displayRow = isReflectedRow ? (7 - boardRow) : boardRow;
      for (let tileCol = 0; tileCol < CHESS_TILE_COUNT; tileCol++) {
        for (let boardCol = 0; boardCol < 8; boardCol++) {
          const square = createChessSquare(displayRow, boardCol);
          boardEl.appendChild(square);
        }
      }
    }
  }

  if (resetPosition) {
    const centerOffset = Math.floor(CHESS_TILE_COUNT / 2) * CHESS_BOARD_SIZE;
    panOffsetX = -centerOffset;
    panOffsetY = -centerOffset;
  }
  updateBoardPosition();
}

function createChessSquare(row: number, col: number): HTMLElement {
  const square = document.createElement('div');
  square.className = 'square ' + ((row + col) % 2 === 0 ? 'light' : 'dark');

  if (selectedSquare && selectedSquare[0] === row && selectedSquare[1] === col) {
    square.classList.add('selected');
  } else if (selectedSquare && isValidChessMove(selectedSquare[0], selectedSquare[1], row, col)) {
    const target = chessBoard[row][col];
    if (target) {
      square.classList.add('capturable');
    } else {
      square.classList.add('moveable');
    }
  }

  const piece = chessBoard[row][col];
  if (piece) {
    square.textContent = PIECE_SYMBOLS[piece.color][piece.type];
    square.classList.add(piece.color);
  }

  square.addEventListener('click', () => {
    handleChessSquareClick(row, col);
  });

  return square;
}

function renderGoBoard(boardEl: HTMLElement, containerEl: HTMLElement): void {
  if (gameMode === 'rollover' || gameMode === 'mirror') {
    boardEl.classList.add('tessellated');
    containerEl.classList.add('tessellated');
    renderTessellatedGoBoard(boardEl, shouldResetPanPosition);
    shouldResetPanPosition = false;
  } else {
    boardEl.classList.remove('tessellated');
    containerEl.classList.remove('tessellated');
    boardEl.style.left = '';
    boardEl.style.top = '';
    renderSingleGoBoard(boardEl);
  }
}

function renderSingleGoBoard(boardEl: HTMLElement): void {
  for (let row = 0; row < GO_SIZE; row++) {
    for (let col = 0; col < GO_SIZE; col++) {
      const intersection = createGoIntersection(row, col, true);
      boardEl.appendChild(intersection);
    }
  }
}

function renderTessellatedGoBoard(boardEl: HTMLElement, resetPosition: boolean = false): void {
  const tileCount = GO_TILE_COUNT;

  for (let tileRow = 0; tileRow < tileCount; tileRow++) {
    for (let boardRow = 0; boardRow < GO_SIZE; boardRow++) {
      for (let tileCol = 0; tileCol < tileCount; tileCol++) {
        for (let boardCol = 0; boardCol < GO_SIZE; boardCol++) {
          // In tessellated mode, no edges
          const intersection = createGoIntersection(boardRow, boardCol, false);
          boardEl.appendChild(intersection);
        }
      }
    }
  }

  if (resetPosition) {
    const centerOffset = Math.floor(tileCount / 2) * GO_BOARD_SIZE;
    panOffsetX = -centerOffset;
    panOffsetY = -centerOffset;
  }
  updateBoardPosition();
}

function createGoIntersection(row: number, col: number, showEdges: boolean): HTMLElement {
  const intersection = document.createElement('div');
  intersection.className = 'go-intersection';

  // Edge classes for classic mode
  if (showEdges && gameMode === 'classic') {
    if (row === 0) intersection.classList.add('edge-top');
    if (row === GO_SIZE - 1) intersection.classList.add('edge-bottom');
    if (col === 0) intersection.classList.add('edge-left');
    if (col === GO_SIZE - 1) intersection.classList.add('edge-right');
  }

  // Star points
  const isStarPoint = STAR_POINTS.some(([r, c]) => r === row && c === col);
  if (isStarPoint && !goBoard[row][col]) {
    intersection.classList.add('star-point');
    const starDot = document.createElement('div');
    starDot.className = 'star-dot';
    intersection.appendChild(starDot);
  }

  // Stone
  const stone = goBoard[row][col];
  if (stone) {
    intersection.classList.add('has-stone');
    const stoneEl = document.createElement('div');
    stoneEl.className = `go-stone ${stone}-stone`;
    intersection.appendChild(stoneEl);
  }

  // Last move marker
  if (goLastMove && goLastMove[0] === row && goLastMove[1] === col) {
    intersection.classList.add('last-move');
  }

  // Valid move indicator
  if (!stone && !goGameOver && isValidGoMove(row, col, goCurrentTurn)) {
    intersection.classList.add('valid-move');
    intersection.classList.add(`${goCurrentTurn}-turn`);

    // Ghost stone for hover preview
    const ghostStone = document.createElement('div');
    ghostStone.className = `ghost-stone ${goCurrentTurn}-ghost`;
    intersection.appendChild(ghostStone);
  }

  intersection.addEventListener('click', () => {
    handleGoIntersectionClick(row, col);
  });

  return intersection;
}

function updateBoardPosition(): void {
  const boardEl = document.getElementById('board')!;
  const boardSize = currentGame === 'chess' ? CHESS_BOARD_SIZE : GO_BOARD_SIZE;

  if (gameMode === 'rollover') {
    const wrappedX = ((panOffsetX % boardSize) + boardSize) % boardSize - boardSize;
    const wrappedY = ((panOffsetY % boardSize) + boardSize) % boardSize - boardSize;
    boardEl.style.left = `${wrappedX}px`;
    boardEl.style.top = `${wrappedY}px`;
  } else if (gameMode === 'mirror') {
    const DOUBLE_BOARD = boardSize * 2;
    const wrappedX = ((panOffsetX % boardSize) + boardSize) % boardSize - boardSize;
    const wrappedY = ((panOffsetY % DOUBLE_BOARD) + DOUBLE_BOARD) % DOUBLE_BOARD - DOUBLE_BOARD;
    boardEl.style.left = `${wrappedX}px`;
    boardEl.style.top = `${wrappedY}px`;
  }
}

// ==================== UI & STATUS ====================
function updateStatus(): void {
  const statusEl = document.getElementById('status')!;

  if (currentGame === 'chess') {
    if (chessGameOver) {
      statusEl.textContent = `${chessGameOver.charAt(0).toUpperCase() + chessGameOver.slice(1)} wins!`;
    } else {
      statusEl.textContent = `${chessCurrentTurn.charAt(0).toUpperCase() + chessCurrentTurn.slice(1)}'s turn`;
    }
  } else {
    if (goGameOver) {
      statusEl.textContent = `Game over - B: ${goCaptures.black} W: ${goCaptures.white} captured`;
    } else {
      const turnText = goCurrentTurn === 'black' ? 'Black' : 'White';
      statusEl.textContent = `${turnText}'s turn - B: ${goCaptures.black} W: ${goCaptures.white}`;
    }
  }
}

function updateModeDescription(): void {
  const descEl = document.getElementById('mode-description')!;

  if (currentGame === 'chess') {
    if (gameMode === 'classic') {
      descEl.textContent = 'Standard chess rules';
    } else if (gameMode === 'rollover') {
      descEl.textContent = 'Pieces wrap around the board edges on a torus!';
    } else {
      descEl.textContent = 'Board is reflected vertically when tiled - white backs white, black backs black!';
    }
  } else {
    if (gameMode === 'classic') {
      descEl.textContent = 'Standard Go rules on a 19x19 board';
    } else if (gameMode === 'rollover') {
      descEl.textContent = 'Stones wrap around all edges - infinite board!';
    } else {
      descEl.textContent = 'Board reflects vertically when tiled!';
    }
  }
}

// ==================== INITIALIZATION ====================
function initChess(): void {
  chessBoard = createInitialChessBoard();
  chessCurrentTurn = 'white';
  selectedSquare = null;
  chessGameOver = null;
  shouldResetPanPosition = true;
  updateStatus();
  renderBoard();
}

function initGo(): void {
  goBoard = createInitialGoBoard();
  goCurrentTurn = 'black';
  goGameOver = false;
  goPasses = 0;
  goCaptures = { black: 0, white: 0 };
  goLastMove = null;
  goPreviousBoardState = null;
  goMoveHistory = [];
  shouldResetPanPosition = true;
  updateStatus();
  renderBoard();
}

function init(): void {
  if (currentGame === 'chess') {
    initChess();
  } else {
    initGo();
  }
}

function setGame(game: GameType): void {
  if (game === currentGame) return;

  currentGame = game;
  shouldResetPanPosition = true;

  // Update button states
  document.getElementById('game-chess')!.classList.toggle('active', game === 'chess');
  document.getElementById('game-go')!.classList.toggle('active', game === 'go');

  // Update title
  document.getElementById('game-title')!.textContent = game === 'chess' ? 'Chess' : 'Go';

  // Show/hide pass button
  document.getElementById('pass-btn')!.classList.toggle('visible', game === 'go');

  updateModeDescription();
  init();
}

function setGameMode(mode: GameMode): void {
  gameMode = mode;
  shouldResetPanPosition = true;

  // Update button states
  document.getElementById('mode-classic')!.classList.toggle('active', mode === 'classic');
  document.getElementById('mode-rollover')!.classList.toggle('active', mode === 'rollover');
  document.getElementById('mode-mirror')!.classList.toggle('active', mode === 'mirror');

  updateModeDescription();

  // Show/hide slide control based on mode
  const slideControl = document.getElementById('slide-control')!;
  const slideCheckbox = document.getElementById('slide-board') as HTMLInputElement;
  if (mode === 'rollover' || mode === 'mirror') {
    slideControl.classList.add('visible');
  } else {
    slideControl.classList.remove('visible');
    slideCheckbox.checked = false;
    stopSliding();
  }

  // Reset the game when mode changes
  init();
}

function startSliding(): void {
  if (isSliding) return;
  isSliding = true;

  function animate(): void {
    if (!isSliding) return;

    panOffsetX -= SLIDE_SPEED_X;
    panOffsetY -= SLIDE_SPEED_Y;
    updateBoardPosition();

    slideAnimationId = requestAnimationFrame(animate);
  }

  slideAnimationId = requestAnimationFrame(animate);
}

function stopSliding(): void {
  isSliding = false;
  if (slideAnimationId !== null) {
    cancelAnimationFrame(slideAnimationId);
    slideAnimationId = null;
  }
}

// ==================== EVENT LISTENERS ====================
document.getElementById('reset')!.addEventListener('click', init);
document.getElementById('game-chess')!.addEventListener('click', () => setGame('chess'));
document.getElementById('game-go')!.addEventListener('click', () => setGame('go'));
document.getElementById('mode-classic')!.addEventListener('click', () => setGameMode('classic'));
document.getElementById('mode-rollover')!.addEventListener('click', () => setGameMode('rollover'));
document.getElementById('mode-mirror')!.addEventListener('click', () => setGameMode('mirror'));
document.getElementById('pass-btn')!.addEventListener('click', passGoTurn);

// Animate checkbox
document.getElementById('slide-board')!.addEventListener('change', (e) => {
  const checkbox = e.target as HTMLInputElement;
  if (checkbox.checked) {
    startSliding();
  } else {
    stopSliding();
  }
});

// Drag-to-pan functionality for tessellated view
const containerEl = document.getElementById('board-container')!;
let isPanning = false;

containerEl.addEventListener('mousedown', (e) => {
  if (gameMode !== 'rollover' && gameMode !== 'mirror') return;
  if (currentGame === 'chess' && selectedSquare) return; // Lock board when piece is selected
  isPanning = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragStartPanX = panOffsetX;
  dragStartPanY = panOffsetY;
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (!isPanning) return;
  panOffsetX = dragStartPanX + (e.clientX - dragStartX);
  panOffsetY = dragStartPanY + (e.clientY - dragStartY);
  updateBoardPosition();
});

document.addEventListener('mouseup', () => {
  isPanning = false;
});

init();
