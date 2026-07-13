import { currentGame, currentTopology } from './state';
import { tileOrientation } from './topology';
import {
  CHESS_SIZE, PIECE_SYMBOLS, chessBoard, chessCurrentTurn, selectedSquare, chessGameOver,
  clickChessSquare, getLegalDestinations, isInCheck
} from './chess';
import {
  GO_SIZE, KOMI, STAR_POINTS, goBoard, goCurrentTurn, goGameOver, goCaptures, goLastMove,
  isValidGoMove, placeGoStone, scoreGo
} from './go';

export const CHESS_CELL = 72;
export const GO_CELL = 32;

const ZOOM_LEVELS = [0.5, 0.67, 0.8, 1, 1.2, 1.5, 2];
const DEFAULT_ZOOM_INDEX = 3;
let zoomIndex = DEFAULT_ZOOM_INDEX;

let panOffsetX = 0;
let panOffsetY = 0;
let shouldResetPanPosition = true;

// Effective board placement from the last updateBoardPosition() call
let lastLeft = 0;
let lastTop = 0;
let isPannable = false;

// Tile grid of the current tessellated render
let tilesX = 1;
let tilesY = 1;

// True while a real drag is in progress; gates hover-sync without touching
// the DOM (any style flip scoped to the whole board recalcs every cell).
let suppressHoverSync = false;

let isSliding = false;
let slideAnimationId: number | null = null;
const SLIDE_SPEED_X = 0.3;
const SLIDE_SPEED_Y = 0.2;

// Per-render caches
let chessLegalDests: Set<string> | null = null;
let goValidCache: boolean[][] = [];
const goIntersectionMap = new Map<string, HTMLElement[]>();

let showBoundaries = true;

function boardSize(): number {
  return currentGame === 'chess' ? CHESS_SIZE : GO_SIZE;
}

function zoomedCell(base: number): number {
  return Math.max(8, Math.round(base * ZOOM_LEVELS[zoomIndex]));
}

function cellPx(): number {
  return zoomedCell(currentGame === 'chess' ? CHESS_CELL : GO_CELL);
}

function boardPx(): number {
  return boardSize() * cellPx();
}

export function requestPanReset(): void {
  shouldResetPanPosition = true;
}

export function setShowBoundaries(value: boolean): void {
  showBoundaries = value;
  renderBoard();
}

// ==================== ZOOM ====================
function applyCellVars(): void {
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--chess-cell', `${zoomedCell(CHESS_CELL)}px`);
  rootStyle.setProperty('--go-cell', `${zoomedCell(GO_CELL)}px`);
}

function updateZoomLabel(): void {
  const label = document.getElementById('zoom-level');
  if (label) label.textContent = `${Math.round(ZOOM_LEVELS[zoomIndex] * 100)}%`;
}

export function zoomStep(delta: number, anchorX?: number, anchorY?: number): void {
  const next = Math.min(Math.max(zoomIndex + delta, 0), ZOOM_LEVELS.length - 1);
  if (next === zoomIndex) return;

  const containerEl = document.getElementById('board-container')!;
  const ax = anchorX ?? containerEl.clientWidth / 2;
  const ay = anchorY ?? containerEl.clientHeight / 2;
  const oldBoard = boardPx();

  zoomIndex = next;
  applyCellVars();

  // Keep the board point under the anchor fixed
  const ratio = boardPx() / oldBoard;
  panOffsetX = Math.round(ax - (ax - lastLeft) * ratio);
  panOffsetY = Math.round(ay - (ay - lastTop) * ratio);

  updateZoomLabel();
  renderBoard();
}

export function resetZoom(): void {
  zoomStep(DEFAULT_ZOOM_INDEX - zoomIndex);
}

// ==================== BOARD RENDERING ====================
export function renderBoard(): void {
  const boardEl = document.getElementById('board')!;
  const containerEl = document.getElementById('board-container')!;
  boardEl.innerHTML = '';
  goIntersectionMap.clear();

  boardEl.classList.toggle('go-board', currentGame === 'go');

  if (currentGame === 'chess') {
    chessLegalDests = selectedSquare
      ? getLegalDestinations(selectedSquare[0], selectedSquare[1])
      : null;
  } else {
    const size = GO_SIZE;
    goValidCache = Array(size).fill(null).map(() => Array(size).fill(false));
    if (!goGameOver) {
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          if (!goBoard[row][col]) {
            goValidCache[row][col] = isValidGoMove(row, col, goCurrentTurn);
          }
        }
      }
    }
  }

  if (currentTopology.tessellated) {
    renderTessellated(boardEl, containerEl);
  } else {
    tilesX = 1;
    tilesY = 1;
    boardEl.style.gridTemplateColumns = `repeat(${boardSize()}, ${cellPx()}px)`;
    boardEl.style.gridTemplateRows = `repeat(${boardSize()}, ${cellPx()}px)`;
    renderPlaneCells(boardEl, 1, 1);
  }

  if (shouldResetPanPosition) {
    panOffsetX = Math.round((containerEl.clientWidth - boardPx()) / 2);
    panOffsetY = Math.round((containerEl.clientHeight - boardPx()) / 2);
    shouldResetPanPosition = false;
  }
  updateBoardPosition();
  updateSeamLegend();
}

