import { currentGame, gameMode } from './state';
import {
  PIECE_SYMBOLS, chessBoard, chessCurrentTurn, selectedSquare, chessGameOver,
  clickChessSquare, getLegalDestinations, isInCheck
} from './chess';
import {
  GO_SIZE, KOMI, STAR_POINTS, goBoard, goCurrentTurn, goGameOver, goCaptures, goLastMove,
  isValidGoMove, placeGoStone, scoreGo
} from './go';

export const CHESS_TILE_COUNT = 5;
export const GO_TILE_COUNT = 5;
export const CHESS_BOARD_SIZE = 8 * 60; // 480px
export const GO_BOARD_SIZE = 19 * 30; // 570px

let panOffsetX = 0;
let panOffsetY = 0;
let shouldResetPanPosition = true;

let isSliding = false;
let slideAnimationId: number | null = null;
const SLIDE_SPEED_X = 0.3;
const SLIDE_SPEED_Y = 0.2;

// Per-render caches
let chessLegalDests: Set<string> | null = null;
let goValidCache: boolean[][] = [];
const goIntersectionMap = new Map<string, HTMLElement[]>();

let showBoundaries = true;

export function requestPanReset(): void {
  shouldResetPanPosition = true;
}

export function setShowBoundaries(value: boolean): void {
  showBoundaries = value;
  renderBoard();
}

// ==================== BOARD RENDERING ====================
export function renderBoard(): void {
  const boardEl = document.getElementById('board')!;
  const containerEl = document.getElementById('board-container')!;
  boardEl.innerHTML = '';
  goIntersectionMap.clear();

  if (currentGame === 'chess') {
    boardEl.classList.remove('go-board');
    renderChessBoard(boardEl, containerEl);
  } else {
    boardEl.classList.add('go-board');
    renderGoBoard(boardEl, containerEl);
  }

  if (showBoundaries && (gameMode === 'rollover' || gameMode === 'mirror')) {
    boardEl.appendChild(createTopologyOverlay());
  }
  updateSeamLegend();
}

// ==================== TOPOLOGY OVERLAY ====================
function createTopologyOverlay(): HTMLElement {
  const tileCount = currentGame === 'chess' ? CHESS_TILE_COUNT : GO_TILE_COUNT;
  const tileSize = currentGame === 'chess' ? CHESS_BOARD_SIZE : GO_BOARD_SIZE;

  const overlay = document.createElement('div');
  overlay.id = 'topology-overlay';
  overlay.style.gridTemplateColumns = `repeat(${tileCount}, ${tileSize}px)`;
  overlay.style.gridTemplateRows = `repeat(${tileCount}, ${tileSize}px)`;

  for (let tileRow = 0; tileRow < tileCount; tileRow++) {
    const reflected = gameMode === 'mirror' && tileRow % 2 === 1;
    for (let tileCol = 0; tileCol < tileCount; tileCol++) {
      const tile = document.createElement('div');
      tile.className = 'topo-tile ' + (gameMode === 'mirror' ? 'edge-mirror' : 'edge-wrap');
      if (reflected) tile.classList.add('reflected');

      const glyph = document.createElement('div');
      glyph.className = 'topo-glyph';
      glyph.textContent = '▲';
      tile.appendChild(glyph);

      const label = document.createElement('div');
      label.className = 'topo-label';
      label.textContent = reflected ? 'REFLECTED' : 'ORIGINAL';
      tile.appendChild(label);

      overlay.appendChild(tile);
    }
  }

  return overlay;
}

