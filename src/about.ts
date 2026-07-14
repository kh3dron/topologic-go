import { TOPOLOGIES } from './topology';
import { setTopology } from './state';
import { CHESS_SIZE } from './chess';
import { GO_SIZE } from './go';
import { chessMoveZero, singularCellCount, verdict } from './census';
import { mountVersionBadge } from './version';

mountVersionBadge();

// ==================== CENSUS ====================
// The classification helpers live in census.ts (shared with the landing
// catalog). This page renders the full table; verdict is derived, never
// assigned.

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
