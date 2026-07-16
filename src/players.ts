// Players directory (players.html): every profile with rating and win/played
// record, plus a challenge link that opens the catalog in challenge mode
// carrying the opponent - the lobby turns it into a directed challenge. Reads
// are world-readable, so the page works signed out (challenging prompts
// sign-in at the lobby).

import { hasSupabase } from './net/client';
import { currentUser } from './net/auth';
import { listProfiles } from './net/social';
import { listGamesForStats } from './net/games';
import { achievementPoints, earnedAchievements, playerStats } from './net/achievements';
import { el, section } from './net/ui';
import { mountVersionBadge } from './version';

mountVersionBadge();

const panel = document.getElementById('players-panel')!;

async function boot(): Promise<void> {
  if (!hasSupabase) {
    panel.replaceChildren(el('p', 'auth-msg', 'Online play is not configured in this build.'));
    return;
  }

  const [profiles, games, me] = await Promise.all([
    listProfiles(),
    listGamesForStats().catch(() => []),
    currentUser().catch(() => null),
  ]);

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
  for (const h of ['Player', 'Rating', 'Played', 'Won', 'Achievements', 'Points', '']) hr.appendChild(el('th', undefined, h));
  thead.appendChild(hr);
  const tbody = el('tbody');
  table.append(thead, tbody);
  sec.body.appendChild(table);

  for (const p of profiles) {
    const stats = playerStats(games, p.id);
    const earned = earnedAchievements(stats);
    const row = el('tr');
    const name = el('td', 'stats-name', p.username);
    if (me && p.id === me.id) name.appendChild(el('span', 'hub-badge', 'you'));
    row.appendChild(name);
    row.appendChild(el('td', 'stats-num', String(p.rating)));
    row.appendChild(el('td', 'stats-num', String(stats.finished)));
    row.appendChild(el('td', 'stats-num', String(stats.won)));
    const ach = el('td', 'stats-num', String(earned.length));
    if (earned.length > 0) ach.title = earned.map((a) => a.name).join(', ');
    row.appendChild(ach);
    row.appendChild(el('td', 'stats-num', String(achievementPoints(earned))));
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
