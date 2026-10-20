import './report';
import { GameType } from './state';
import { TOPOLOGIES, Topology } from './topology';
import { GAMES, usesTopology } from './engine';
import { variantHref, variantSearch, PlayMode } from './routes';
import { createPreview } from './preview';
import type { Stage, StageBoard, View } from './surface/stage';
import type { PaintKind } from './surface/boards';
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
  kicker: string;          // stage eyebrow: group + symmetry group
  preview?: 'hex' | 'hyper' | 'penta' | 'hextorus'; // static preview drawing; undefined = #TODO placeholder
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
      search: `${topo.name} ${topo.formal.surface} ${topo.formal.group}`.toLowerCase(),
      badge: '',
      kicker: [DIM_GROUP[dim] === 'Bounded' ? 'Bounded' : `${DIM_GROUP[dim]} tiling`,
        topo.formal.group !== '-' ? topo.formal.group : null,
        topo.formal.orientable ? null : 'non-orientable'].filter(Boolean).join(' / '),
    });
  }
}
// Boards outside the topology family (hex, hyperbolic) describe their own card
// via the module's catalog metadata. Games sharing a board name (hyperchess +
// hypergo on the {4,6} patch) merge into ONE board entry with a game choice,
// mirroring how each topology entry carries every square-grid game.
const boardEntries = new Map<string, Entry>();
for (const m of otherGames) {
  const board = m.catalog?.board ?? m.name;
  const existing = boardEntries.get(board);
  if (existing) {
    existing.games.push({ id: m.id as GameType, name: m.name });
    existing.search += ` ${m.name.toLowerCase()}`;
    continue;
  }
  const entry: Entry = {
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
    kicker: m.catalog?.group ?? 'Other boards',
    preview: m.catalog?.preview,
  };
  boardEntries.set(board, entry);
  entries.push(entry);
}

const entryById = new Map(entries.map(e => [e.id, e]));
// Deep links address non-topology boards by game id (?g=hypergo); alias every
// game on a merged board entry to that entry.
for (const e of entries) {
  for (const g of e.games) {
    if (!entryById.has(g.id)) entryById.set(g.id, e);
  }
}

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
const kickerEl = document.getElementById('detail-kicker')!;
const descEl = document.getElementById('detail-desc')!;
const stageEl = document.getElementById('stage')!;
const surfaceCanvas = document.getElementById('surface-canvas') as HTMLCanvasElement;
const viewPlay = document.getElementById('view-play') as HTMLButtonElement;
const viewDescEl = document.getElementById('view-desc')!;
const preview = createPreview(document.getElementById('preview-canvas') as HTMLCanvasElement);

// ==================== STATE ====================
let selectedId = 'classic';
let selectedGame: GameType = 'chess';
let mode: PlayMode = 'playground';
// Directed-challenge opponent (profile id), carried opaquely from the players
// page into the lobby via the launch link.
let opponent: string | null = null;

let stage: Stage | null = null;
let surfaceKit: typeof import('./surface/boards') | null = null;
let stageFailed = false;

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
    groupEl.className = 'topo-group';
    collapsedState.set(group, false);

    const header = document.createElement('button');
    header.className = 'topo-group-header';
    header.setAttribute('aria-expanded', 'true');
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
      item.innerHTML =
        `<span class="topo-thumb" aria-hidden="true">${thumbGlyph(e)}</span>` +
        `<span class="topo-item-text"><span class="topo-item-name">${e.name}</span>` +
        `<span class="topo-item-sub">${e.surface}</span></span>`;
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
  kickerEl.textContent = entry.kicker;
  const caption = preview.setBoard(entry.topo, entry.preview);
  coverCaption = entry.topo ? caption : entry.badge;

  buildGameOptions(entry);
  updateLaunch();
  refreshStage();
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
      refreshStage();
    });
    gameOptionsEl.appendChild(btn);
  }
}

function updateLaunch(): void {
  const entry = entryById.get(selectedId)!;
  const gameName = entry.games.find(g => g.id === selectedGame)?.name ?? 'game';
  const withOpponent = opponent && mode === 'challenge' && !GAMES.get(selectedGame)?.soloOnly;
  playBtn.href = variantHref(mode, selectedGame, entry.topoId)
    + (withOpponent ? `&opponent=${opponent}` : '');
  playBtn.innerHTML = `Play ${gameName} <span aria-hidden="true">&rarr;</span>`;

  descEl.textContent = describe(entry);

  if (selectedGame === 'snake') {
    verdictEl.textContent = 'Single-player - steer with arrow keys or WASD';
  } else if (!entry.topo) {
    verdictEl.textContent = 'A different board, not a square topology';
  } else {
    verdictEl.textContent = '';
  }

  history.replaceState(null, '', variantSearch(selectedGame, entry.topoId)
    + (opponent ? `&opponent=${opponent}` : ''));
}

// ==================== 3D STAGE ====================
// Three views of the selected board (src/surface/stage.ts): Board (as played),
// Tiling (the board among its glued copies), Surface (folded so glued edges
// meet). Autoplay tours them; a click on a view holds it. Three.js loads
// lazily, so the picker works before the WebGL bundle arrives; the flat
// particle preview is the fallback and the only view for boards that are not
// a square quotient (hex chess, hyperbolic).
let coverCaption = '';
let currentPlanName = '';

function describe(entry: Entry): string {
  if (!entry.topo) return entry.surface;
  const t = entry.topo;
  if (selectedGame === 'go') return t.goDesc;
  if (selectedGame === 'snake') return t.snakeDesc;
  return t.chessDesc;
}

