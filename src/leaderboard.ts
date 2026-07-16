// Snake leaderboard (leaderboard.html): one table per topology of best scores,
// highest first. Rows are server-written only (submit-snake-score replays the
// run log through the shared engine), so everything here is world-readable
// selects and the page works signed out.

import { TOPOLOGIES } from './topology';
import { hasSupabase } from './net/client';
import { currentUser } from './net/auth';
import { listSnakeScores, type SnakeScoreRow } from './net/scores';
import { fetchProfiles } from './net/social';
import { el, section } from './net/ui';
import { mountVersionBadge } from './version';

mountVersionBadge();

const TOP_N = 10;

const panel = document.getElementById('leaderboard-panel')!;

function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

async function boot(): Promise<void> {
  if (!hasSupabase) {
    panel.replaceChildren(el('p', 'auth-msg', 'Online play is not configured in this build.'));
    return;
  }

  const [scores, me] = await Promise.all([
    listSnakeScores().catch(() => [] as SnakeScoreRow[]),
    currentUser().catch(() => null),
  ]);
  const names = await fetchProfiles(scores.map((s) => s.player)).catch(() => new Map());

  const byTopo = new Map<string, SnakeScoreRow[]>();
  for (const s of scores) {
    const list = byTopo.get(s.topology) ?? [];
    list.push(s);
    byTopo.set(s.topology, list);
  }

  panel.replaceChildren();
  panel.appendChild(el('p', 'auth-msg',
    'Best score per player on each board. Finish a run while signed in and it lands here automatically.'));

  for (const topo of TOPOLOGIES) {
    const rows = byTopo.get(topo.id) ?? [];
    const sec = section(topo.name, rows.length);
    panel.appendChild(sec.root);

    if (rows.length === 0) {
      const p = el('p', 'auth-msg');
      p.append('No scores yet - ');
      const a = el('a', undefined, 'be the first');
      a.setAttribute('href', `./play.html?g=snake&t=${topo.id}`);
      p.append(a, '.');
      sec.body.appendChild(p);
      continue;
    }

    const table = el('table', 'stats-table');
    const thead = el('thead');
    const hr = el('tr');
    for (const h of ['#', 'Player', 'Score', 'When']) hr.appendChild(el('th', undefined, h));
    thead.appendChild(hr);
    const tbody = el('tbody');
    table.append(thead, tbody);
    sec.body.appendChild(table);

    rows.slice(0, TOP_N).forEach((s, i) => {
      const row = el('tr');
      row.appendChild(el('td', 'stats-num', String(i + 1)));
      const name = el('td', 'stats-name', names.get(s.player)?.username ?? 'unknown');
      if (me && s.player === me.id) name.appendChild(el('span', 'hub-badge', 'you'));
      row.appendChild(name);
      row.appendChild(el('td', 'stats-num', String(s.score)));
      row.appendChild(el('td', 'stats-num', ago(s.achieved_at)));
      tbody.appendChild(row);
    });

    const play = el('a', 'lobby-link', 'Play this board');
    play.setAttribute('href', `./play.html?g=snake&t=${topo.id}`);
    sec.body.appendChild(play);
  }
}

void boot();
