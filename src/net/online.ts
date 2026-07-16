// Online game controller. Reuses the offline rendering pipeline (render.ts +
// the view registry) but drives it from server state: loads the authoritative
// board, gates input to the local player's colour, submits moves optimistically
// through submit-move, and reconciles on Realtime updates.

import { Color } from '../engine/core';
import { GameType, setCurrentGame, setTopology } from '../state';
import { viewFor } from '../views';
import { renderBoard, updateStatus } from '../render';
import { playStoneSound } from '../sound';
import { currentUser } from './auth';
import { fetchGame, joinGame, submitMove, subscribeGame, type GameRow } from './games';

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
  // Recomputed on every server update: a viewer can claim the open seat from
  // the banner (join-by-link), which flips them from spectator to player.
  const seatOf = (g: GameRow): Color | null =>
    myId && g.white_player === myId ? 'white' :
    myId && g.black_player === myId ? 'black' : null;
  let myColor: Color | null = seatOf(game);

  setCurrentGame(game.variant as GameType);
  if (game.topology) setTopology(game.topology);

  const view = viewFor(game.variant);
  const banner = ensureBanner();

  let serverPly = game.ply;
  let lastBoard: unknown = game.board_state;

  // Tab-title indicator: prefix the title while it's the local player's move,
  // so a backgrounded tab shows the game is waiting on them.
  const baseTitle = document.title;
  function updateTitle(g: GameRow): void {
    const myMove = g.status === 'active' && myColor !== null && turnColor(g) === myColor;
    document.title = myMove ? `● Your move — ${baseTitle}` : baseTitle;
  }

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

  function bannerButton(label: string, run: (btn: HTMLButtonElement) => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'lobby-link';
    btn.textContent = label;
    btn.addEventListener('click', () => run(btn));
    return btn;
  }

  function updateBanner(g: GameRow): void {
    banner.replaceChildren();
    if (g.status === 'waiting') {
      banner.className = 'online-banner waiting';
      if (myColor) {
        banner.append(g.invited_player
          ? 'Challenge sent — waiting for your friend to accept.'
          : 'Waiting for an opponent — share this page’s link.');
        banner.appendChild(bannerButton('Copy link', (btn) => {
          navigator.clipboard.writeText(location.href)
            .then(() => { btn.textContent = 'Copied'; })
            .catch(() => { btn.textContent = location.href; });
        }));
      } else if (g.invited_player && g.invited_player !== myId) {
        banner.append('This game is a private challenge, waiting for its player.');
      } else if (myId) {
        banner.append('This game is waiting for an opponent.');
        banner.appendChild(bannerButton('Join this game', (btn) => {
          btn.disabled = true;
          joinGame(g.id)
            .then((res) => applyServer(res.game))
            .catch((err) => {
              btn.disabled = false;
              banner.append(` ${err instanceof Error ? err.message : String(err)}`);
            });
        }));
      } else {
        banner.append('This game is waiting for an opponent. ');
        const a = document.createElement('a');
        a.href = `./game.html?join=${g.id}`;
        a.textContent = 'Sign in to join';
        banner.appendChild(a);
      }
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
    const prevPly = serverPly;
    serverPly = g.ply;
    lastBoard = g.board_state;
    myColor = seatOf(g);
    // Audible cue for the opponent's stone landing: a new ply that leaves the
    // turn with us must be theirs (our own placement already clicked locally
    // in placeGoStone, and its Realtime echo leaves the turn with them).
    // Passes carry no stone (lastMove null), so they stay silent.
    if (g.variant === 'go' && g.ply > prevPly && myColor !== null && turnColor(g) === myColor) {
      const snap = g.board_state as { lastMove?: unknown } | null;
      if (snap?.lastMove) playStoneSound();
    }
    view.loadState(g.board_state);
    view.setOnline(gateFor(g));
    renderBoard();
    updateStatus();
    updateBanner(g);
    updateTitle(g);
    // Pass is a Go move; only a seated player gets the button (seat can be
    // claimed after load, so this tracks every update).
    document.getElementById('pass-btn')
      ?.classList.toggle('visible', g.variant === 'go' && myColor !== null);
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
      document.title = baseTitle;
    },
  };
}
