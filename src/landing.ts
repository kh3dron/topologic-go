import { GameType } from './state';
import { TOPOLOGIES, Topology } from './topology';
import { GAMES, usesTopology } from './engine';
import { variantHref, variantSearch, PlayMode } from './routes';
import { createPreview } from './preview';
import { mountVersionBadge } from './version';

mountVersionBadge();

// A Mario-Kart-style picker: choose a board (topology) from the scrollable list,
// see it animate in the preview, then pick a game and launch. Everything derives
// from the registries, so a new topology or game appears here automatically.

interface GameOption { id: GameType; name: string; }

// One selectable board. Topology boards share the chess/go/snake lineup; the hex
// family (no project()) is its own board with a single game.
interface Entry {
  id: string;              // topology id, or game id for non-topology boards
  name: string;
  group: string;
  topo: Topology | null;
  games: GameOption[];
  topoId: string;          // value handed to variantHref / variantSearch
  surface: string;
  spec: string[];
  search: string;
  badge: string;           // preview caption for boards without a topology
  preview?: 'hex';         // static preview drawing; undefined = #TODO placeholder
}

const topoGames: GameOption[] = [...GAMES.values()]
  .filter(m => usesTopology(m.id))
  .map(m => ({ id: m.id as GameType, name: m.name }));
const otherGames = [...GAMES.values()].filter(m => !usesTopology(m.id));

function tessDim(t: Topology): number {
  return (t.periodX != null ? 1 : 0) + (t.periodY != null ? 1 : 0);
}

const DIM_GROUP: Record<number, string> = {
  0: 'Bounded',
  1: '1D',
  2: '2D',
};

const entries: Entry[] = [];
for (const dim of [0, 1, 2]) {
  for (const topo of TOPOLOGIES.filter(t => tessDim(t) === dim)) {
    entries.push({
      id: topo.id,
      name: topo.name,
      group: DIM_GROUP[dim],
      topo,
      games: topoGames,
      topoId: topo.id,
      surface: topo.formal.surface,
      spec: topo.spec,
      search: topo.name.toLowerCase(),
      badge: '',
    });
  }
}
// Boards outside the topology family (hex, hyperbolic) describe their own card
// via the module's catalog metadata.
for (const m of otherGames) {
  const board = m.catalog?.board ?? m.name;
  entries.push({
    id: m.id,
    name: board,
    group: m.catalog?.group ?? 'Other boards',
    topo: null,
    games: [{ id: m.id as GameType, name: m.name }],
    topoId: m.id,
    surface: m.catalog?.surface ?? '',
    spec: m.catalog?.spec ?? [],
    search: `${board} ${m.name}`.toLowerCase(),
    badge: m.catalog?.badge ?? 'CUSTOM BOARD',
    preview: m.catalog?.preview,
  });
}

const entryById = new Map(entries.map(e => [e.id, e]));

// ==================== ELEMENTS ====================
const listEl = document.getElementById('topo-list')!;
const searchInput = document.getElementById('catalog-search') as HTMLInputElement;
const emptyEl = document.getElementById('catalog-empty')!;
const nameEl = document.getElementById('detail-name')!;
const surfaceEl = document.getElementById('detail-surface')!;
const specEl = document.getElementById('detail-spec')!;
const gameOptionsEl = document.getElementById('game-options')!;
const verdictEl = document.getElementById('verdict-note')!;
const playBtn = document.getElementById('play-btn') as HTMLAnchorElement;
const modeNote = document.getElementById('mode-note')!;
const badgeEl = document.getElementById('preview-badge')!;
const preview = createPreview(document.getElementById('preview-canvas') as HTMLCanvasElement);

// ==================== STATE ====================
let selectedId = 'classic';
let selectedGame: GameType = 'chess';
let mode: PlayMode = 'playground';

const itemEls = new Map<string, HTMLButtonElement>();
const groupEls = new Map<string, HTMLElement>();
const collapsedState = new Map<string, boolean>();

// entries arrive already grouped; keep that order for the accordion.
const groupOrder: string[] = [];
const groupEntries = new Map<string, Entry[]>();
for (const e of entries) {
  if (!groupEntries.has(e.group)) { groupEntries.set(e.group, []); groupOrder.push(e.group); }
  groupEntries.get(e.group)!.push(e);
}

// ==================== LIST (two-tier accordion) ====================
function buildList(): void {
  for (const group of groupOrder) {
    const groupEl = document.createElement('div');
    groupEl.className = 'topo-group collapsed';
    collapsedState.set(group, true);

    const header = document.createElement('button');
    header.className = 'topo-group-header';
    header.setAttribute('aria-expanded', 'false');
    header.innerHTML =
      '<span class="topo-group-caret" aria-hidden="true">&#9656;</span>' +
      `<span class="topo-group-name">${group}</span>` +
      `<span class="topo-group-count">${groupEntries.get(group)!.length}</span>`;
    header.addEventListener('click', () => toggleGroup(group));
    groupEl.appendChild(header);

    const itemsEl = document.createElement('div');
    itemsEl.className = 'topo-group-items';
    for (const e of groupEntries.get(group)!) {
      const item = document.createElement('button');
      item.className = 'topo-item';
      item.dataset.id = e.id;
      item.innerHTML = `<span class="topo-item-name">${e.name}</span>`;
      item.addEventListener('click', () => select(e.id));
      itemsEl.appendChild(item);
      itemEls.set(e.id, item);
    }
    groupEl.appendChild(itemsEl);

    listEl.appendChild(groupEl);
    groupEls.set(group, groupEl);
  }
}