function updateSeamLegend(): void {
  const legendEl = document.getElementById('seam-legend')!;
  const active = showBoundaries && (gameMode === 'rollover' || gameMode === 'mirror');
  legendEl.classList.toggle('visible', active);
  if (!active) {
    legendEl.innerHTML = '';
    return;
  }

  const rows = gameMode === 'mirror'
    ? [
        ['swatch-mirror', 'MIRROR EDGE: REFLECTS'],
        ['swatch-wrap', 'WRAP EDGE: REPEATS'],
        ['swatch-hatch', 'REFLECTED COPY'],
      ]
    : [
        ['swatch-wrap', 'WRAP EDGE: REPEATS'],
      ];

  legendEl.innerHTML = rows
    .map(([cls, text]) => `<div class="legend-row"><span class="legend-swatch ${cls}"></span>${text}</div>`)
    .join('');
}

function renderChessBoard(boardEl: HTMLElement, containerEl: HTMLElement): void {
  chessLegalDests = selectedSquare
    ? getLegalDestinations(selectedSquare[0], selectedSquare[1])
    : null;

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
  } else if (chessLegalDests && chessLegalDests.has(`${row},${col}`)) {
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
    clickChessSquare(row, col);
    updateStatus();
    renderBoard();
  });

  return square;
}