function renderTessellated(boardEl: HTMLElement, containerEl: HTMLElement): void {
  const size = boardSize();
  const board = boardPx();
  const containerW = containerEl.clientWidth || 800;
  const containerH = containerEl.clientHeight || 600;
  const periodXPx = currentTopology.periodX ? currentTopology.periodX * board : null;
  const periodYPx = currentTopology.periodY ? currentTopology.periodY * board : null;

  // Pan wrapping keeps left/top in [-period, 0), so one period of padding
  // beyond the container fully covers the viewport.
  tilesX = periodXPx ? Math.ceil((containerW + periodXPx) / board) : 1;
  tilesY = periodYPx ? Math.ceil((containerH + periodYPx) / board) : 1;

  boardEl.style.gridTemplateColumns = `repeat(${tilesX * size}, ${cellPx()}px)`;
  boardEl.style.gridTemplateRows = `repeat(${tilesY * size}, ${cellPx()}px)`;

  renderPlaneCells(boardEl, tilesX, tilesY);

  if (showBoundaries) {
    boardEl.appendChild(createTopologyOverlay());
  }
}

// Renders every plane cell of the (tilesX x tilesY)-board region through
// project(). Works identically for the single classic board (1x1, where
// project is the identity on the board and null outside).
function renderPlaneCells(boardEl: HTMLElement, tx: number, ty: number): void {
  const size = boardSize();
  for (let R = 0; R < ty * size; R++) {
    for (let C = 0; C < tx * size; C++) {
      const p = currentTopology.project(R, C, size);
      if (!p) {
        const voidCell = document.createElement('div');
        voidCell.className = 'void-cell';
        boardEl.appendChild(voidCell);
        continue;
      }
      const [row, col] = p;
      if (currentGame === 'chess') {
        boardEl.appendChild(createChessSquare(row, col, (R + C) % 2 === 0));
      } else {
        boardEl.appendChild(createGoIntersection(row, col, {
          top: !currentTopology.project(R - 1, C, size),
          bottom: !currentTopology.project(R + 1, C, size),
          left: !currentTopology.project(R, C - 1, size),
          right: !currentTopology.project(R, C + 1, size),
        }));
      }
    }
  }
}

