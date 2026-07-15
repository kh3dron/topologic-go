import { Topology } from '../topology';
import { PIECE_SYMBOLS } from '../chess';
import {
  hyperBoard, hyperSelected, hyperCurrentTurn, hyperGameOver,
  hyperLegalDestinations, hyperCheckedKingCell, isHyperInCheck,
  clickHyper, resetHyper, loadHyperState, setHyperOnline,
  hyperCells, hyperNeighbors, HYPER_BASE_BOUNDARY, HYPER_VIEW_HOME,
  HYPER_INRADIUS, HYPER_CIRCUMRADIUS, HYPER_CELL_COUNT,
  mobMul, mobInverse, mobApply, mobTranslation0, mobDistRatio,
} from '../hyperchess';
import type { Mob, C } from '../hyperchess';
import { Extent, GameView, InfoPanel, RenderDeps, capitalize } from './kit';

const HYPER_CELL = 28; // zoom unit: cellPx / HYPER_CELL scales the disk
const ORIGIN: C = { re: 0, im: 0 };
const CELL_HIT_RATIO = Math.tanh(HYPER_CIRCUMRADIUS / 2) * 1.02;
const MAX_PAN_RATIO = 0.99999; // ~ hyperbolic distance 12 from board centre
const DRAG_CLICK_THRESHOLD = 5;

const HYPER_INFO: InfoPanel = {
  description: 'Chess on the {4,6} tiling of the hyperbolic plane - square cells, six around every vertex - after Andrea Hawksley\'s construction. Queens face off 7 cells apart along a central geodesic. Drag to pan the Poincare disk.',
  article: 'The hyperbolic plane is not a quotient of the Euclidean plane, so this board sits outside the project() machinery entirely: it is a patch of the {4,6} tiling, rendered in the Poincare disk model. Straight lines survive (a rook still leaves through the edge opposite where it entered), and because six is even the checkerboard colouring survives too, so bishops keep their colour. But almost everything else bends: each back rank runs along its own geodesic, and geodesics through neighbouring cells of the spine diverge - the pawn line only shields the files nearest the queen, bishops start with open diagonals, and the outermost files are cramped against the board\'s equidistant side walls. The knight\'s two Euclidean paths (two-then-one and one-then-two) land on different cells here, giving it up to sixteen jumps. Exponential space means armies lose each other easily; the action funnels along the spine.',
  spec: [
    `BOARD: ${HYPER_CELL_COUNT} CELLS OF {4,6}`,
    'ROOK: 4 GEODESIC RAYS',
    'BISHOP: 8 DIAGONAL RAYS (VERTEX + COLOUR)',
    'KNIGHT: 16 JUMPS (2+1 AND 1+2 DIFFER)',
    'KING: 12 x ONE STEP',
    'PAWNS: HEADING PARALLEL-TRANSPORTS',
    'PROMOTE AT A WALL, NO CASTLING / EN PASSANT',
    'QUEENS 7 APART ON THE SPINE',
  ],
  links: [
    { label: 'Non-Euclidean Chess, Part 2 (Hawksley)', url: 'https://andreahawksley.com/non-euclidean-chess-part-2/' },
    { label: 'Hyperbolic geometry (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Hyperbolic_geometry' },
    { label: 'Poincare disk model (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Poincar%C3%A9_disk_model' },
  ],
};

// ==================== VIEW STATE ====================
// The view transform maps board coordinates to the displayed disk; panning
// composes hyperbolic translations onto it. Persists across re-renders.
function homeView(): Mob {
  return mobInverse(mobTranslation0(HYPER_VIEW_HOME));
}

let viewT: Mob = homeView();

// The live canvas of the latest render. Window-level drag listeners are
// installed once and operate on this handle (renderCustom replaces it).
interface CanvasHandle {
  canvas: HTMLCanvasElement;
  draw: () => void;
  toDisk: (e: MouseEvent) => C | null;
  deps: RenderDeps;
}
let current: CanvasHandle | null = null;
let listenersInstalled = false;
let dragging = false;
let dragMoved = 0;
let dragZ: C | null = null;