function renderGoBoard(boardEl: HTMLElement, containerEl: HTMLElement): void {
  goValidCache = Array(GO_SIZE).fill(null).map(() => Array(GO_SIZE).fill(false));
  if (!goGameOver) {
    for (let row = 0; row < GO_SIZE; row++) {
      for (let col = 0; col < GO_SIZE; col++) {
        if (!goBoard[row][col]) {
          goValidCache[row][col] = isValidGoMove(row, col, goCurrentTurn);
        }
      }
    }
  }

  if (gameMode === 'rollover') {
    boardEl.classList.add('tessellated');
    containerEl.classList.add('tessellated');
    renderTessellatedGoBoard(boardEl, shouldResetPanPosition);
    shouldResetPanPosition = false;
  } else if (gameMode === 'mirror') {
    boardEl.classList.add('tessellated');
    containerEl.classList.add('tessellated');
    renderMirrorTessellatedGoBoard(boardEl, shouldResetPanPosition);
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
  for (let tileRow = 0; tileRow < GO_TILE_COUNT; tileRow++) {
    for (let boardRow = 0; boardRow < GO_SIZE; boardRow++) {
      for (let tileCol = 0; tileCol < GO_TILE_COUNT; tileCol++) {
        for (let boardCol = 0; boardCol < GO_SIZE; boardCol++) {
          const intersection = createGoIntersection(boardRow, boardCol, false);
          boardEl.appendChild(intersection);
        }
      }
    }
  }

  if (resetPosition) {
    const centerOffset = Math.floor(GO_TILE_COUNT / 2) * GO_BOARD_SIZE;
    panOffsetX = -centerOffset;
    panOffsetY = -centerOffset;
  }
  updateBoardPosition();
}

function renderMirrorTessellatedGoBoard(boardEl: HTMLElement, resetPosition: boolean = false): void {
  for (let tileRow = 0; tileRow < GO_TILE_COUNT; tileRow++) {
    const isReflectedRow = tileRow % 2 === 1;
    for (let boardRow = 0; boardRow < GO_SIZE; boardRow++) {
      const displayRow = isReflectedRow ? (GO_SIZE - 1 - boardRow) : boardRow;
      for (let tileCol = 0; tileCol < GO_TILE_COUNT; tileCol++) {
        for (let boardCol = 0; boardCol < GO_SIZE; boardCol++) {
          const intersection = createGoIntersection(displayRow, boardCol, false);
          boardEl.appendChild(intersection);
        }
      }
    }
  }

  if (resetPosition) {
    const centerOffset = Math.floor(GO_TILE_COUNT / 2) * GO_BOARD_SIZE;
    panOffsetX = -centerOffset;
    panOffsetY = -centerOffset;
  }
  updateBoardPosition();
}

function syncGoHoverState(row: number, col: number, isHovering: boolean): void {
  const elements = goIntersectionMap.get(`${row},${col}`);
  if (!elements) return;

  for (const el of elements) {
    el.classList.toggle('hover-synced', isHovering);
  }
}

function createGoIntersection(row: number, col: number, showEdges: boolean): HTMLElement {
  const intersection = document.createElement('div');
  intersection.className = 'go-intersection';

  const key = `${row},${col}`;
  const mapped = goIntersectionMap.get(key);
  if (mapped) {
    mapped.push(intersection);
  } else {
    goIntersectionMap.set(key, [intersection]);
  }

  if (showEdges && gameMode === 'classic') {
    if (row === 0) intersection.classList.add('edge-top');
    if (row === GO_SIZE - 1) intersection.classList.add('edge-bottom');
    if (col === 0) intersection.classList.add('edge-left');
    if (col === GO_SIZE - 1) intersection.classList.add('edge-right');
  }

  const isStarPoint = STAR_POINTS.some(([r, c]) => r === row && c === col);
  if (isStarPoint && !goBoard[row][col]) {
    intersection.classList.add('star-point');
    const starDot = document.createElement('div');
    starDot.className = 'star-dot';
    intersection.appendChild(starDot);
  }

  const stone = goBoard[row][col];
  if (stone) {
    intersection.classList.add('has-stone');
    const stoneEl = document.createElement('div');
    stoneEl.className = `go-stone ${stone}-stone`;
    intersection.appendChild(stoneEl);
  }

  if (goLastMove && goLastMove[0] === row && goLastMove[1] === col) {
    intersection.classList.add('last-move');
  }

  if (!stone && goValidCache[row][col]) {
    intersection.classList.add('valid-move');
    intersection.classList.add(`${goCurrentTurn}-turn`);

    const ghostStone = document.createElement('div');
    ghostStone.className = `ghost-stone ${goCurrentTurn}-ghost`;
    intersection.appendChild(ghostStone);
  }

  intersection.addEventListener('click', () => {
    if (goGameOver) return;
    if (placeGoStone(row, col)) {
      updateStatus();
      renderBoard();
    }
  });

  intersection.addEventListener('mouseenter', () => {
    if (gameMode !== 'classic') {
      syncGoHoverState(row, col, true);
    }
  });

  intersection.addEventListener('mouseleave', () => {
    if (gameMode !== 'classic') {
      syncGoHoverState(row, col, false);
    }
  });

  return intersection;
}

// ==================== PAN & SLIDE ====================
export function updateBoardPosition(): void {
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

export function initPanControls(): void {
  const containerEl = document.getElementById('board-container')!;
  let isPanning = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartPanX = 0;
  let dragStartPanY = 0;

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
}

export function startSliding(): void {
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

export function stopSliding(): void {
  isSliding = false;
  if (slideAnimationId !== null) {
    cancelAnimationFrame(slideAnimationId);
    slideAnimationId = null;
  }
}

// ==================== STATUS ====================
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function updateStatus(): void {
  const statusEl = document.getElementById('status')!;

  if (currentGame === 'chess') {
    if (chessGameOver === 'draw') {
      statusEl.textContent = 'Stalemate - draw';
    } else if (chessGameOver) {
      statusEl.textContent = `Checkmate - ${capitalize(chessGameOver)} wins!`;
    } else {
      const check = isInCheck(chessCurrentTurn) ? ' - check!' : '';
      statusEl.textContent = `${capitalize(chessCurrentTurn)}'s turn${check}`;
    }
  } else {
    if (goGameOver) {
      const score = scoreGo();
      const result = score.winner === 'draw' ? 'Draw' : `${capitalize(score.winner)} wins!`;
      statusEl.textContent = `Black ${score.blackTotal} : White ${score.whiteTotal} (komi ${KOMI}) - ${result}`;
    } else {
      statusEl.textContent = `${capitalize(goCurrentTurn)}'s turn - B: ${goCaptures.black} W: ${goCaptures.white}`;
    }
  }
}

export function updateModeDescription(): void {
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
