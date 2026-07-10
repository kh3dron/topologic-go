import { GameType, currentGame, currentTopology, setCurrentGame, setTopology } from './state';
import { TOPOLOGIES } from './topology';
import { resetChess } from './chess';
import { passGoTurn, resetGo } from './go';
import {
  initPanControls, renderBoard, requestPanReset, resetZoom, setShowBoundaries, startSliding,
  stopSliding, updateModeDescription, updateStatus, zoomStep
} from './render';

function init(): void {
  if (currentGame === 'chess') {
    resetChess();
  } else {
    resetGo();
  }
  requestPanReset();
  updateStatus();
  renderBoard();
}

function switchGame(game: GameType): void {
  if (game === currentGame) return;

  setCurrentGame(game);

  document.getElementById('game-chess')!.classList.toggle('active', game === 'chess');
  document.getElementById('game-go')!.classList.toggle('active', game === 'go');

  document.getElementById('game-title')!.textContent = game === 'chess' ? 'Chess' : 'Go';

  document.getElementById('pass-btn')!.classList.toggle('visible', game === 'go');

  updateModeDescription();
  init();
}

function switchMode(id: string): void {
  setTopology(id);

  for (const topo of TOPOLOGIES) {
    document.getElementById(`mode-${topo.id}`)!.classList.toggle('active', topo.id === id);
  }

  updateModeDescription();

  const slideControl = document.getElementById('slide-control')!;
  const slideCheckbox = document.getElementById('slide-board') as HTMLInputElement;
  const boundaryControl = document.getElementById('boundary-control')!;
  if (currentTopology.tessellated) {
    slideControl.classList.add('visible');
    boundaryControl.classList.add('visible');
  } else {
    slideControl.classList.remove('visible');
    boundaryControl.classList.remove('visible');
    slideCheckbox.checked = false;
    stopSliding();
  }

  init();
}

// Mode buttons are generated from the topology registry: adding an entry to
// TOPOLOGIES is all it takes to ship a new game variant.
function buildModeButtons(): void {
  const selector = document.getElementById('mode-selector')!;
  for (const topo of TOPOLOGIES) {
    const btn = document.createElement('button');
    btn.id = `mode-${topo.id}`;
    btn.className = 'mode-btn';
    btn.textContent = topo.name;
    if (topo.id === currentTopology.id) btn.classList.add('active');
    btn.addEventListener('click', () => switchMode(topo.id));
    selector.appendChild(btn);
  }
}

document.getElementById('reset')!.addEventListener('click', init);
document.getElementById('game-chess')!.addEventListener('click', () => switchGame('chess'));
document.getElementById('game-go')!.addEventListener('click', () => switchGame('go'));
document.getElementById('pass-btn')!.addEventListener('click', () => {
  passGoTurn();
  updateStatus();
  renderBoard();
});

document.getElementById('slide-board')!.addEventListener('change', (e) => {
  const checkbox = e.target as HTMLInputElement;
  if (checkbox.checked) {
    startSliding();
  } else {
    stopSliding();
  }
});

document.getElementById('show-boundaries')!.addEventListener('change', (e) => {
  setShowBoundaries((e.target as HTMLInputElement).checked);
});

document.getElementById('zoom-in')!.addEventListener('click', () => zoomStep(1));
document.getElementById('zoom-out')!.addEventListener('click', () => zoomStep(-1));
document.getElementById('zoom-level')!.addEventListener('click', resetZoom);

buildModeButtons();
initPanControls();
updateModeDescription();
init();

// Debug hook for automated browser tests
(window as unknown as Record<string, unknown>).__topo = {
  project: (r: number, c: number, size: number) => currentTopology.project(r, c, size),
};
