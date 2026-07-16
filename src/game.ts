import { readVariantParams, variantSearch } from './routes';
import { TOPOLOGY_MAP } from './topology';
import { GAMES, usesTopology } from './engine';
import { hasSupabase } from './net/client';
import { fetchProfile, onAuthChange, signOut } from './net/auth';
import { renderAuthPanel } from './net/auth-ui';
import { el, section } from './net/ui';
import { createGame, fetchGame, goBoardSizeOf, joinGame, listOpenGames, type GameRow } from './net/games';
import { GO_SIZE, GO_SIZES } from './engine/games/go';
import { fetchProfiles, listFriendships } from './net/social';
import { mountVersionBadge } from './version';

mountVersionBadge();

// Online-play entry (game.html), two modes:
//   * lobby (default): sign in / register, start an open game, challenge a
//     friend, or join a listed open game.
//   * join handoff (?join=<id>): the landing spot for a shared game link when
//     the visitor isn't signed in yet - sign in, claim the seat, and land on
//     the live board.

const params = new URLSearchParams(window.location.search);
const joinId = params.get('join');
const opponentId = params.get('opponent');

const { game, topoId, size } = readVariantParams();

const panel = document.getElementById('auth-panel')!;
const online = (id: string) => `./play.html?online=${id}`;

function setTitle(gameKey: string, topo: string | null): void {
  const gameLabel = GAMES.get(gameKey)?.name ?? gameKey;
  const title = topo && usesTopology(gameKey)
    ? `${gameLabel} · ${TOPOLOGY_MAP.get(topo)?.name ?? topo}`
    : gameLabel;
  document.getElementById('challenge-variant')!.textContent = title;
}

function renderUnavailable(): void {
  panel.replaceChildren(el('p', 'auth-msg', 'Online play is not configured in this build.'));
}

function renderSolo(): void {
  const gameLabel = GAMES.get(game)?.name ?? game;
  panel.replaceChildren(el('p', 'auth-msg', `${gameLabel} is single-player - play it in the sandbox.`));
}

// ==================== LOBBY MODE ====================

async function renderLobby(userId: string, name: string): Promise<void> {
  const gameLabel = GAMES.get(game)?.name ?? game;
  const [friends, open] = await Promise.all([
    listFriendships(userId).catch(() => []).then((fs) => fs.filter((f) => f.status === 'accepted')),
    listOpenGames().catch(() => []),
  ]);

  panel.replaceChildren();

  const head = el('div', 'lobby-head');
  head.append(el('span', 'auth-heading', `Signed in as ${name}`));
  const links = el('span', 'hub-head-actions');
  const account = el('a', 'lobby-link', 'Account');
  account.setAttribute('href', './home.html');
  const out = el('button', 'lobby-link', 'Sign out');
  out.addEventListener('click', () => signOut());
  links.append(account, out);
  head.appendChild(links);
  panel.appendChild(head);

  // -------- new-game options (Go board size; applies to every create below) --------
  let sizeSelect: HTMLSelectElement | null = null;
  if (game === 'go') {
    const row = el('div', 'lobby-form-row');
    row.appendChild(el('span', 'auth-msg', 'Board size'));
    sizeSelect = el('select');
    for (const s of GO_SIZES) {
      const opt = el('option', undefined, `${s}×${s}`);
      opt.value = String(s);
      if (s === (size ?? GO_SIZE)) opt.selected = true;
      sizeSelect.appendChild(opt);
    }
    row.appendChild(sizeSelect);
    panel.appendChild(row);
  }
  const gameOptions = (): Record<string, unknown> | undefined =>
    sizeSelect ? { size: Number(sizeSelect.value) } : undefined;

  // -------- directed challenge (carried from the players page) --------
  if (opponentId && opponentId !== userId) {
    const opp = (await fetchProfiles([opponentId]).catch(() => new Map())).get(opponentId);
    if (opp) {
      const dSec = section(`Challenge ${opp.username}`);
      panel.appendChild(dSec.root);
      const dMsg = el('p', 'auth-msg');
      const send = el('button', 'lobby-btn', `Challenge ${opp.username} to ${gameLabel}`);
      send.addEventListener('click', async () => {
        send.disabled = true;
        try {
          const { game: g } = await createGame(game, usesTopology(game) ? topoId : null, opp.id, gameOptions());
          location.href = online(g.id);
        } catch (err) {
          send.disabled = false;
          dMsg.textContent = `Could not create challenge: ${err instanceof Error ? err.message : String(err)}`;
        }
      });
      dSec.body.append(
        send,
        el('p', 'auth-msg', `Only ${opp.username} can take the seat; they see it on their account page.`),
        dMsg,
      );
    }
  }

  // -------- open game --------
  const startSec = section('Open game');
  panel.appendChild(startSec.root);
  const startMsg = el('p', 'auth-msg');
  const create = el('button', 'lobby-btn', `Start an open ${gameLabel} game`);
  create.addEventListener('click', async () => {
    create.disabled = true;
    try {
      const { game: g } = await createGame(game, usesTopology(game) ? topoId : null, undefined, gameOptions());
      location.href = online(g.id);
    } catch (err) {
      create.disabled = false;
      startMsg.textContent = `Could not create game: ${err instanceof Error ? err.message : String(err)}`;
    }
  });
  startSec.body.append(
    create,
    el('p', 'auth-msg', 'Anyone with the link (or the list below) can take the other seat.'),
    startMsg,
  );

  // -------- challenge a friend --------
  const chSec = section('Challenge a friend');
  panel.appendChild(chSec.root);
  if (friends.length === 0) {
    const p = el('p', 'auth-msg');
    p.append('No friends yet - add some on your ');
    const a = el('a', undefined, 'account page');
    a.setAttribute('href', './home.html');
    p.append(a, '.');
    chSec.body.appendChild(p);
  } else {
    const chMsg = el('p', 'auth-msg');
    const row = el('div', 'lobby-form-row');
    const select = el('select');
    for (const f of friends) {
      const opt = el('option', undefined, f.other.username);
      opt.value = f.other.id;
      select.appendChild(opt);
    }
    const challenge = el('button', 'lobby-btn', 'Challenge');
    challenge.addEventListener('click', async () => {
      challenge.disabled = true;
      try {
        const { game: g } = await createGame(game, usesTopology(game) ? topoId : null, select.value, gameOptions());
        location.href = online(g.id);
      } catch (err) {
        challenge.disabled = false;
        chMsg.textContent = `Could not create challenge: ${err instanceof Error ? err.message : String(err)}`;
      }
    });
    row.append(select, challenge);
    chSec.body.append(
      row,
      el('p', 'auth-msg', 'Only the challenged player can take the seat; they see it on their account page.'),
      chMsg,
    );
  }

  // -------- open games --------
  const openSec = section('Join an open game', open.length);
  panel.appendChild(openSec.root);
  const list = el('div', 'lobby-list');
  openSec.body.appendChild(list);

  if (open.length === 0) {
    list.appendChild(el('p', 'auth-msg', 'No open games right now. Start one above.'));
    return;
  }
  for (const g of open) {
    const row = el('div', 'lobby-game');
    const sz = goBoardSizeOf(g);
    const label = (g.variant_id ?? g.variant) + (sz ? ` ${sz}×${sz}` : '');
    row.appendChild(el('span', 'lobby-game-label', label));
    const mine = g.white_player === userId;
    const act = el('button', 'lobby-link', mine ? 'Open' : 'Join');
    act.addEventListener('click', async () => {
      act.disabled = true;
      try {
        if (!mine) await joinGame(g.id);
        location.href = online(g.id);
      } catch (err) {
        act.disabled = false;
        row.appendChild(el('span', 'auth-msg', ` ${err instanceof Error ? err.message : String(err)}`));
      }
    });
    row.appendChild(act);
    list.appendChild(row);
  }
}