function hitCell(z: C): number | null {
  const w = mobApply(mobInverse(viewT), z);
  let best: number | null = null;
  let bestD = CELL_HIT_RATIO;
  for (const cell of hyperCells()) {
    const d = mobDistRatio(cell.center, w);
    if (d < bestD) {
      bestD = d;
      best = cell.id;
    }
  }
  return best;
}

function installListeners(): void {
  if (listenersInstalled) return;
  listenersInstalled = true;

  window.addEventListener('mousemove', (e) => {
    if (!current || !dragging) return;
    const z = current.toDisk(e);
    if (!z || !dragZ) return;
    dragMoved += Math.abs(e.movementX) + Math.abs(e.movementY);
    const t = mobMul(mobTranslation0(z), mobInverse(mobTranslation0(dragZ)));
    const next = mobMul(t, viewT);
    const centre = mobApply(mobInverse(next), ORIGIN);
    if (Math.hypot(centre.re, centre.im) < MAX_PAN_RATIO) {
      viewT = next;
      current.draw();
    }
    dragZ = z;
  });

  window.addEventListener('mouseup', (e) => {
    if (!current || !dragging) return;
    dragging = false;
    current.canvas.style.cursor = 'grab';
    if (dragMoved <= DRAG_CLICK_THRESHOLD) {
      const z = current.toDisk(e);
      const cell = z ? hitCell(z) : null;
      if (cell !== null) {
        clickHyper(cell);
        current.deps.refreshStatus();
        current.deps.rerender();
      }
    }
  });
}

