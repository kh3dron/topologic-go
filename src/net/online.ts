// Online game controller. Reuses the offline rendering pipeline (render.ts +
// the view registry) but drives it from server state: loads the authoritative
// board, gates input to the local player's colour, submits moves optimistically
// through submit-move, and reconciles on Realtime updates.

import { Color } from '../engine/core';
import { GameType, setCurrentGame, setTopology } from '../state';
import { viewFor } from '../views';
import { renderBoard, updateStatus } from '../render';
import { currentUser } from './auth';
import { fetchGame, submitMove, subscribeGame, type GameRow } from './games';

export interface OnlineHandle {
  game: GameRow;
  myColor: Color | null;
  destroy(): void;
}

function ensureBanner(): HTMLElement {
  let el = document.getElementById('online-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'online-banner';
    const area = document.getElementById('game-area');
    area?.insertBefore(el, area.firstChild);
  }
  return el;
}

const turnColor = (g: GameRow): Color => (g.board_state as unknown as { turn: Color }).turn;

export async function enterOnlineGame(gameId: string): Promise<OnlineHandle> {
  const user = await currentUser();
  const game = await fetchGame(gameId);
  if (!game) throw new Error('Game not found.');

  const myId = user?.id ?? null;
  const myColor: Color | null =
    myId && game.white_player === myId ? 'white' :
    myId && game.black_player === myId ? 'black' : null;

  setCurrentGame(game.variant as GameType);
  if (game.topology) setTopology(game.topology);

  const view = viewFor(game.variant);
  const banner = ensureBanner();

  let serverPly = game.ply;
  let lastBoard: unknown = game.board_state;

  function submitLocalMove(move: unknown): void {
    const expected = serverPly; // the wrapper already applied this move optimistically
    submitMove(gameId, expected, move)
      .then((res) => { serverPly = res.game.ply; lastBoard = res.game.board_state; })
      .catch((err) => {
        // reject -> roll back to the last server-confirmed state
        view.loadState(lastBoard);
        renderBoard();
        updateStatus();
        banner.textContent = `Move rejected: ${err instanceof Error ? err.message : String(err)}`;
        banner.className = 'online-banner error';
      });
  }

  const gateFor = (g: GameRow) => ({
    engaged: true,
    lockColor: g.status === 'active' ? myColor : null, // only my colour, only while active
    onCommit: submitLocalMove,
  });

  function updateBanner(g: GameRow): void {
    if (g.status === 'waiting') {
      banner.textContent = myColor
        ? 'Waiting for an opponent to join — share this page’s link.'
        : 'This game is waiting for players.';
      banner.className = 'online-banner waiting';
    } else if (g.status === 'done') {
      const outcome = g.winner === null ? 'Draw.'
        : g.winner === myId ? 'You win.'
        : myColor ? 'You lose.' : 'Game over.';
      banner.textContent = `Game over — ${outcome}`;
      banner.className = 'online-banner done';
    } else {
      const label = myColor
        ? `You are ${myColor}. ${turnColor(g) === myColor ? 'Your move.' : 'Opponent’s move.'}`
        : `Spectating — ${turnColor(g)} to move.`;
      banner.textContent = label;
      banner.className = 'online-banner active';
    }
  }

  function applyServer(g: GameRow): void {
    serverPly = g.ply;
    lastBoard = g.board_state;
    view.loadState(g.board_state);
    view.setOnline(gateFor(g));
    renderBoard();
    updateStatus();
    updateBanner(g);
  }

  // initial paint
  applyServer(game);

  // Re-sync once the subscription is live, so we don't miss an update (e.g. the
  // opponent joining) that landed between the initial fetch and SUBSCRIBED.
  const channel = subscribeGame(gameId, applyServer, () => {
    fetchGame(gameId).then((g) => { if (g) applyServer(g); }).catch(() => {});
  });

  return {
    game,
    myColor,
    destroy() {
      view.setOnline({ engaged: false, lockColor: null, onCommit: () => {} });
      channel.unsubscribe();
      banner.remove();
    },
  };
}
