// Account hub bootstrap (home.html): profile (username edit, sign out), games
// in progress, incoming/outgoing challenges, and the friends list. Everything
// renders into #hub-panel and re-renders on auth changes, Realtime events on
// my games/friendships, and after every action.

import { GAMES, usesTopology } from './engine';
import { TOPOLOGY_MAP } from './topology';
import { hasSupabase } from './net/client';
import { fetchProfile, onAuthChange, signOut, updateUsername, type Profile } from './net/auth';
import { renderAuthPanel } from './net/auth-ui';
import { cancelGame, joinGame, listMyGames, type GameRow } from './net/games';
import {
  acceptFriend, fetchProfiles, listFriendships, removeFriendship, requestFriend,
  subscribeSocial, type FriendEdge,
} from './net/social';
import { mountVersionBadge } from './version';

mountVersionBadge();

const panel = document.getElementById('hub-panel')!;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
}

function variantLabel(g: GameRow): string {
  const name = GAMES.get(g.variant)?.name ?? g.variant;
  const topo = g.topology && usesTopology(g.variant) ? TOPOLOGY_MAP.get(g.topology)?.name : null;
  return topo ? `${name} · ${topo}` : name;
}

const openHref = (id: string) => `./play.html?online=${id}`;

function actionBtn(label: string, run: (btn: HTMLButtonElement) => Promise<void>): HTMLButtonElement {
  const btn = el('button', 'lobby-link', label);
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await run(btn);
    } catch (err) {
      btn.disabled = false;
      btn.insertAdjacentElement('afterend', el('span', 'auth-msg', err instanceof Error ? err.message : String(err)));
    }
  });
  return btn;
}

// ==================== SIGNED-IN HUB ====================

let refresh: () => void = () => {};

