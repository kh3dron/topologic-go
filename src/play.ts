import { currentGame, currentTopology, setCurrentGame, setTopology } from './state';
import { TOPOLOGY_MAP } from './topology';
import { viewFor } from './views';
import { passGoTurn } from './go';
import { clickHex, hexBoard, hexCurrentTurn, hexGameOver } from './hexchess';
import { readVariantParams, variantSearch } from './routes';
import {
  initPanControls, renderBoard, requestPanReset, resetZoom, setShowBoundaries, startSliding,
  stopSliding, updateModeDescription, updateStatus, zoomStep
} from './render';
import { mountVersionBadge } from './version';

const onlineId = new URLSearchParams(window.location.search).get('online');

mountVersionBadge();

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
  // Hide the offline chrome: game/topology are fixed by the game row.
  for (const sel of ['#reset', '#slide-control', '#boundary-control']) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) el.style.display = 'none';
  }

  initPanControls();

  try {
    // Lazy-loaded so the Supabase SDK never enters the offline play bundle.
    const { enterOnlineGame } = await import('./net/online');
    const handle = await enterOnlineGame(id);
    const view = viewFor(handle.game.variant);
    document.getElementById('game-title')!.textContent = view.name;
    // Pass is a Go move; show it only to a seated player.
    document.getElementById('pass-btn')!.classList.toggle('visible', view.id === 'go' && handle.myColor !== null);
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

  document.getElementById('reset')!.addEventListener('click', init);

  syncChrome();
  initPanControls();
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

  const topo = view.usesTopology;
  const tess = topo && currentTopology.tessellated;
  const slideControl = document.getElementById('slide-control')!;
  const slideCheckbox = document.getElementById('slide-board') as HTMLInputElement;
  const boundaryControl = document.getElementById('boundary-control')!;
  slideControl.classList.toggle('visible', tess);
  boundaryControl.classList.toggle('visible', tess);
  if (!tess) {
    slideCheckbox.checked = false;
    stopSliding();
  }
}

function updateUrl(): void {
  history.replaceState(null, '', variantSearch(currentGame, currentTopology.id));
}