// ==================== JOIN-HANDOFF MODE ====================

async function renderJoin(id: string, userId: string | null, name: string | null): Promise<void> {
  let g: GameRow | null = null;
  try {
    g = await fetchGame(id);
  } catch { /* fall through to not-found */ }
  if (!g) {
    panel.replaceChildren(el('p', 'auth-msg', 'This game no longer exists.'));
    return;
  }
  setTitle(g.variant, g.topology);

  if (!userId) {
    renderAuthPanel(panel, { heading: 'Sign in to join this game' });
    return;
  }

  panel.replaceChildren();
  panel.appendChild(el('div', 'auth-heading', `Signed in as ${name}`));

  const seated = g.white_player === userId || g.black_player === userId;
  if (seated || g.status !== 'waiting') {
    // Already in it, or it started/finished - just go watch/play.
    const a = el('a', 'lobby-btn', seated ? 'Open your game' : 'Watch this game');
    a.setAttribute('href', online(g.id));
    panel.appendChild(a);
    return;
  }
  if (g.invited_player && g.invited_player !== userId) {
    panel.appendChild(el('p', 'auth-msg', 'This game is a private challenge for another player.'));
    return;
  }

  const creator = g.white_player ? (await fetchProfiles([g.white_player])).get(g.white_player) : null;
  panel.appendChild(el('p', 'auth-msg', `${creator?.username ?? 'A player'} is waiting for an opponent.`));
  const btn = el('button', 'lobby-btn', 'Join this game');
  const msg = el('p', 'auth-msg');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await joinGame(g.id);
      location.href = online(g.id);
    } catch (err) {
      btn.disabled = false;
      msg.textContent = err instanceof Error ? err.message : String(err);
    }
  });
  panel.append(btn, msg);
}

// ==================== BOOT ====================

if (!joinId) setTitle(game, topoId);
document.getElementById('challenge-solo')!.setAttribute('href', `./play.html${variantSearch(game, topoId, size)}`);

if (!hasSupabase) {
  renderUnavailable();
} else if (!joinId && GAMES.get(game)?.soloOnly) {
  renderSolo();
} else {
  onAuthChange(async (session) => {
    if (session?.user) {
      const profile = await fetchProfile(session.user.id).catch(() => null);
      const name = profile?.username ?? session.user.email ?? 'player';
      if (joinId) renderJoin(joinId, session.user.id, name);
      else renderLobby(session.user.id, name);
    } else if (joinId) {
      renderJoin(joinId, null, null);
    } else {
      renderAuthPanel(panel);
    }
  });
}