async function renderHub(me: Profile): Promise<void> {
  const [games, friends] = await Promise.all([
    listMyGames(me.id).catch(() => [] as GameRow[]),
    listFriendships(me.id).catch(() => [] as FriendEdge[]),
  ]);

  // Opponent / challenger names for the game rows.
  const nameIds = games.flatMap((g) => [g.white_player, g.black_player, g.invited_player])
    .filter((id): id is string => Boolean(id) && id !== me.id);
  const names = await fetchProfiles(nameIds).catch(() => new Map<string, Profile>());
  const nameOf = (id: string | null) => (id ? names.get(id)?.username ?? 'unknown' : null);

  const incoming = games.filter((g) => g.invited_player === me.id && g.status === 'waiting');
  const outgoing = games.filter((g) => g.white_player === me.id && g.invited_player && g.status === 'waiting');
  const openMine = games.filter((g) => g.white_player === me.id && !g.invited_player && g.status === 'waiting');
  const active = games.filter((g) => g.status === 'active');

  panel.replaceChildren();

  // -------- profile --------
  const head = el('div', 'lobby-head');
  head.append(el('span', 'auth-heading', `Signed in as ${me.username} · rating ${me.rating}`));
  const actions = el('span', 'hub-head-actions');
  const rename = el('button', 'lobby-link', 'Change username');
  rename.addEventListener('click', () => {
    const form = el('form', 'auth-form hub-rename');
    const name = el('input');
    name.value = me.username;
    name.maxLength = 24;
    const save = el('button', 'lobby-btn', 'Save');
    save.type = 'submit';
    form.append(name, save);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      save.disabled = true;
      try {
        await updateUsername(me.id, name.value.trim());
        refresh();
      } catch (err) {
        save.disabled = false;
        form.appendChild(el('span', 'auth-msg', err instanceof Error ? err.message : String(err)));
      }
    });
    rename.replaceWith(form);
    name.focus();
  });
  const out = el('button', 'lobby-link', 'Sign out');
  out.addEventListener('click', () => signOut());
  actions.append(rename, out);
  head.appendChild(actions);
  panel.appendChild(head);

  // -------- games in progress --------
  panel.appendChild(el('div', 'lobby-subhead', 'Games in progress'));
  const gameList = el('div', 'lobby-list');
  panel.appendChild(gameList);
  if (active.length === 0 && openMine.length === 0) {
    const p = el('p', 'auth-msg');
    p.append('No games yet - pick a board in the ');
    const a = el('a', undefined, 'catalog');
    a.setAttribute('href', './index.html?mode=challenge');
    p.append(a, ' to start one.');
    gameList.appendChild(p);
  }
  for (const g of active) {
    const row = el('div', 'lobby-game');
    const opponent = nameOf(g.white_player === me.id ? g.black_player : g.white_player);
    const yourMove = g.turn === me.id;
    const label = el('span', 'lobby-game-label', `${variantLabel(g)} vs ${opponent}`);
    if (yourMove) label.appendChild(el('span', 'hub-badge', 'your move'));
    row.appendChild(label);
    const open = el('a', 'lobby-link', 'Open');
    open.setAttribute('href', openHref(g.id));
    row.appendChild(open);
    gameList.appendChild(row);
  }
  for (const g of openMine) {
    const row = el('div', 'lobby-game');
    row.appendChild(el('span', 'lobby-game-label', `${variantLabel(g)} · waiting for an opponent`));
    const open = el('a', 'lobby-link', 'Open');
    open.setAttribute('href', openHref(g.id));
    row.append(open, actionBtn('Cancel', async () => { await cancelGame(g.id); refresh(); }));
    gameList.appendChild(row);
  }

  // -------- challenges --------
  if (incoming.length > 0 || outgoing.length > 0) {
    panel.appendChild(el('div', 'lobby-subhead', 'Challenges'));
    const chList = el('div', 'lobby-list');
    panel.appendChild(chList);
    for (const g of incoming) {
      const row = el('div', 'lobby-game');
      row.appendChild(el('span', 'lobby-game-label', `${nameOf(g.white_player)} challenges you · ${variantLabel(g)}`));
      row.append(
        actionBtn('Accept', async () => {
          const { game } = await joinGame(g.id);
          location.href = openHref(game.id);
        }),
        actionBtn('Decline', async () => { await cancelGame(g.id); refresh(); }),
      );
      chList.appendChild(row);
    }
    for (const g of outgoing) {
      const row = el('div', 'lobby-game');
      row.appendChild(el('span', 'lobby-game-label', `You challenged ${nameOf(g.invited_player)} · ${variantLabel(g)}`));
      row.append(actionBtn('Cancel', async () => { await cancelGame(g.id); refresh(); }));
      chList.appendChild(row);
    }
  }

  // -------- friends --------
  panel.appendChild(el('div', 'lobby-subhead', 'Friends'));
  const addForm = el('form', 'auth-form hub-add-friend');
  const name = el('input');
  name.placeholder = 'friend’s username';
  name.autocomplete = 'off';
  name.required = true;
  const add = el('button', 'lobby-btn', 'Add friend');
  add.type = 'submit';
  addForm.append(name, add);
  const addMsg = el('p', 'auth-msg');
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    add.disabled = true;
    addMsg.textContent = '';
    try {
      const prof = await requestFriend(me.id, name.value.trim());
      addMsg.textContent = `Request sent to ${prof.username}.`;
      refresh();
    } catch (err) {
      add.disabled = false;
      addMsg.textContent = err instanceof Error ? err.message : String(err);
    }
  });
  panel.append(addForm, addMsg);

  const frList = el('div', 'lobby-list');
  panel.appendChild(frList);
  const accepted = friends.filter((f) => f.status === 'accepted');
  const pendingIn = friends.filter((f) => f.status === 'pending' && f.direction === 'incoming');
  const pendingOut = friends.filter((f) => f.status === 'pending' && f.direction === 'outgoing');

  if (friends.length === 0) {
    frList.appendChild(el('p', 'auth-msg', 'No friends yet - add one by username.'));
  }
  for (const f of pendingIn) {
    const row = el('div', 'lobby-game');
    row.appendChild(el('span', 'lobby-game-label', `${f.other.username} wants to be friends`));
    row.append(
      actionBtn('Accept', async () => { await acceptFriend(f.requester, me.id); refresh(); }),
      actionBtn('Decline', async () => { await removeFriendship(f.requester, f.addressee); refresh(); }),
    );
    frList.appendChild(row);
  }
  for (const f of accepted) {
    const row = el('div', 'lobby-game');
    row.appendChild(el('span', 'lobby-game-label', `${f.other.username} · rating ${f.other.rating}`));
    const challenge = el('a', 'lobby-link', 'Challenge');
    challenge.setAttribute('href', './index.html?mode=challenge');
    challenge.title = 'Pick a board, then choose this friend in the lobby';
    row.append(challenge, actionBtn('Remove', async () => { await removeFriendship(f.requester, f.addressee); refresh(); }));
    frList.appendChild(row);
  }
  for (const f of pendingOut) {
    const row = el('div', 'lobby-game');
    row.appendChild(el('span', 'lobby-game-label', `${f.other.username} · request pending`));
    row.append(actionBtn('Cancel', async () => { await removeFriendship(f.requester, f.addressee); refresh(); }));
    frList.appendChild(row);
  }
}

// ==================== BOOT ====================

if (!hasSupabase) {
  panel.replaceChildren(el('p', 'auth-msg', 'Online play is not configured in this build.'));
} else {
  let channel: { unsubscribe(): void } | null = null;
  let timer: number | null = null;
  let current: string | null = null;

  onAuthChange(async (session) => {
    if (session?.user) {
      const userId = session.user.id;
      current = userId;
      const profile = await fetchProfile(userId).catch(() => null);
      const me: Profile = profile ?? { id: userId, username: session.user.email ?? 'player', rating: 1200 };
      refresh = () => { if (current === userId) void renderHub(me); };
      refresh();
      if (!channel) {
        channel = subscribeSocial(userId, () => {
          // Debounce Realtime bursts (a join fires game + move updates together).
          if (timer !== null) clearTimeout(timer);
          timer = window.setTimeout(() => refresh(), 250);
        });
      }
    } else {
      current = null;
      channel?.unsubscribe();
      channel = null;
      refresh = () => {};
      renderAuthPanel(panel);
    }
  });
}