function setCollapsed(group: string, collapsed: boolean): void {
  const el = groupEls.get(group)!;
  el.classList.toggle('collapsed', collapsed);
  el.querySelector('.topo-group-header')!.setAttribute('aria-expanded', String(!collapsed));
}

function toggleGroup(group: string): void {
  collapsedState.set(group, !collapsedState.get(group));
  refreshList();
}

// ==================== SELECTION ====================
function select(id: string): void {
  const entry = entryById.get(id);
  if (!entry) return;
  selectedId = id;
  if (!entry.games.some(g => g.id === selectedGame)) selectedGame = entry.games[0].id;

  // Always reveal the group holding the active board.
  collapsedState.set(entry.group, false);
  setCollapsed(entry.group, false);

  for (const [eid, el] of itemEls) el.classList.toggle('active', eid === id);

  nameEl.textContent = entry.name;
  surfaceEl.textContent = entry.surface;
  specEl.innerHTML = entry.spec.map(s => `<span class="spec-chip">${s}</span>`).join('');
  const caption = preview.setBoard(entry.topo, entry.preview);
  badgeEl.textContent = entry.topo ? caption : entry.badge;

  buildGameOptions(entry);
  updateLaunch();
}

function buildGameOptions(entry: Entry): void {
  gameOptionsEl.innerHTML = '';
  for (const g of entry.games) {
    const btn = document.createElement('button');
    btn.className = 'game-btn';
    btn.textContent = g.name;
    btn.classList.toggle('active', g.id === selectedGame);
    btn.addEventListener('click', () => {
      selectedGame = g.id;
      for (const el of gameOptionsEl.querySelectorAll('.game-btn')) el.classList.remove('active');
      btn.classList.add('active');
      updateLaunch();
    });
    gameOptionsEl.appendChild(btn);
  }
}

function updateLaunch(): void {
  const entry = entryById.get(selectedId)!;
  const gameName = entry.games.find(g => g.id === selectedGame)?.name ?? 'game';
  playBtn.href = variantHref(mode, selectedGame, entry.topoId);
  playBtn.innerHTML = `Play ${gameName} <span aria-hidden="true">&rarr;</span>`;

  if (selectedGame === 'snake') {
    verdictEl.textContent = 'Single-player - steer with arrow keys or WASD';
  } else if (!entry.topo) {
    verdictEl.textContent = 'A different board, not a square topology';
  } else {
    verdictEl.textContent = '';
  }

  history.replaceState(null, '', variantSearch(selectedGame, entry.topoId));
}

// ==================== SEARCH + COLLAPSE ====================
// A search overrides the collapsed state: groups with matches force-expand so
// hits are visible; clearing the box restores each group's own state.
function refreshList(): void {
  const q = searchInput.value.trim().toLowerCase();
  const searching = q !== '';
  let anyVisible = false;

  for (const group of groupOrder) {
    const groupEl = groupEls.get(group)!;
    let hasVisible = false;
    for (const e of groupEntries.get(group)!) {
      const vis = !searching || e.search.includes(q);
      itemEls.get(e.id)!.hidden = !vis;
      if (vis) hasVisible = true;
    }
    groupEl.hidden = searching && !hasVisible;
    setCollapsed(group, searching ? !hasVisible : collapsedState.get(group)!);
    if (!groupEl.hidden && hasVisible) anyVisible = true;
  }
  emptyEl.hidden = anyVisible;
}

// ==================== MODE TOGGLE ====================
function setMode(next: PlayMode): void {
  mode = next;
  for (const btn of document.querySelectorAll<HTMLElement>('#mode-toggle .seg-btn')) {
    btn.classList.toggle('active', btn.dataset.mode === next);
  }
  modeNote.textContent = next === 'challenge'
    ? 'Play a friend online - open a game, share the link, or challenge from your friends list.'
    : 'Play both sides yourself in a stateless sandbox - no account needed.';
  updateLaunch();
}

// ==================== YOUR-MOVE ALERT ====================
// Best-effort nudge under the Account link when active games are waiting on
// you. Gated on the cached Supabase session key so signed-out visitors get no
// auth or network work, and any failure just leaves the element hidden.
async function mountMoveAlert(): Promise<void> {
  const hasSessionHint = Object.keys(localStorage)
    .some(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
  if (!hasSessionHint) return;
  try {
    const [{ hasSupabase }, { currentUser }, { listMyGames }] = await Promise.all([
      import('./net/client'), import('./net/auth'), import('./net/games'),
    ]);
    if (!hasSupabase) return;
    const user = await currentUser();
    if (!user) return;
    const games = await listMyGames(user.id);
    const waiting = games.filter(g => g.status === 'active' && g.turn === user.id).length;
    if (waiting === 0) return;
    const el = document.getElementById('move-alert')!;
    el.textContent = `Your move in ${waiting} ${waiting === 1 ? 'game' : 'games'}`;
    el.hidden = false;
  } catch {
    // The alert is decoration; never let it break the catalog.
  }
}

// ==================== BOOT ====================
function boot(): void {
  buildList();
  void mountMoveAlert();

  const params = new URLSearchParams(window.location.search);
  const g = params.get('g');
  const t = params.get('t');
  if (g && GAMES.has(g)) selectedGame = g as GameType;

  let startId = 'classic';
  if (g && GAMES.has(g) && !usesTopology(g)) startId = g;
  else if (t && entryById.has(t)) startId = t;

  for (const btn of document.querySelectorAll<HTMLElement>('#mode-toggle .seg-btn')) {
    btn.addEventListener('click', () => setMode(btn.dataset.mode as PlayMode));
  }
  searchInput.addEventListener('input', refreshList);

  setMode(params.get('mode') === 'challenge' ? 'challenge' : 'playground');
  select(startId);
  refreshList();
}

boot();
