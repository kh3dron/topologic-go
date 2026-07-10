import { GameMode, GameType, currentGame, setCurrentGame, setGameMode } from './state';
import { resetChess } from './chess';
import { passGoTurn, resetGo } from './go';
import {
  initPanControls, renderBoard, requestPanReset, setShowBoundaries, startSliding, stopSliding,
  updateModeDescription, updateStatus
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

function switchMode(mode: GameMode): void {
  setGameMode(mode);

  document.getElementById('mode-classic')!.classList.toggle('active', mode === 'classic');
  document.getElementById('mode-rollover')!.classList.toggle('active', mode === 'rollover');
  document.getElementById('mode-mirror')!.classList.toggle('active', mode === 'mirror');

  updateModeDescription();

  const slideControl = document.getElementById('slide-control')!;
  const slideCheckbox = document.getElementById('slide-board') as HTMLInputElement;
  const boundaryControl = document.getElementById('boundary-control')!;
  if (mode === 'rollover' || mode === 'mirror') {
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

document.getElementById('reset')!.addEventListener('click', init);
document.getElementById('game-chess')!.addEventListener('click', () => switchGame('chess'));
document.getElementById('game-go')!.addEventListener('click', () => switchGame('go'));
document.getElementById('mode-classic')!.addEventListener('click', () => switchMode('classic'));
document.getElementById('mode-rollover')!.addEventListener('click', () => switchMode('rollover'));
document.getElementById('mode-mirror')!.addEventListener('click', () => switchMode('mirror'));
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

initPanControls();
init();