function thumbGlyph(e: Entry): string {
  if (e.topo) return '';
  if (e.preview === 'hextorus') return '';
  return e.group.toLowerCase().startsWith('hyper') ? '&#x2299;' : '&#x2B22;';
}

function stageBoardFor(entry: Entry): StageBoard | null {
  if (!surfaceKit) return null;
  const kind: PaintKind = selectedGame === 'go' ? 'go' : selectedGame === 'snake' ? 'snake' : 'chess';
  if (entry.topo) return surfaceKit.catalogBoard(entry.topo, kind);
  if (entry.preview === 'hextorus') return surfaceKit.hexTorusBoard();
  return null;
}

function viewText(v: View, board: StageBoard | null): string {
  const kinds = board ? Object.values(board.plan.edges).map(e => e.kind) : [];
  const glued = kinds.some(k => k !== 'wall' && k !== 'mirror');
  const edged = kinds.some(k => k === 'wall' || k === 'mirror');
  if (v === 'board') {
    return glued
      ? 'Board: the board as played. A piece that crosses a glued edge reappears where that edge is glued.'
      : 'Board: the board as played. No edges are glued.';
  }
  if (v === 'tiling') {
    return 'Tiling: copies of the board laid edge to edge, each turned or mirrored by its gluing. A piece leaving the board continues straight into the next copy.';
  }
  if (!glued) return 'Surface: no edges are glued, so the surface is the board itself.';
  const name = currentPlanName.replace(/^(Torus|Cylinder|Pillowcase|Folded strip|Triangular pillow)/, m => m.toLowerCase());
  return `Surface: the board folded until glued edges meet, a ${name}. ` +
    (edged ? 'Only walls and mirrors remain as edges.' : 'No edges remain.');
}

function syncViewUi(v: View): void {
  for (const btn of document.querySelectorAll<HTMLButtonElement>('#view-toggle .seg-btn')) {
    btn.classList.toggle('active', btn.dataset.view === v);
  }
  const entry = entryById.get(selectedId)!;
  viewDescEl.textContent = viewText(v, stage ? stageBoardFor(entry) : null);
}

function refreshStage(): void {
  const entry = entryById.get(selectedId)!;
  const board = stageBoardFor(entry);
  const has3d = !stageFailed && stage !== null && board !== null;
  stageEl.classList.toggle('is-3d', has3d);
  document.getElementById('view-bar')!.hidden = !has3d;
  viewDescEl.hidden = !has3d;
  if (has3d && board) {
    currentPlanName = board.plan.name;
    stage!.setBoard(board);
    badgeEl.textContent = board.plan.name;
    syncViewUi(stage!.view());
  } else {
    badgeEl.textContent = coverCaption;
  }
}

function syncPlayButton(): void {
  const on = stage?.autoplaying() ?? true;
  viewPlay.classList.toggle('paused', !on);
  viewPlay.setAttribute('aria-label', on ? 'Pause the tour of views' : 'Resume the tour of views');
  viewPlay.title = on ? 'Pause tour' : 'Resume tour';
}

async function mountStage(): Promise<void> {
  try {
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('no WebGL');
    const [stageMod, boards] = await Promise.all([import('./surface/stage'), import('./surface/boards')]);
    surfaceKit = boards;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    stage = stageMod.createStage(surfaceCanvas, {
      autoplay: !reduced,
      initialView: reduced ? 'surface' : 'board',
      autoSpin: reduced ? 0 : undefined,
      onView: syncViewUi,
    });
    for (const btn of document.querySelectorAll<HTMLButtonElement>('#view-toggle .seg-btn')) {
      btn.addEventListener('click', () => {
        stage!.setAutoplay(false);
        stage!.setView(btn.dataset.view as View);
        syncPlayButton();
      });
    }
    viewPlay.addEventListener('click', () => {
      stage!.setAutoplay(!stage!.autoplaying());
      syncPlayButton();
    });
    surfaceCanvas.addEventListener('pointerdown', () => stageEl.classList.add('touched'), { once: true });
    refreshStage();
    syncPlayButton();
    void renderThumbs(stageMod, boards);
  } catch {
    stageFailed = true;
    refreshStage();
  }
}

// Tiny 3D icons for the board list, rendered once each on a hidden stage.
async function renderThumbs(stageMod: typeof import('./surface/stage'), boards: typeof import('./surface/boards')): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;left:-9999px;top:0;width:112px;height:112px;pointer-events:none';
  document.body.appendChild(canvas);
  const thumbStage = stageMod.createStage(canvas, { initialView: 'surface', interactive: false, autoSpin: 0 });
  const idle = () => new Promise<void>(res =>
    ('requestIdleCallback' in window ? window.requestIdleCallback(() => res()) : setTimeout(res, 16)));
  try {
    for (const e of entries) {
      const board = e.topo ? boards.catalogBoard(e.topo, 'chess') : e.preview === 'hextorus' ? boards.hexTorusBoard() : null;
      if (!board) continue;
      await idle();
      thumbStage.setBoard({ ...board, mover: undefined });
      thumbStage.renderNow();
      const url = canvas.toDataURL('image/png');
      const slot = itemEls.get(e.id)?.querySelector<HTMLElement>('.topo-thumb');
      if (slot) slot.innerHTML = `<img src="${url}" alt="">`;
    }
  } finally {
    thumbStage.destroy();
    canvas.remove();
  }
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
  opponent = params.get('opponent');
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
  void mountStage();
}

boot();