export const hyperView: GameView = {
  id: 'hyperchess',
  name: 'Hyperbolic Chess',
  shortName: 'Hyper',
  family: 'custom',
  usesTopology: false,
  showsPassButton: false,
  cellBase: HYPER_CELL,
  size: 0,

  reset: () => {
    resetHyper();
    viewT = homeView();
  },
  loadState: (s) => loadHyperState(s),
  setOnline: (o) => setHyperOnline(o),

  selectionActive: () => hyperSelected !== null,

  status(): string {
    if (hyperGameOver === 'draw') return 'Stalemate';
    if (hyperGameOver) return `Checkmate - ${capitalize(hyperGameOver)} wins`;
    const check = isHyperInCheck(hyperCurrentTurn) ? ' - check' : '';
    return `${capitalize(hyperCurrentTurn)}'s turn${check}`;
  },

  infoPanel(_topo: Topology): InfoPanel {
    return HYPER_INFO;
  },

  // The board is a patch of the hyperbolic plane, so it renders on a canvas in
  // the Poincare disk model; dragging pans by hyperbolic translation.
  renderCustom(boardEl: HTMLElement, cellPx: number, deps: RenderDeps): Extent {
    const container = boardEl.parentElement as HTMLElement | null;
    const W = container?.clientWidth || 800;
    const H = container?.clientHeight || 600;
    const dpr = window.devicePixelRatio || 1;
    const diskR = (Math.min(W, H) / 2 - 12) * (cellPx / HYPER_CELL);
    const cx = W / 2;
    const cy = H / 2;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    canvas.className = 'hyper-canvas';
    const ctx = canvas.getContext('2d')!;

    const toScreen = (z: C): [number, number] => [cx + z.re * diskR, cy - z.im * diskR];
    const toDisk = (e: MouseEvent): C | null => {
      const rect = canvas.getBoundingClientRect();
      const z: C = { re: (e.clientX - rect.left - cx) / diskR, im: -(e.clientY - rect.top - cy) / diskR };
      return Math.hypot(z.re, z.im) < 0.999 ? z : null;
    };

    const draw = (): void => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // The horizon: everything inside is the (infinite) hyperbolic plane.
      ctx.beginPath();
      ctx.arc(cx, cy, diskR, 0, 2 * Math.PI);
      ctx.fillStyle = '#3a3a3e';
      ctx.fill();
      ctx.strokeStyle = '#565660';
      ctx.lineWidth = 1;
      ctx.stroke();

      const legal = hyperSelected !== null ? hyperLegalDestinations(hyperSelected) : null;
      const checked = hyperCheckedKingCell();

      for (const cell of hyperCells()) {
        const m = mobMul(viewT, cell.transform);
        const centre = mobApply(m, ORIGIN);
        // Conformal factor: hyperbolic length L at z spans ~ L*(1-|z|^2)/2
        // Euclidean units, so this is the cell's apparent inradius in px.
        const apparent = HYPER_INRADIUS * ((1 - centre.re * centre.re - centre.im * centre.im) / 2) * diskR;
        if (apparent < 0.75) continue;

        const pts = HYPER_BASE_BOUNDARY.map(p => toScreen(mobApply(m, p)));
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();

        const piece = hyperBoard.get(cell.id);
        if (cell.id === hyperSelected) {
          ctx.fillStyle = legal && legal.size === 0 ? '#a35c5c' : '#7a9a7a';
        } else if (cell.id === checked) {
          ctx.fillStyle = '#a35c5c';
        } else {
          ctx.fillStyle = cell.light ? '#e8e8e8' : '#888';
        }
        ctx.fill();
        if (legal && legal.has(cell.id)) {
          ctx.fillStyle = piece ? 'rgba(176, 112, 112, 0.55)' : 'rgba(201, 201, 122, 0.5)';
          ctx.fill();
        }
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.lineWidth = Math.min(1, Math.max(0.3, apparent * 0.02));
        ctx.stroke();

        // Wall edges: the board ends here (thick ink, like the classic border).
        const neighbors = hyperNeighbors(cell.id);
        for (let e = 0; e < 4; e++) {
          if (neighbors[e] !== null) continue;
          ctx.beginPath();
          ctx.moveTo(pts[4 * e][0], pts[4 * e][1]);
          for (let i = 1; i <= 4; i++) {
            const p = pts[(4 * e + i) % pts.length];
            ctx.lineTo(p[0], p[1]);
          }
          ctx.strokeStyle = '#17171a';
          ctx.lineWidth = Math.max(1, apparent * 0.14);
          ctx.stroke();
        }

        if (legal && legal.has(cell.id) && !piece && apparent > 3) {
          const [px, py] = toScreen(centre);
          ctx.beginPath();
          ctx.arc(px, py, apparent * 0.28, 0, 2 * Math.PI);
          ctx.fillStyle = 'rgba(30, 30, 30, 0.55)';
          ctx.fill();
        }

        if (piece && apparent > 4) {
          const [px, py] = toScreen(centre);
          const fontPx = apparent * 1.5;
          ctx.font = `${fontPx}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const glyph = PIECE_SYMBOLS[piece.color][piece.type];
          if (piece.color === 'white') {
            ctx.strokeStyle = '#000';
            ctx.lineWidth = Math.max(0.5, fontPx / 16);
            ctx.strokeText(glyph, px, py);
            ctx.fillStyle = '#fff';
          } else {
            ctx.fillStyle = '#000';
          }
          ctx.fillText(glyph, px, py);
        }
      }
    };

    draw();

    canvas.style.cursor = 'grab';
    canvas.addEventListener('mousedown', (e) => {
      dragging = true;
      dragMoved = 0;
      dragZ = toDisk(e);
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
    });
    canvas.addEventListener('mousemove', (e) => {
      if (dragging) return;
      const z = toDisk(e);
      const cell = z ? hitCell(z) : null;
      const piece = cell !== null ? hyperBoard.get(cell) : undefined;
      const legal = hyperSelected !== null ? hyperLegalDestinations(hyperSelected) : null;
      const actionable = cell !== null &&
        ((piece && piece.color === hyperCurrentTurn && !hyperGameOver) || (legal?.has(cell) ?? false));
      canvas.style.cursor = actionable ? 'pointer' : 'grab';
    });

    current = { canvas, draw, toDisk, deps };
    installListeners();

    boardEl.style.display = 'block';
    boardEl.style.width = `${W}px`;
    boardEl.style.height = `${H}px`;
    boardEl.appendChild(canvas);

    return { w: W, h: H };
  },
};
