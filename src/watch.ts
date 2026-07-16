// Spectator browse (watch.html): all active games, most recent move first,
// each linking to play.html?online=<id> where spectators get a read-only
// board. World-readable, no auth. Refreshes on the button and when the tab
// regains focus.

import { GAMES, usesTopology } from './engine';
import { TOPOLOGY_MAP } from './topology';
import { hasSupabase } from './net/client';
import { listActiveGames, type GameRow } from './net/games';
import { fetchProfiles } from './net/social';
import { el, section } from './net/ui';
import { mountVersionBadge } from './version';

mountVersionBadge();

const panel = document.getElementById('watch-panel')!;

function variantLabel(g: GameRow): string {
  const name = GAMES.get(g.variant)?.name ?? g.variant;
  const topo = g.topology && usesTopology(g.variant) ? TOPOLOGY_MAP.get(g.topology)?.name : null;
  return topo ? `${name} · ${topo}` : name;
}

function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

async function refresh(): Promise<void> {
  const games = await listActiveGames().catch(() => [] as GameRow[]);
  const ids = games.flatMap((g) => [g.white_player, g.black_player]).filter((id): id is string => Boolean(id));
  const names = await fetchProfiles(ids).catch(() => new Map());
  const nameOf = (id: string | null) => (id ? names.get(id)?.username ?? 'unknown' : '?');

  panel.replaceChildren();
  const sec = section('In progress', games.length);
  panel.appendChild(sec.root);

  if (games.length === 0) {
    const p = el('p', 'auth-msg');
    p.append('Nobody is playing right now. Start a game from the ');
    const a = el('a', undefined, 'catalog');
    a.setAttribute('href', './index.html?mode=challenge');
    p.append(a, '.');
    sec.body.appendChild(p);
  }

  const list = el('div', 'lobby-list');
  sec.body.appendChild(list);
  for (const g of games) {
    const row = el('div', 'lobby-game');
    const label = el('span', 'lobby-game-label');
    label.append(
      `${variantLabel(g)} · ${nameOf(g.white_player)} vs ${nameOf(g.black_player)}`,
      el('span', 'watch-meta', ` move ${g.ply} · ${ago(g.updated_at)}`),
    );
    row.appendChild(label);
    const watch = el('a', 'lobby-link', 'Watch');
    watch.setAttribute('href', `./play.html?online=${g.id}`);
    row.appendChild(watch);
    list.appendChild(row);
  }

  const foot = el('div', 'lobby-head');
  const note = el('p', 'auth-msg', 'Boards are live - spectators see every move as it lands.');
  const btn = el('button', 'lobby-link', 'Refresh');
  btn.addEventListener('click', () => void refresh());
  foot.append(note, btn);
  sec.body.appendChild(foot);
}

if (!hasSupabase) {
  panel.replaceChildren(el('p', 'auth-msg', 'Online play is not configured in this build.'));
} else {
  void refresh();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void refresh();
  });
}
