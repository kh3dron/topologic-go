import { readVariantParams, variantSearch } from './routes';
import { TOPOLOGY_MAP } from './topology';
import { GAMES, usesTopology } from './engine';
import { hasSupabase } from './net/client';
import { fetchProfile, onAuthChange, sendMagicLink, signOut } from './net/auth';
import { createGame, joinGame, listOpenGames } from './net/games';
import { mountVersionBadge } from './version';

mountVersionBadge();

// Online-play entry (game.html): variant title, solo fallback, passwordless
// sign-in, and a lobby (create a game or join an open one -> redirect into the
// live board on play.html?online=<id>).

const { game, topoId } = readVariantParams();

const gameLabel = GAMES.get(game)?.name ?? 'Chess';
const title = usesTopology(game)
  ? `${gameLabel} · ${TOPOLOGY_MAP.get(topoId)?.name ?? 'Classic'}`
  : gameLabel;

document.getElementById('challenge-variant')!.textContent = title;
document.getElementById('challenge-solo')!.setAttribute('href', `./play.html${variantSearch(game, topoId)}`);

const panel = document.getElementById('auth-panel')!;
const online = (id: string) => `./play.html?online=${id}`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text) node.textContent = text;
  return node;
}

function renderUnavailable(): void {
  panel.replaceChildren(el('p', 'auth-msg', 'Online play is not configured in this build.'));
}

function renderSignedOut(): void {
  panel.replaceChildren();
  panel.appendChild(el('div', 'auth-heading', 'Sign in to play online'));

  const form = el('form', 'auth-form');
  const email = el('input');
  email.type = 'email';
  email.required = true;
  email.placeholder = 'you@example.com';
  email.autocomplete = 'email';
  const btn = el('button', 'lobby-btn', 'Send magic link');
  btn.type = 'submit';
  form.append(email, btn);

  const msg = el('p', 'auth-msg');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    msg.textContent = 'Sending…';
    try {
      await sendMagicLink(email.value.trim(), `${location.origin}${location.pathname}${location.search}`);
      msg.textContent = 'Check your email for a sign-in link.';
    } catch (err) {
      msg.textContent = `Could not send link: ${err instanceof Error ? err.message : String(err)}`;
      btn.disabled = false;
    }
  });

  panel.append(form, msg);
}

async function renderLobby(userId: string, name: string): Promise<void> {
  panel.replaceChildren();

  const head = el('div', 'lobby-head');
  head.append(el('span', 'auth-heading', `Signed in as ${name}`));
  const out = el('button', 'lobby-link', 'Sign out');
  out.addEventListener('click', () => signOut());
  head.appendChild(out);
  panel.appendChild(head);

  const create = el('button', 'lobby-btn', `Start a new ${gameLabel} game`);
  create.addEventListener('click', async () => {
    create.disabled = true;
    try {
      const { game: g } = await createGame(game, usesTopology(game) ? topoId : null);
      location.href = online(g.id);
    } catch (err) {
      create.disabled = false;
      panel.appendChild(el('p', 'auth-msg', `Could not create game: ${err instanceof Error ? err.message : String(err)}`));
    }
  });
  panel.appendChild(create);

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

if (!hasSupabase) {
  renderUnavailable();
} else {
  onAuthChange(async (session) => {
    if (session?.user) {
      const profile = await fetchProfile(session.user.id).catch(() => null);
      renderLobby(session.user.id, profile?.username ?? session.user.email ?? 'player');
    } else {
      renderSignedOut();
    }
  });
}
