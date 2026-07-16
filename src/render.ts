import { currentGame, currentTopology } from './state';
import { SEAM_SCHEME_COLORS, SeamColoring, seamColor, seamColoring, tileOrientation } from './topology';
import { RenderDeps, VIEWS, viewFor } from './views';

const MAX_ARROWS_PER_EDGE = 8;

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

// On-screen pixel size of a custom-rendered board (hex) from the last render
let customExtentW = 0;
let customExtentH = 0;

// True while a real drag is in progress; gates hover-sync without touching
// the DOM (any style flip scoped to the whole board recalcs every cell).
let suppressHoverSync = false;

let isSliding = false;
let slideAnimationId: number | null = null;
const SLIDE_SPEED_X = 0.3;
const SLIDE_SPEED_Y = 0.2;

let showBoundaries = false;

// Handed to view methods so cell/board renderers can trigger re-render + read
// live shell state without importing render.ts (keeps render -> views one-way).
const deps: RenderDeps = {
  rerender: () => renderBoard(),
  refreshStatus: () => updateStatus(),
  tessellated: () => currentTopology.tessellated,
  hoverSuppressed: () => suppressHoverSync,
};

function currentView() {
  return viewFor(currentGame);
}

// True when the current game renders through the shared tessellated CSS-grid
// path (topology overlay + pan apply); false for custom-render games (hex).
function isGrid(): boolean {
  return currentView().family === 'square-grid';
}

function boardSize(): number {
  return currentView().size;
}

function zoomedCell(base: number): number {
  return Math.max(8, Math.round(base * ZOOM_LEVELS[zoomIndex]));
}

function cellPx(): number {
  return zoomedCell(currentView().cellBase);
}

function boardPx(): number {
  return boardSize() * cellPx();
}

// On-screen board size (width, height). Custom games report a measured extent;
// square games are the tiled board. Used by pan/zoom so all games share one
// placement path.
function boardExtent(): [number, number] {
  if (!isGrid()) return [customExtentW, customExtentH];
  const b = boardPx();
  return [tilesX * b, tilesY * b];
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
  // Each square-grid game derives its CSS sizing from a --<id>-cell custom
  // property (e.g. --chess-cell, --go-cell), pushed here so CSS calc() stays
  // in sync with the zoomed pixel size.
  for (const view of VIEWS.values()) {
    if (view.family === 'square-grid') {
      rootStyle.setProperty(`--${view.id}-cell`, `${zoomedCell(view.cellBase)}px`);
    }
  }
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
  const oldCell = cellPx();

  zoomIndex = next;
  applyCellVars();

  // Keep the board point under the anchor fixed (zoom scales cells uniformly)
  const ratio = cellPx() / oldCell;
  panOffsetX = Math.round(ax - (ax - lastLeft) * ratio);
  panOffsetY = Math.round(ay - (ay - lastTop) * ratio);

  updateZoomLabel();
  renderBoard();
}

export function resetZoom(): void {
  zoomStep(DEFAULT_ZOOM_INDEX - zoomIndex);
}

// Shrink the initial zoom until the whole board fits the container - never
// grows it. Phones land with the full board visible instead of a cropped
// corner. Tessellated boards are unbounded, so they keep the default and pan.
export function fitZoomToContainer(): void {
  if (!isGrid() || currentTopology.tessellated) return;
  const containerEl = document.getElementById('board-container')!;
  const fit = Math.min(containerEl.clientWidth, containerEl.clientHeight);
  if (fit === 0) return;
  const base = boardSize() * currentView().cellBase;
  while (zoomIndex > 0 && base * ZOOM_LEVELS[zoomIndex] > fit) zoomIndex--;
  applyCellVars();
  updateZoomLabel();
}

