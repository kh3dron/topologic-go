import { GameType } from './state';
import { TOPOLOGIES, Topology } from './topology';
import { GAMES, usesTopology } from './engine';
import { variantHref, PlayMode } from './routes';
import { mountVersionBadge } from './version';

mountVersionBadge();

// Topology-bearing games appear on every topology row; other geometries (hex)
// get their own row. Both derive from the registry, so a new game lands here
// automatically.
const topoGames = [...GAMES.values()].filter(m => usesTopology(m.id));
const otherGames = [...GAMES.values()].filter(m => !usesTopology(m.id));

// The catalog is a plain list of geometries grouped by how the board tessellates
// the plane: bounded (classic), one wrapped axis (cylinder / corridor / Möbius),
// or two (torus / Klein / ...). Each geometry links out per game; all the detail
// lives on the play page.

interface GameLink { game: GameType; topoId: string; label: string; }

interface GeoRow {
  search: string;
  row: HTMLElement;
  anchors: HTMLAnchorElement[];
}

interface Group {
  rows: GeoRow[];
  section: HTMLElement;
}

function tessDim(topo: Topology): number {
  return (topo.periodX != null ? 1 : 0) + (topo.periodY != null ? 1 : 0);
}

const DIM_META: Record<number, { title: string; note: string }> = {
  0: { title: 'Bounded board', note: 'Classic edges — the board simply ends.' },
  1: { title: 'Tessellated in one dimension', note: 'One axis wraps or reflects; the other stays a wall.' },
  2: { title: 'Tessellated in two dimensions', note: 'Both edge pairs glue — a closed surface with no boundary.' },
};

const groups: Group[] = [];
const listEl = document.getElementById('catalog-list')!;

function makeGroup(title: string, note: string): Group {
  const section = document.createElement('section');
  section.className = 'geo-group';
  section.innerHTML = `<h2 class="geo-group-title">${title}</h2><p class="geo-group-note">${note}</p>`;
  listEl.appendChild(section);
  const group: Group = { rows: [], section };
  groups.push(group);
  return group;
}

function addRow(group: Group, name: string, links: GameLink[]): void {
  const row = document.createElement('div');
  row.className = 'geo-row';

  const nameEl = document.createElement('span');
  nameEl.className = 'geo-name';
  nameEl.textContent = name;
  row.appendChild(nameEl);

  const games = document.createElement('span');
  games.className = 'geo-games';
  const anchors: HTMLAnchorElement[] = [];
  for (const link of links) {
    const a = document.createElement('a');
    a.className = 'geo-link';
    a.textContent = link.label;
    a.dataset.game = link.game;
    a.dataset.topo = link.topoId;
    a.href = variantHref('playground', link.game, link.topoId);
    games.appendChild(a);
    anchors.push(a);
  }
  row.appendChild(games);

  group.section.appendChild(row);
  group.rows.push({ search: name.toLowerCase(), row, anchors });
}

function buildList(): void {
  for (const dim of [0, 1, 2]) {
    const topos = TOPOLOGIES.filter(t => tessDim(t) === dim);
    if (topos.length === 0) continue;
    const meta = DIM_META[dim];
    const group = makeGroup(meta.title, meta.note);
    for (const topo of topos) {
      addRow(group, topo.name, topoGames.map(m => ({ game: m.id as GameType, topoId: topo.id, label: m.name })));
    }
  }

  if (otherGames.length > 0) {
    const other = makeGroup('Other geometries', 'A different board shape, not a topology of the square.');
    for (const m of otherGames) {
      addRow(other, m.name, [{ game: m.id as GameType, topoId: m.id, label: 'Play' }]);
    }
  }
}

// ==================== SEARCH ====================
const searchInput = document.getElementById('catalog-search') as HTMLInputElement;
const emptyEl = document.getElementById('catalog-empty')!;

function applySearch(): void {
  const q = searchInput.value.trim().toLowerCase();
  let shown = 0;
  for (const g of groups) {
    let groupShown = 0;
    for (const r of g.rows) {
      const visible = q === '' || r.search.includes(q);
      r.row.hidden = !visible;
      if (visible) groupShown++;
    }
    g.section.hidden = groupShown === 0;
    shown += groupShown;
  }
  emptyEl.hidden = shown !== 0;
}

// ==================== MODE TOGGLE ====================
const modeNote = document.getElementById('mode-note')!;

function setMode(mode: PlayMode): void {
  document.getElementById('catalog')!.classList.toggle('challenge-mode', mode === 'challenge');
  for (const btn of document.querySelectorAll<HTMLElement>('#mode-toggle .seg-btn')) {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  }
  for (const g of groups) {
    for (const r of g.rows) {
      for (const a of r.anchors) {
        a.href = variantHref(mode, a.dataset.game as GameType, a.dataset.topo!);
      }
    }
  }
  modeNote.textContent = mode === 'challenge'
    ? 'Play a friend or bot online. Accounts + live games coming soon.'
    : 'Play both sides yourself in a stateless sandbox — no account needed.';
}

// ==================== BOOT ====================
buildList();
for (const btn of document.querySelectorAll<HTMLElement>('#mode-toggle .seg-btn')) {
  btn.addEventListener('click', () => setMode(btn.dataset.mode as PlayMode));
}
searchInput.addEventListener('input', applySearch);

setMode('playground');
applySearch();
