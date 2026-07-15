import { readVariantParams, variantSearch } from './routes';
import { TOPOLOGY_MAP } from './topology';
import { GAMES, usesTopology } from './engine';
import { hasSupabase } from './net/client';
import { fetchProfile, onAuthChange, signOut } from './net/auth';
import { renderAuthPanel } from './net/auth-ui';
import { createGame, fetchGame, joinGame, listOpenGames, type GameRow } from './net/games';
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

const { game, topoId } = readVariantParams();

const panel = document.getElementById('auth-panel')!;
const online = (id: string) => `./play.html?online=${id}`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
}

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

  const msg = el('p', 'auth-msg');

  const create = el('button', 'lobby-btn', `Start an open ${gameLabel} game`);
  create.addEventListener('click', async () => {
    create.disabled = true;
    try {
      const { game: g } = await createGame(game, usesTopology(game) ? topoId : null);
      location.href = online(g.id);
    } catch (err) {
      create.disabled = false;
      msg.textContent = `Could not create game: ${err instanceof Error ? err.message : String(err)}`;
    }
  });
  panel.appendChild(create);
  panel.appendChild(el('p', 'auth-msg', 'Anyone with the link (or the list below) can take the other seat.'));

  // -------- challenge a friend --------
  const friends = (await listFriendships(userId).catch(() => []))
    .filter((f) => f.status === 'accepted');
  panel.appendChild(el('div', 'lobby-subhead', 'Challenge a friend'));
  if (friends.length === 0) {
    const p = el('p', 'auth-msg');
    p.append('No friends yet - add some on your ');
    const a = el('a', undefined, 'account page');
    a.setAttribute('href', './home.html');
    p.append(a, '.');
    panel.appendChild(p);
  } else {
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
        const { game: g } = await createGame(game, usesTopology(game) ? topoId : null, select.value);
        location.href = online(g.id);
      } catch (err) {
        challenge.disabled = false;
        msg.textContent = `Could not create challenge: ${err instanceof Error ? err.message : String(err)}`;
      }
    });
    row.append(select, challenge);
    panel.appendChild(row);
    panel.appendChild(el('p', 'auth-msg', 'Only the challenged player can take the seat; they see it on their account page.'));
  }

  panel.appendChild(msg);

  // -------- open games --------
  panel.appendChild(el('div', 'lobby-subhead', 'Open games'));
  const list = el('div', 'lobby-list');
  panel.appendChild(list);

  const open = await listOpenGames().catch(() => []);
  if (open.length === 0) {
    list.appendChild(el('p', 'auth-msg', 'No open games. Start one above.'));
    return;
  }
  for (const g of open) {
    const row = el('div', 'lobby-game');
    row.appendChild(el('span', 'lobby-game-label', g.variant_id ?? g.variant));
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
document.getElementById('challenge-solo')!.setAttribute('href', `./play.html${variantSearch(game, topoId)}`);

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