// ==================== BOARD RENDERING ====================
export function renderBoard(): void {
  const boardEl = document.getElementById('board')!;
  const containerEl = document.getElementById('board-container')!;
  const view = currentView();

  boardEl.innerHTML = '';
  boardEl.style.width = '';
  boardEl.style.height = '';
  boardEl.style.display = '';
  boardEl.className = `${view.id}-board`;

  if (view.family === 'custom') {
    tilesX = 1;
    tilesY = 1;
    const ext = view.renderCustom!(boardEl, cellPx(), deps);
    customExtentW = ext.w;
    customExtentH = ext.h;
  } else {
    view.prepareRender?.();

    if (currentTopology.tessellated) {
      renderTessellated(boardEl, containerEl);
    } else {
      tilesX = 1;
      tilesY = 1;
      boardEl.style.gridTemplateColumns = `repeat(${boardSize()}, ${cellPx()}px)`;
      boardEl.style.gridTemplateRows = `repeat(${boardSize()}, ${cellPx()}px)`;
      renderPlaneCells(boardEl, 1, 1);
    }

    // On non-tessellated boards the overlay is just the wall border.
    if (showBoundaries) {
      boardEl.appendChild(createTopologyOverlay());
    }
  }

  if (shouldResetPanPosition) {
    const [ex, ey] = boardExtent();
    panOffsetX = Math.round((containerEl.clientWidth - ex) / 2);
    panOffsetY = Math.round((containerEl.clientHeight - ey) / 2);
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
}

// Renders every plane cell of the (tx x ty)-board region through project(),
// delegating each cell's DOM to the active view. Works identically for the
// single classic board (1x1, where project is the identity on the board and
// null outside).
function renderPlaneCells(boardEl: HTMLElement, tx: number, ty: number): void {
  const size = boardSize();
  const view = currentView();
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
      boardEl.appendChild(view.createCell!(row, col, {
        light: (R + C) % 2 === 0,
        walls: {
          top: !currentTopology.project(R - 1, C, size),
          bottom: !currentTopology.project(R + 1, C, size),
          left: !currentTopology.project(R, C - 1, size),
          right: !currentTopology.project(R, C + 1, size),
        },
      }, deps));
    }
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
  const coloring = seamColoring(topo, size);
  const cell = cellPx();

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

      // Orientation glyph + label identify tile copies; a lone non-tessellated
      // board has none, so its overlay is just the wall border.
      if (topo.tessellated) {
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
      }

      appendSeamArrows(tile, tileRow, tileCol, size, cell, coloring);

      overlay.appendChild(tile);
    }
  }

  return overlay;
}

// Evenly-spaced cell indices along an edge, capped so large boards (Go) don't
// draw a dense wall of arrows. The set is symmetric under i -> size-1-i, so
// flipped gluings still land arrow-on-arrow.
function edgeSampleIndices(size: number): number[] {
  if (size <= MAX_ARROWS_PER_EDGE) return Array.from({ length: size }, (_, i) => i);
  const out = new Set<number>();
  for (let k = 0; k < MAX_ARROWS_PER_EDGE; k++) {
    out.add(Math.round((k * (size - 1)) / (MAX_ARROWS_PER_EDGE - 1)));
  }
  return [...out];
}

// Inward/outward glyph per edge: `onto` (entry) points into the board, its
// partner (exit) points off. Both sides of a gluing then read as one flow
// direction (e.g. wrap: onto the left, off the right).
const EDGE_GLYPH: Record<'left' | 'right' | 'top' | 'bottom', { on: string; off: string }> = {
  left: { on: '▶', off: '◀' },
  right: { on: '◀', off: '▶' },
  top: { on: '▼', off: '▲' },
  bottom: { on: '▲', off: '▼' },
};

// Numbered gradient arrows along each non-wall edge of one board copy. Color,
// number and direction all come from the seam's canonical gluing key, so glued
// cells (even across a flip or rotation) share a color + number and point as a
// single flow — the wraparound reads at a glance.
function appendSeamArrows(
  tile: HTMLElement,
  tileRow: number,
  tileCol: number,
  size: number,
  cell: number,
  coloring: SeamColoring,
): void {
  const board = size * cell;
  const arrowPx = Math.max(9, Math.round(cell * 0.4));
  const inset = Math.round(arrowPx * 0.72);
  const indices = edgeSampleIndices(size);
  const baseR = tileRow * size;
  const baseC = tileCol * size;

  for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
    for (const i of indices) {
      // Corners belong to two glued edges; let the side edges own them (skip the
      // top/bottom corner arrow) so the numbers don't pile up. Only when the
      // sides actually wrap - otherwise (corridor etc.) keep the corner arrow.
      if ((edge === 'top' || edge === 'bottom') && (i === 0 || i === size - 1) && currentTopology.periodX !== null) continue;

      let inR: number, inC: number, outR: number, outC: number, x: number, y: number;
      if (edge === 'left') {
        inR = baseR + i; inC = baseC; outR = inR; outC = baseC - 1;
        x = inset; y = (i + 0.5) * cell;
      } else if (edge === 'right') {
        inR = baseR + i; inC = baseC + size - 1; outR = inR; outC = baseC + size;
        x = board - inset; y = (i + 0.5) * cell;
      } else if (edge === 'top') {
        inR = baseR; inC = baseC + i; outR = baseR - 1; outC = inC;
        x = (i + 0.5) * cell; y = inset;
      } else {
        inR = baseR + size - 1; inC = baseC + i; outR = baseR + size; outC = inC;
        x = (i + 0.5) * cell; y = board - inset;
      }
      const col = coloring.lookup(
        currentTopology.project(inR, inC, size),
        currentTopology.project(outR, outC, size),
      );
      if (!col) continue;

      const el = document.createElement('div');
      el.className = `seam-arrow sa-${edge}`;
      el.style.color = seamColor(col.scheme, col.t);
      el.style.fontSize = `${arrowPx}px`;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;

      const glyph = document.createElement('span');
      glyph.className = 'sa-glyph';
      glyph.textContent = col.onto ? EDGE_GLYPH[edge].on : EDGE_GLYPH[edge].off;
      const num = document.createElement('span');
      num.className = 'sa-num';
      num.textContent = String(col.label);
      el.append(glyph, num);
      tile.appendChild(el);
    }
  }
}

