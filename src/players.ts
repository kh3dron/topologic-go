// Players directory (players.html): every profile with rating and win/played
// record, plus a challenge link that opens the catalog in challenge mode
// carrying the opponent - the lobby turns it into a directed challenge. Reads
// are world-readable, so the page works signed out (challenging prompts
// sign-in at the lobby).

import { hasSupabase } from './net/client';
import { currentUser } from './net/auth';
import { listProfiles } from './net/social';
import { listFinishedGames } from './net/games';
import { el, section } from './net/ui';
import { mountVersionBadge } from './version';

mountVersionBadge();

const panel = document.getElementById('players-panel')!;

async function boot(): Promise<void> {
  if (!hasSupabase) {
    panel.replaceChildren(el('p', 'auth-msg', 'Online play is not configured in this build.'));
    return;
  }

  const [profiles, finished, me] = await Promise.all([
    listProfiles(),
    listFinishedGames().catch(() => []),
    currentUser().catch(() => null),
  ]);

  const played = new Map<string, number>();
  const won = new Map<string, number>();
  for (const g of finished) {
    for (const p of [g.white_player, g.black_player]) {
      if (p) played.set(p, (played.get(p) ?? 0) + 1);
    }
    if (g.winner) won.set(g.winner, (won.get(g.winner) ?? 0) + 1);
  }

  panel.replaceChildren();
  const sec = section('All players', profiles.length);
  panel.appendChild(sec.root);

  if (profiles.length === 0) {
    sec.body.appendChild(el('p', 'auth-msg', 'No players yet.'));
    return;
  }

  const table = el('table', 'stats-table');
  const thead = el('thead');
  const hr = el('tr');
  for (const h of ['Player', 'Rating', 'Played', 'Won', '']) hr.appendChild(el('th', undefined, h));
  thead.appendChild(hr);
  const tbody = el('tbody');
  table.append(thead, tbody);
  sec.body.appendChild(table);

  for (const p of profiles) {
    const row = el('tr');
    const name = el('td', 'stats-name', p.username);
    if (me && p.id === me.id) name.appendChild(el('span', 'hub-badge', 'you'));
    row.appendChild(name);
    row.appendChild(el('td', 'stats-num', String(p.rating)));
    row.appendChild(el('td', 'stats-num', String(played.get(p.id) ?? 0)));
    row.appendChild(el('td', 'stats-num', String(won.get(p.id) ?? 0)));
    const act = el('td', 'stats-act');
    if (!me || p.id !== me.id) {
      const ch = el('a', 'lobby-link', 'Challenge');
      ch.setAttribute('href', `./index.html?mode=challenge&opponent=${p.id}`);
      ch.title = 'Pick a board, then send the challenge';
      act.appendChild(ch);
    }
    row.appendChild(act);
    tbody.appendChild(row);
  }

  sec.body.appendChild(el('p', 'auth-msg', 'Challenge opens the catalog to pick a board; the challenge lands on their account page.'));
}

void boot();
