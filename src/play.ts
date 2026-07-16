import { currentGame, currentTopology, setCurrentGame, setTopology } from './state';
import { TOPOLOGY_MAP } from './topology';
import { viewFor } from './views';
import { GO_SIZE, passGoTurn, setGoSize } from './go';
import { clickHex, hexBoard, hexCurrentTurn, hexGameOver } from './hexchess';
import { clickHyper, hyperBoard, hyperCurrentTurn, hyperGameOver, HYPER_CELL_COUNT } from './hyperchess';
import { snakeBodySet, snakeHeadKey, snakeFood, snakeScore, snakeStatus, steerSnake, tickSnake } from './snake';
import { readVariantParams, variantSearch } from './routes';
import {
  fitZoomToContainer, initPanControls, renderBoard, requestPanReset, resetZoom, setShowBoundaries,
  startSliding, stopSliding, updateModeDescription, updateStatus, zoomStep
} from './render';
import { mountVersionBadge } from './version';
import { initSound } from './sound';

const onlineId = new URLSearchParams(window.location.search).get('online');

// Go board size for local games; the sidebar picker changes it and starts a
// new game (a placed board can't be resized in place).
let goBoardSize = GO_SIZE;

mountVersionBadge();
initSound();

// ==================== CONTROLS COMMON TO BOTH MODES ====================
document.getElementById('pass-btn')!.addEventListener('click', () => {
  passGoTurn();
  updateStatus();
  renderBoard();
});

document.getElementById('slide-board')!.addEventListener('change', (e) => {
  if ((e.target as HTMLInputElement).checked) startSliding();
  else stopSliding();
});

document.getElementById('show-boundaries')!.addEventListener('change', (e) => {
  setShowBoundaries((e.target as HTMLInputElement).checked);
});

document.getElementById('zoom-in')!.addEventListener('click', () => zoomStep(1));
document.getElementById('zoom-out')!.addEventListener('click', () => zoomStep(-1));
document.getElementById('zoom-level')!.addEventListener('click', resetZoom);

// Debug hook for automated browser tests (both modes).
(window as unknown as Record<string, unknown>).__topo = {
  project: (r: number, c: number, size: number) => currentTopology.project(r, c, size),
};

if (onlineId) {
  bootOnline(onlineId);
} else {
  bootOffline();
}

// ==================== ONLINE MODE ====================
async function bootOnline(id: string): Promise<void> {
  // Hide the offline chrome: game/topology are fixed by the game row. The
  // view-only toggles (boundaries, animate) stay - syncViewControls() shows
  // them once the game row has set game + topology.
  document.getElementById('reset')!.style.display = 'none';

  initPanControls();

  try {
    // Lazy-loaded so the Supabase SDK never enters the offline play bundle.
    const { enterOnlineGame } = await import('./net/online');
    const handle = await enterOnlineGame(id);
    const view = viewFor(handle.game.variant);
    document.getElementById('game-title')!.textContent = view.name;
    // Pass-button visibility is owned by online.ts (the seat can be claimed
    // from the banner after load).
    syncViewControls();
    fitZoomToContainer();
    requestPanReset();
    renderBoard();
    updateModeDescription();
  } catch (err) {
    const status = document.getElementById('status')!;
    status.textContent = err instanceof Error ? err.message : String(err);
    const banner = document.createElement('div');
    banner.id = 'online-banner';
    banner.className = 'online-banner error';
    banner.innerHTML = 'Could not load this game. <a href="./index.html">Back to catalog</a>.';
    document.getElementById('game-area')!.prepend(banner);
  }
}

// ==================== OFFLINE MODE (local hotseat) ====================
function bootOffline(): void {
  const params = readVariantParams();
  setCurrentGame(params.game);
  if (TOPOLOGY_MAP.has(params.topoId)) setTopology(params.topoId);
  if (params.size) {
    goBoardSize = params.size;
    setGoSize(goBoardSize);
  }

  document.getElementById('reset')!.addEventListener('click', init);

  for (const btn of document.querySelectorAll<HTMLButtonElement>('.size-btn')) {
    btn.addEventListener('click', () => {
      const size = Number(btn.dataset.size);
      if (size === goBoardSize) return;
      goBoardSize = size;
      setGoSize(size);
      syncSizeButtons();
      updateUrl();
      init();
    });
  }

  syncChrome();
  initPanControls();
  fitZoomToContainer();
  updateModeDescription();
  updateUrl();
  init();

  // Hex chess debug hook: drive moves and read state from headless tests.
  (window as unknown as Record<string, unknown>).__hex = {
    click: (q: number, r: number) => clickHex(q, r),
    board: () => Object.fromEntries(hexBoard),
    turn: () => hexCurrentTurn,
    over: () => hexGameOver,
  };

  // Hyperbolic chess debug hook: cells are engine ids (the canvas has no DOM cells).
  (window as unknown as Record<string, unknown>).__hyper = {
    click: (cell: number) => clickHyper(cell),
    board: () => Object.fromEntries(hyperBoard),
    turn: () => hyperCurrentTurn,
    over: () => hyperGameOver,
    cellCount: () => HYPER_CELL_COUNT,
  };

  // Snake debug hook: read state and drive the sim deterministically in tests.
  (window as unknown as Record<string, unknown>).__snake = {
    status: () => snakeStatus,
    score: () => snakeScore,
    head: () => snakeHeadKey,
    body: () => [...snakeBodySet],
    food: () => snakeFood,
    steer: (dr: number, dc: number) => steerSnake([dr, dc]),
    tick: () => tickSnake(),
  };
}

function init(): void {
  viewFor(currentGame).reset();
  requestPanReset();
  updateStatus();
  renderBoard();
}

// Reflect currentGame + currentTopology in all the sidebar chrome: active
// buttons, title, control visibility. Runs at boot and after every switch, so
// deep-linked variants (?g=&t=) land with the right UI selected.
function syncChrome(): void {
  const view = viewFor(currentGame);

  document.getElementById('game-title')!.textContent = view.name;
  document.getElementById('pass-btn')!.classList.toggle('visible', view.showsPassButton);
  document.getElementById('size-control')!.classList.toggle('visible', currentGame === 'go');
  syncSizeButtons();

  syncViewControls();
}

function syncSizeButtons(): void {
  for (const btn of document.querySelectorAll<HTMLButtonElement>('.size-btn')) {
    btn.classList.toggle('active', Number(btn.dataset.size) === goBoardSize);
  }
}

// The boundaries toggle applies to every topology game (walls show on classic
// too); the slide animation only makes sense on tessellated topologies.
function syncViewControls(): void {
  const view = viewFor(currentGame);
  const topo = view.usesTopology;
  const tess = topo && currentTopology.tessellated;
  const slideControl = document.getElementById('slide-control')!;
  const slideCheckbox = document.getElementById('slide-board') as HTMLInputElement;
  document.getElementById('boundary-control')!.classList.toggle('visible', topo);
  slideControl.classList.toggle('visible', tess);
  if (!tess) {
    slideCheckbox.checked = false;
    stopSliding();
  }
}

function updateUrl(): void {
  const size = currentGame === 'go' && goBoardSize !== GO_SIZE ? goBoardSize : null;
  history.replaceState(null, '', variantSearch(currentGame, currentTopology.id, size));
}