function createChessSquare(row: number, col: number, light: boolean): HTMLElement {
  const square = document.createElement('div');
  square.className = 'square ' + (light ? 'light' : 'dark');

  if (selectedSquare && selectedSquare[0] === row && selectedSquare[1] === col) {
    square.classList.add('selected');
    if (chessLegalDests && chessLegalDests.size === 0) square.classList.add('no-moves');
  } else if (chessLegalDests && chessLegalDests.has(`${row},${col}`)) {
    square.classList.add(chessBoard[row][col] ? 'capturable' : 'moveable');
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

interface Walls {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

function createGoIntersection(row: number, col: number, walls: Walls): HTMLElement {
  const intersection = document.createElement('div');
  intersection.className = 'go-intersection';

  const key = `${row},${col}`;
  const mapped = goIntersectionMap.get(key);
  if (mapped) {
    mapped.push(intersection);
  } else {
    goIntersectionMap.set(key, [intersection]);
  }

  if (walls.top) intersection.classList.add('edge-top');
  if (walls.bottom) intersection.classList.add('edge-bottom');
  if (walls.left) intersection.classList.add('edge-left');
  if (walls.right) intersection.classList.add('edge-right');

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
    if (suppressHoverSync) return;
    if (currentTopology.tessellated) syncGoHoverState(row, col, true);
  });

  intersection.addEventListener('mouseleave', () => {
    if (currentTopology.tessellated) syncGoHoverState(row, col, false);
  });

  return intersection;
}

function syncGoHoverState(row: number, col: number, isHovering: boolean): void {
  const elements = goIntersectionMap.get(`${row},${col}`);
  if (!elements) return;

  for (const el of elements) {
    el.classList.toggle('hover-synced', isHovering);
  }
}

// ==================== TOPOLOGY OVERLAY ====================
function seamType(a: ReturnType<typeof tileOrientation>, b: ReturnType<typeof tileOrientation>): 'wrap' | 'mirror' | 'rotation' {
  if (a.key === b.key) return 'wrap';
  return a.reflected !== b.reflected ? 'mirror' : 'rotation';
}

function createTopologyOverlay(): HTMLElement {
  const size = boardSize();
  const board = boardPx();
  const topo = currentTopology;

  const overlay = document.createElement('div');
  overlay.id = 'topology-overlay';
  overlay.style.gridTemplateColumns = `repeat(${tilesX}, ${board}px)`;
  overlay.style.gridTemplateRows = `repeat(${tilesY}, ${board}px)`;
  overlay.style.fontSize = `${Math.round(board * 0.25)}px`;

  const o00 = tileOrientation(topo, 0, 0, size);
  const vSeam = tilesX > 1 ? seamType(o00, tileOrientation(topo, 0, 1, size)) : null;
  const hSeam = tilesY > 1 ? seamType(o00, tileOrientation(topo, 1, 0, size)) : null;
  const wallX = topo.periodX === null;
  const wallY = topo.periodY === null;

  for (let tileRow = 0; tileRow < tilesY; tileRow++) {
    for (let tileCol = 0; tileCol < tilesX; tileCol++) {
      const orient = tileOrientation(topo, tileRow, tileCol, size);
      const tile = document.createElement('div');
      tile.className = 'topo-tile';
      if (orient.reflected) tile.classList.add('reflected');

      if (tileRow > 0 && hSeam) tile.classList.add(`seam-top-${hSeam}`);
      if (tileCol > 0 && vSeam) tile.classList.add(`seam-left-${vSeam}`);
      if (wallY && tileRow === 0) tile.classList.add('wall-top');
      if (wallY && tileRow === tilesY - 1) tile.classList.add('wall-bottom');
      if (wallX && tileCol === 0) tile.classList.add('wall-left');
      if (wallX && tileCol === tilesX - 1) tile.classList.add('wall-right');

      const glyph = document.createElement('div');
      glyph.className = 'topo-glyph';
      glyph.textContent = '▲';
      glyph.style.transform = orient.cssTransform;
      tile.appendChild(glyph);

      const label = document.createElement('div');
      label.className = 'topo-label';
      label.textContent = orient.label;
      if (!orient.identity) label.classList.add('transformed');
      tile.appendChild(label);

      overlay.appendChild(tile);
    }
  }

  return overlay;
}

function updateSeamLegend(): void {
  const legendEl = document.getElementById('seam-legend')!;
  const active = showBoundaries && currentTopology.tessellated;
  legendEl.classList.toggle('visible', active);
  if (!active) {
    legendEl.innerHTML = '';
    return;
  }

  const size = boardSize();
  const topo = currentTopology;
  const o00 = tileOrientation(topo, 0, 0, size);
  const seams = new Set<string>();
  let rotationAngle = '90';
  for (const neighbor of [
    tilesX > 1 ? tileOrientation(topo, 0, 1, size) : null,
    tilesY > 1 ? tileOrientation(topo, 1, 0, size) : null,
  ]) {
    if (!neighbor) continue;
    const type = seamType(o00, neighbor);
    seams.add(type);
    if (type === 'rotation' && neighbor.label === 'ROTATED 180') rotationAngle = '180';
  }

  const rows: [string, string][] = [];
  if (seams.has('mirror')) rows.push(['swatch-mirror', 'MIRROR EDGE: REFLECTS']);
  if (seams.has('rotation')) rows.push(['swatch-rotation', `ROTATION EDGE: TURNS ${rotationAngle}`]);
  if (seams.has('wrap')) rows.push(['swatch-wrap', 'WRAP EDGE: REPEATS']);
  if (topo.periodX === null || topo.periodY === null) rows.push(['swatch-wall', 'WALL: BOARD ENDS']);

  let reflectedSeen = false;
  for (let tileRow = 0; tileRow < tilesY && !reflectedSeen; tileRow++) {
    for (let tileCol = 0; tileCol < tilesX && !reflectedSeen; tileCol++) {
      reflectedSeen = tileOrientation(topo, tileRow, tileCol, size).reflected;
    }
  }
  if (reflectedSeen) rows.push(['swatch-hatch', 'REFLECTED COPY']);

  legendEl.innerHTML = rows
    .map(([cls, text]) => `<div class="legend-row"><span class="legend-swatch ${cls}"></span>${text}</div>`)
    .join('');
}

// ==================== PAN & SLIDE ====================
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function updateBoardPosition(): void {
  const boardEl = document.getElementById('board')!;
  const containerEl = document.getElementById('board-container')!;
  const board = boardPx();
  const tess = currentTopology.tessellated;
  const periodXPx = tess && currentTopology.periodX ? currentTopology.periodX * board : null;
  const periodYPx = tess && currentTopology.periodY ? currentTopology.periodY * board : null;
  const extentX = tilesX * board;
  const extentY = tilesY * board;
  const w = containerEl.clientWidth;
  const h = containerEl.clientHeight;

  let left: number;
  if (periodXPx) {
    left = ((panOffsetX % periodXPx) + periodXPx) % periodXPx - periodXPx;
  } else {
    left = w >= extentX ? Math.round((w - extentX) / 2) : clamp(panOffsetX, w - extentX, 0);
  }

  let top: number;
  if (periodYPx) {
    top = ((panOffsetY % periodYPx) + periodYPx) % periodYPx - periodYPx;
  } else {
    top = h >= extentY ? Math.round((h - extentY) / 2) : clamp(panOffsetY, h - extentY, 0);
  }

  lastLeft = left;
  lastTop = top;
  boardEl.style.transform = `translate3d(${left}px, ${top}px, 0)`;

  isPannable = tess || extentX > w || extentY > h;
  containerEl.classList.toggle('pannable', isPannable);
}

export function initPanControls(): void {
  const containerEl = document.getElementById('board-container')!;
  const DRAG_CLICK_THRESHOLD = 5;
  let isPanning = false;
  let dragDistance = 0;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartPanX = 0;
  let dragStartPanY = 0;

  containerEl.addEventListener('mousedown', (e) => {
    dragDistance = 0;
    if (!isPannable) return;
    if (currentGame === 'chess' && selectedSquare) return; // Lock board when piece is selected
    isPanning = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartPanX = panOffsetX;
    dragStartPanY = panOffsetY;
    e.preventDefault();
  });

  let panFrameId: number | null = null;
  document.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    dragDistance = Math.max(dragDistance, Math.abs(dx), Math.abs(dy));
    panOffsetX = dragStartPanX + dx;
    panOffsetY = dragStartPanY + dy;
    if (dragDistance > DRAG_CLICK_THRESHOLD) suppressHoverSync = true;
    if (panFrameId === null) {
      panFrameId = requestAnimationFrame(() => {
        panFrameId = null;
        updateBoardPosition();
      });
    }
  });

  document.addEventListener('mouseup', () => {
    isPanning = false;
    suppressHoverSync = false;
  });

  // A release at the end of a real drag must not count as a move: swallow the
  // click before it reaches the square/intersection underneath.
  containerEl.addEventListener('click', (e) => {
    if (dragDistance > DRAG_CLICK_THRESHOLD) {
      e.stopPropagation();
      e.preventDefault();
      dragDistance = 0;
    }
  }, { capture: true });

  let lastWheel = 0;
  containerEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const now = performance.now();
    if (now - lastWheel < 120) return;
    lastWheel = now;
    const rect = containerEl.getBoundingClientRect();
    zoomStep(e.deltaY < 0 ? 1 : -1, e.clientX - rect.left, e.clientY - rect.top);
  }, { passive: false });

  let resizeTimer: number | null = null;
  window.addEventListener('resize', () => {
    if (resizeTimer !== null) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => renderBoard(), 120);
  });

  applyCellVars();
  updateZoomLabel();
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