function updateSeamLegend(): void {
  const legendEl = document.getElementById('seam-legend')!;
  const active = showBoundaries && currentTopology.tessellated && isGrid();
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

  const coloring = seamColoring(topo, size);
  const gradientRows: string[] = [];
  for (let s = 0; s < coloring.schemeCount; s++) {
    const [c0, c1] = SEAM_SCHEME_COLORS[s % SEAM_SCHEME_COLORS.length];
    const text = coloring.schemeCount > 1 ? `GLUED EDGE PAIR ${s + 1}` : 'GLUED EDGES';
    gradientRows.push(
      `<div class="legend-row"><span class="legend-swatch swatch-gradient" style="background:linear-gradient(90deg, ${c0}, ${c1})"></span>${text}</div>`,
    );
  }
  if (gradientRows.length) {
    gradientRows.push('<div class="legend-note">ARROWS: MATCHING COLOR = GLUED CELLS</div>');
  }

  legendEl.innerHTML =
    rows
      .map(([cls, text]) => `<div class="legend-row"><span class="legend-swatch ${cls}"></span>${text}</div>`)
      .join('') + gradientRows.join('');
}

// ==================== PAN & SLIDE ====================
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function updateBoardPosition(): void {
  const boardEl = document.getElementById('board')!;
  const containerEl = document.getElementById('board-container')!;
  const tess = currentTopology.tessellated && isGrid();
  const board = boardPx();
  const periodXPx = tess && currentTopology.periodX ? currentTopology.periodX * board : null;
  const periodYPx = tess && currentTopology.periodY ? currentTopology.periodY * board : null;
  const [extentX, extentY] = boardExtent();
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

  // Pointer events cover mouse and touch with one path; #board-container sets
  // touch-action: none so the browser hands us the gesture instead of
  // scrolling. Taps still arrive as plain clicks on the cells.
  containerEl.addEventListener('pointerdown', (e) => {
    dragDistance = 0;
    if (!isPannable) return;
    // Lock the board while a piece/cell is selected so a drag doesn't misfire.
    if (currentView().selectionActive?.()) return;
    isPanning = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartPanX = panOffsetX;
    dragStartPanY = panOffsetY;
    e.preventDefault();
  });

  let panFrameId: number | null = null;
  document.addEventListener('pointermove', (e) => {
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

  const endPan = () => {
    isPanning = false;
    suppressHoverSync = false;
  };
  document.addEventListener('pointerup', endPan);
  document.addEventListener('pointercancel', endPan);

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
export function updateStatus(): void {
  document.getElementById('status')!.textContent = currentView().status();
}

export function updateModeDescription(): void {
  const descEl = document.getElementById('mode-description')!;
  const specEl = document.getElementById('mode-spec')!;
  const articleEl = document.getElementById('mode-article')!;
  const linksEl = document.getElementById('mode-links')!;

  const info = currentView().infoPanel(currentTopology);
  descEl.textContent = info.description;
  articleEl.textContent = info.article;
  specEl.innerHTML = info.spec
    .map(line => `<div class="spec-line">${line}</div>`)
    .join('');
  linksEl.innerHTML = info.links
    .map(link => `<div class="link-line"><a href="${link.url}" target="_blank" rel="noopener">${link.label}</a></div>`)
    .join('');
}
