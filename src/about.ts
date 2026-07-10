import { TOPOLOGIES, Topology } from './topology';
import { setTopology } from './state';
import { CHESS_SIZE, chessGameOver, resetChess } from './chess';
import { GO_SIZE } from './go';

// ==================== CENSUS ====================
// MOVE-0 is evaluated by actually running the chess engine on each topology;
// singular cells are counted from project(). Only the formal classification
// is authored by hand. Verdict is derived, never assigned.

function singularCellCount(topo: Topology, size: number): number {
  let count = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const p = topo.project(r + dr, c + dc, size);
        if (p && p[0] === r && p[1] === c) {
          count++;
          break;
        }
      }
    }
  }
  return count;
}

function chessMoveZero(topo: Topology): string {
  setTopology(topo.id);
  resetChess();
  if (chessGameOver === 'draw') return 'STALEMATE AT MOVE 0';
  if (chessGameOver) return `${chessGameOver.toUpperCase()} WINS AT MOVE 0`;
  return 'PLAYABLE';
}

function verdict(dead: boolean, singular: number, orientable: boolean): string {
  if (dead) return 'DEAD';
  if (singular > 0 || !orientable) return 'QUIRKS';
  return 'OK';
}

function buildCensus(): void {
  const table = document.getElementById('census-table')!;
  const header = ['GAME', 'ROUTE', 'NAME', 'GROUP', 'ORBIFOLD', 'SURFACE', 'MOVE-0', 'SING. CELLS', 'ORIENT.', 'VERDICT'];

  const rows: string[][] = [];
  for (const game of ['chess', 'go'] as const) {
    const size = game === 'chess' ? CHESS_SIZE : GO_SIZE;
    for (const topo of TOPOLOGIES) {
      const singular = singularCellCount(topo, size);
      const moveZero = game === 'chess' ? chessMoveZero(topo) : 'PLAYABLE';
      const dead = moveZero !== 'PLAYABLE';
      rows.push([
        game.toUpperCase(),
        topo.id,
        topo.name.toUpperCase(),
        topo.formal.group,
        topo.formal.orbifold,
        topo.formal.surface,
        moveZero,
        String(singular),
        topo.formal.orientable ? 'Y' : 'N',
        verdict(dead, singular, topo.formal.orientable),
      ]);
    }
  }
  setTopology('classic');

  table.innerHTML =
    '<thead><tr>' + header.map(h => `<th>${h}</th>`).join('') + '</tr></thead>' +
    '<tbody>' + rows.map(row =>
      '<tr>' + row.map((cell, i) =>
        i === row.length - 1
          ? `<td class="verdict-${cell.toLowerCase()}">${cell}</td>`
          : `<td>${cell}</td>`
      ).join('') + '</tr>'
    ).join('') + '</tbody>';
}

// ==================== CATALOG ====================
function buildCatalog(): void {
  const catalog = document.getElementById('catalog')!;

  TOPOLOGIES.forEach((topo, i) => {
    const entry = document.createElement('article');
    entry.className = 'catalog-entry';

    const heading = document.createElement('h3');
    heading.textContent = `4.${i + 1} ${topo.name}`;
    entry.appendChild(heading);

    const spec = document.createElement('div');
    spec.className = 'catalog-spec';
    spec.innerHTML = topo.spec.map(line => `<span class="spec-line">${line}</span>`).join('');
    entry.appendChild(spec);

    const body = document.createElement('p');
    body.textContent = topo.article;
    entry.appendChild(body);

    if (topo.links.length > 0) {
      const links = document.createElement('div');
      links.className = 'catalog-links';
      links.innerHTML = 'References: ' + topo.links
        .map(link => `<a href="${link.url}" target="_blank" rel="noopener">${link.label}</a>`)
        .join(' · ');
      entry.appendChild(links);
    }

    catalog.appendChild(entry);
  });
}

buildCensus();
buildCatalog();
