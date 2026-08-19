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
import { fetchGame, fetchMoves, gameAction, joinGame, submitMove, subscribeGame, type GameAction, type GameRow } from './games';
import { makeReplay, type ReplayHandle } from './replay';

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
  let lastGame: GameRow = game;
  let replayActive = false;

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

  // Submit an off-board action and paint the server's answer. A rejection is
  // normally a race (a move or the other player's action landed first), so
  // re-sync before surfacing the message.
  function runAction(btn: HTMLButtonElement, action: GameAction): void {
    btn.disabled = true;
    gameAction(gameId, action)
      .then((res) => applyServer(res.game))
      .catch(async (err) => {
        try { const g = await fetchGame(gameId); if (g) applyServer(g); } catch { /* keep current paint */ }
        banner.append(` ${err instanceof Error ? err.message : String(err)}`);
      });
  }

  const actionButton = (label: string, action: GameAction): HTMLButtonElement =>
    bannerButton(label, (btn) => runAction(btn, action));

  // Resigning is irreversible: the first click arms the button, the second
  // resigns, and the button disarms itself if the second never comes.
  function resignButton(): HTMLButtonElement {
    const btn = bannerButton('Resign', () => {
      if (btn.dataset.armed !== '1') {
        btn.dataset.armed = '1';
        btn.textContent = 'Confirm resign';
        setTimeout(() => { btn.dataset.armed = ''; btn.textContent = 'Resign'; }, 4000);
        return;
      }
      runAction(btn, 'resign');
    });
    return btn;
  }

  // Scrub controls over a finished game. The banner is built once (rebuilding
  // per step would break slider drags); `show` updates board + controls in
  // place. While replaying, applyServer keeps its bookkeeping but leaves the
  // banner and board to the scrubber.
  function enterReplay(handle: ReplayHandle): void {
    replayActive = true;
    banner.className = 'online-banner done';
    banner.replaceChildren('Replay ');
    const btnFirst = bannerButton('⏮', () => show(0));
    const btnPrev = bannerButton('◀', () => show(ply - 1));
    const btnNext = bannerButton('▶', () => show(ply + 1));
    const btnLast = bannerButton('⏭', () => show(handle.length));
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = String(handle.length);
    slider.addEventListener('input', () => show(Number(slider.value)));
    const counter = document.createElement('span');
    const btnExit = bannerButton('Exit replay', () => {
      replayActive = false;
      applyServer(lastGame);
    });

    let ply = handle.length;
    function show(p: number): void {
      ply = Math.max(0, Math.min(handle.length, p));
      view.loadState(structuredClone(handle.stateAt(ply)));
      renderBoard();
      updateStatus();
      counter.textContent = ` ${ply}/${handle.length} `;
      slider.value = String(ply);
      btnFirst.disabled = btnPrev.disabled = ply === 0;
      btnNext.disabled = btnLast.disabled = ply === handle.length;
    }

    banner.append(btnFirst, btnPrev, slider, btnNext, btnLast, counter, btnExit);
    show(handle.length);
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
      // A done game whose board shows no on-board end (mate / scored board)
      // ended off-board: resignation when there is a winner, agreement when not.
      const offBoard = !(g.board_state as { gameOver?: unknown } | null)?.gameOver;
      const how = offBoard ? (g.winner === null ? ' by agreement' : ' by resignation') : '';
      const outcome = g.winner === null ? `Draw${how}.`
        : g.winner === myId ? `You win${how}.`
        : myColor ? `You lose${how}.`
        : 'Game over.';
      banner.append(`Game over — ${outcome}`);
      banner.className = 'online-banner done';
      if (g.ply > 0) {
        banner.appendChild(bannerButton('Replay', (btn) => {
          btn.disabled = true;
          fetchMoves(g.id)
            .then((moves) => enterReplay(makeReplay(g.variant, g.topology, g.board_state, moves)))
            .catch((err) => {
              btn.disabled = false;
              banner.append(` ${err instanceof Error ? err.message : String(err)}`);
            });
        }));
      }
    } else {
      banner.className = 'online-banner active';
      banner.append(myColor
        ? `You are ${myColor}. ${turnColor(g) === myColor ? 'Your move.' : 'Opponent’s move.'}`
        : `Spectating — ${turnColor(g)} to move.`);
      if (myColor) {
        if (!g.draw_offer) {
          banner.appendChild(actionButton('Offer draw', 'offer-draw'));
        } else if (g.draw_offer === myId) {
          banner.append(' Draw offered — waiting for your opponent.');
          banner.appendChild(actionButton('Retract', 'decline-draw'));
        } else {
          banner.append(' Your opponent offers a draw.');
          banner.appendChild(actionButton('Accept draw', 'accept-draw'));
          banner.appendChild(actionButton('Decline', 'decline-draw'));
        }
        banner.appendChild(resignButton());
      } else if (g.draw_offer) {
        banner.append(' A draw has been offered.');
      }
    }
  }

  function applyServer(g: GameRow): void {
    const prevPly = serverPly;
    serverPly = g.ply;
    lastBoard = g.board_state;
    lastGame = g;
    myColor = seatOf(g);
    if (replayActive) return; // the scrubber owns board + banner; exit repaints from lastGame
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