// ==================== STATUS & INFO PANEL ====================
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function updateStatus(): void {
  const statusEl = document.getElementById('status')!;

  if (currentGame === 'chess') {
    if (chessGameOver === 'draw') {
      statusEl.textContent = 'Stalemate - draw';
    } else if (chessGameOver) {
      statusEl.textContent = `Checkmate - ${capitalize(chessGameOver)} wins`;
    } else {
      const check = isInCheck(chessCurrentTurn) ? ' - check' : '';
      statusEl.textContent = `${capitalize(chessCurrentTurn)}'s turn${check}`;
    }
  } else {
    if (goGameOver) {
      const score = scoreGo();
      const result = score.winner === 'draw' ? 'Draw' : `${capitalize(score.winner)} wins`;
      statusEl.textContent = `Black ${score.blackTotal} : White ${score.whiteTotal} (komi ${KOMI}) - ${result}`;
    } else {
      statusEl.textContent = `${capitalize(goCurrentTurn)}'s turn - B: ${goCaptures.black} W: ${goCaptures.white}`;
    }
  }
}

export function updateModeDescription(): void {
  const descEl = document.getElementById('mode-description')!;
  const specEl = document.getElementById('mode-spec')!;
  const articleEl = document.getElementById('mode-article')!;
  const linksEl = document.getElementById('mode-links')!;

  descEl.textContent = currentGame === 'chess' ? currentTopology.chessDesc : currentTopology.goDesc;
  specEl.innerHTML = currentTopology.spec
    .map(line => `<div class="spec-line">${line}</div>`)
    .join('');
  articleEl.textContent = currentTopology.article;
  linksEl.innerHTML = currentTopology.links
    .map(link => `<div class="link-line"><a href="${link.url}" target="_blank" rel="noopener">${link.label}</a></div>`)
    .join('');
}
