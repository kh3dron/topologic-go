// A topology is a quotient of the infinite plane: project() maps any plane
// coordinate onto the canonical board (null = wall / off-board). All game
// logic and rendering derive from this one function:
//   - Go adjacency: project the four plane neighbors
//   - chess sliders: walk in the plane, projecting each step
//   - tessellated rendering: plane cell (R,C) displays board cell project(R,C)
//   - overlay orientation labels: derived by probing project()

export interface TopologyLink {
  label: string;
  url: string;
}

export interface TopologyFormal {
  group: string;      // wallpaper or frieze group, IUC notation
  orbifold: string;   // Conway orbifold signature
  surface: string;    // the quotient surface, colloquially
  orientable: boolean;
}

export interface Topology {
  id: string;
  name: string;
  chessDesc: string;
  goDesc: string;
  snakeDesc: string;
  article: string;
  links: TopologyLink[];
  formal: TopologyFormal;
  spec: string[];
  tessellated: boolean;
  // wrap period along each axis, in board-lengths; null = wall (no tiling on that axis)
  periodX: number | null;
  periodY: number | null;
  project(row: number, col: number, size: number): [number, number] | null;
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

export const TOPOLOGIES: Topology[] = [
  {
    id: 'classic',
    name: 'Classic',
    chessDesc: 'Standard chess rules.',
    goDesc: 'Standard Go rules on a 19x19 board.',
    snakeDesc: 'Every edge is a lethal wall - run into any boundary and it is game over. Plain snake.',
    article: 'The baseline: a bounded board where edges and corners are real. Every other mode on this site changes only one thing - what happens when you cross an edge - and keeps the rules of the game itself intact.',
    links: [
      { label: 'Chess (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Chess' },
      { label: 'Go (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Go_(game)' },
    ],
    formal: { group: '-', orbifold: '-', surface: 'square with boundary', orientable: true },
    spec: ['ALL EDGES: WALL'],
    tessellated: false,
    periodX: null,
    periodY: null,
    project(r, c, size) {
      return r >= 0 && r < size && c >= 0 && c < size ? [r, c] : null;
    },
  },
  {
    id: 'torus',
    name: 'Torus',
    chessDesc: 'Both edge pairs wrap around - the board is a torus.',
    goDesc: 'Stones wrap around all edges - a boundless board.',
    snakeDesc: 'No walls anywhere: cross any edge and reappear on the opposite side. The only way to die is to bite yourself.',
    article: 'Glue the left edge to the right and the top to the bottom and you get a flat torus - the surface of a donut with no curvature. There are no corners and no edges at all: in Go the cheap corner territory disappears entirely, and in chess there is no back rank to hide a king on.',
    links: [
      { label: 'Torus (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Torus' },
      { label: 'Quotient space (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Quotient_space_(topology)' },
    ],
    formal: { group: 'p1', orbifold: 'o', surface: 'torus T2', orientable: true },
    spec: ['LEFT <-> RIGHT: WRAP', 'TOP <-> BOTTOM: WRAP'],
    tessellated: true,
    periodX: 1,
    periodY: 1,
    project(r, c, size) {
      return [mod(r, size), mod(c, size)];
    },
  },
  {
    id: 'mirror',
    name: 'Mirror',
    chessDesc: 'Columns wrap; rows reflect at top and bottom - white backs white, black backs black.',
    goDesc: 'Columns wrap; the board reflects at top and bottom edges.',
    snakeDesc: 'The sides wrap; the top and bottom are mirrors. Leave the top heading up and you re-enter the top heading down.',
    article: 'The top and bottom edges are mirrors: cross one and you re-enter the same board flipped upside down, so the tiling alternates between the board and its reflection. Columns still wrap normally. In chess each army stands back-to-back with its own mirror image.',
    links: [
      { label: 'Reflection symmetry (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Reflection_symmetry' },
      { label: 'Wallpaper group (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Wallpaper_group' },
    ],
    formal: { group: 'pm', orbifold: '**', surface: 'annulus, two mirror boundaries', orientable: true },
    spec: ['LEFT <-> RIGHT: WRAP', 'TOP, BOTTOM: REFLECT'],
    tessellated: true,
    periodX: 1,
    periodY: 2,
    project(r, c, size) {
      const m = mod(r, 2 * size);
      return [m < size ? m : 2 * size - 1 - m, mod(c, size)];
    },
  },
  {
    id: 'windmill',
    name: 'Windmill',
    chessDesc: 'Copies of the board rotate 90 degrees around shared corners - the p4 windmill tiling.',
    goDesc: 'Copies of the board rotate 90 degrees around shared corners - the p4 windmill tiling.',
    snakeDesc: 'Every edge rotates a quarter-turn: steer straight off an edge and the snake re-enters turning 90 degrees, threading the shared corners.',
    article: 'The plane is tiled by copies of the board rotated 90 degrees around shared corners - the wallpaper group p4, orbifold signature 442. The playing surface is the quotient orbifold S2(4,4,2): a sphere with two cone points of angle pi/2 and one of angle pi. The cone points are why two opposite corners of the board are adjacent to themselves (only 2 distinct liberties in Go) and the other two corners are glued to each other.',
    links: [
      { label: 'Wallpaper group (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Wallpaper_group' },
      { label: 'Orbifold (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Orbifold' },
      { label: 'Orbifold notation (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Orbifold_notation' },
    ],
    formal: { group: 'p4', orbifold: '442', surface: 'sphere S2(4,4,2)', orientable: true },
    spec: ['ALL EDGES: ROTATE 90', 'QUOTIENT: P4 / S2(4,4,2) ORBIFOLD', 'TWO CORNERS: SELF-ADJACENT'],
    tessellated: true,
    periodX: 2,
    periodY: 2,
    project(r, c, size) {
      const u = mod(r, 2 * size);
      const v = mod(c, 2 * size);
      if (u < size && v < size) return [u, v];
      if (u < size) return [2 * size - 1 - v, u];
      if (v >= size) return [2 * size - 1 - u, 2 * size - 1 - v];
      return [v, 2 * size - 1 - u];
    },
  },
  {
    id: 'pillowcase',
    name: 'Pillowcase',
    chessDesc: 'Copies rotate 180 degrees at the side edges; top and bottom wrap - the pillowcase orbifold.',
    goDesc: 'Copies rotate 180 degrees at the side edges; top and bottom wrap - the pillowcase orbifold.',
    snakeDesc: 'The sides rotate 180 degrees while the top and bottom wrap: exit a side edge and you re-enter it upside down.',
    article: 'The half-turn sibling of the windmill: side-by-side copies are rotated 180 degrees, rows wrap normally - the wallpaper group p2, orbifold signature 2222. The quotient is the "pillowcase": a sphere with four cone points of angle pi, a surface that also shows up in the theory of translation surfaces. Cells at the cone points are adjacent to themselves.',
    links: [
      { label: 'Wallpaper group (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Wallpaper_group' },
      { label: 'Orbifold (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Orbifold' },
    ],
    formal: { group: 'p2', orbifold: '2222', surface: 'pillowcase S2(2,2,2,2)', orientable: true },
    spec: ['LEFT <-> RIGHT: ROTATE 180', 'TOP <-> BOTTOM: WRAP', 'QUOTIENT: P2 / 2222 "PILLOWCASE"'],
    tessellated: true,
    periodX: 2,
    periodY: 1,
    project(r, c, size) {
      const rr = mod(r, size);
      const cc = mod(c, 2 * size);
      return cc < size ? [rr, cc] : [size - 1 - rr, 2 * size - 1 - cc];
    },
  },
  {
    id: 'cylinder',
    name: 'Cylinder',
    chessDesc: 'Left and right edges wrap; top and bottom are walls.',
    goDesc: 'Left and right edges wrap; top and bottom are walls.',
    snakeDesc: 'The sides wrap into an endless loop; the top and bottom are lethal walls. Circle forever, but do not drift into an end.',
    article: 'Only the sides are glued: the board becomes a tube. This is the oldest topology variant of chess - cylinder chess was analyzed as early as the medieval shatranj era. Rook and queen gain enormous power on the open ring; in Go the side territory vanishes but the top and bottom edges still behave classically.',
    links: [
      { label: 'Cylinder chess (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Cylinder_chess' },
      { label: 'Cylinder (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Cylinder' },
    ],
    formal: { group: 'p1 (frieze)', orbifold: 'inf inf', surface: 'annulus with boundary', orientable: true },
    spec: ['LEFT <-> RIGHT: WRAP', 'TOP, BOTTOM: WALL'],
    tessellated: true,
    periodX: 1,
    periodY: null,
    project(r, c, size) {
      return r >= 0 && r < size ? [r, mod(c, size)] : null;
    },
  },
  {
    id: 'corridor',
    name: 'Corridor',
    chessDesc: 'Two facing mirrors: the board reflects endlessly at top and bottom; the sides are walls.',
    goDesc: 'Two facing mirrors: the board reflects endlessly at top and bottom; the sides are walls.',
    snakeDesc: 'The top and bottom are mirrors and the sides are walls: bounce vertically forever, but the left and right edges still kill.',
    article: 'The board stands between two facing mirrors, like a barbershop corridor: crossing the top or bottom edge re-enters the same board reflected, over and over, while the left and right edges stay solid walls. The vertical direction behaves like the Mirror mode; the horizontal direction like Classic.',
    links: [
      { label: 'Reflection symmetry (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Reflection_symmetry' },
      { label: 'Frieze group (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Frieze_group' },
    ],
    formal: { group: 'p1m1 (frieze)', orbifold: '*inf inf', surface: 'strip between two mirrors', orientable: true },
    spec: ['LEFT, RIGHT: WALL', 'TOP, BOTTOM: REFLECT'],
    tessellated: true,
    periodX: null,
    periodY: 2,
    project(r, c, size) {
      if (c < 0 || c >= size) return null;
      const m = mod(r, 2 * size);
      return [m < size ? m : 2 * size - 1 - m, c];
    },
  },
  {
    id: 'mobius',
    name: 'Mobius',
    chessDesc: 'Left and right edges glue with a vertical flip; top and bottom are walls - a Mobius strip.',
    goDesc: 'Left and right edges glue with a vertical flip; top and bottom are walls - a Mobius strip.',
    snakeDesc: 'The sides wrap with a flip; the top and bottom are walls. Leave the right edge low and you re-enter the left edge high.',
    article: 'A cylinder with a half-twist: travel once around the strip and you come back mirror-imaged. The Mobius strip is one-sided and non-orientable - there is no consistent notion of clockwise. A rook circling the board returns to its own rank reflected.',
    links: [
      { label: 'Mobius strip (Wikipedia)', url: 'https://en.wikipedia.org/wiki/M%C3%B6bius_strip' },
    ],
    formal: { group: 'p11g (frieze)', orbifold: 'inf x', surface: 'Mobius band with boundary', orientable: false },
    spec: ['LEFT <-> RIGHT: WRAP + FLIP', 'TOP, BOTTOM: WALL'],
    tessellated: true,
    periodX: 2,
    periodY: null,
    project(r, c, size) {
      const flipped = mod(Math.floor(c / size), 2) === 1;
      const rr = flipped ? size - 1 - r : r;
      return rr >= 0 && rr < size ? [rr, mod(c, size)] : null;
    },
  },
  {
    id: 'klein',
    name: 'Klein',
    chessDesc: 'Left and right edges glue with a vertical flip; top and bottom wrap - a Klein bottle.',
    goDesc: 'Left and right edges glue with a vertical flip; top and bottom wrap - a Klein bottle.',
    snakeDesc: 'The sides wrap with a flip and the top and bottom wrap plainly: no walls at all, but one lap across the flip axis returns you mirrored.',
    article: 'Take the Mobius gluing and additionally wrap top to bottom: the result is the Klein bottle, a closed surface with no inside or outside that cannot be built in 3D space without passing through itself. Like the torus it has no edges anywhere, but it is non-orientable: one loop around the board flips you.',
    links: [
      { label: 'Klein bottle (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Klein_bottle' },
    ],
    formal: { group: 'pg', orbifold: 'xx', surface: 'Klein bottle K2', orientable: false },
    spec: ['LEFT <-> RIGHT: WRAP + FLIP', 'TOP <-> BOTTOM: WRAP'],
    tessellated: true,
    periodX: 2,
    periodY: 1,
    project(r, c, size) {
      const flipped = mod(Math.floor(c / size), 2) === 1;
      return [mod(flipped ? size - 1 - r : r, size), mod(c, size)];
    },
  },
  {
    id: 'projective',
    name: 'Projective',
    chessDesc: 'Both edge pairs glue with a flip - the projective plane.',
    goDesc: 'Both edge pairs glue with a flip - the projective plane.',
    snakeDesc: 'Both edge pairs glue with a flip: no walls, and every straight run eventually returns to its start reversed.',
    article: 'Both pairs of opposite edges are glued with a flip - the classical square model of the real projective plane, the space of lines through the origin. Every straight path eventually returns to its start reversed. As a flat quotient it carries two cone points, so two corner cells touch themselves.',
    links: [
      { label: 'Real projective plane (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Real_projective_plane' },
      { label: 'Orbifold (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Orbifold' },
    ],
    formal: { group: 'pgg', orbifold: '22x', surface: 'projective plane RP2(2,2)', orientable: false },
    spec: ['LEFT <-> RIGHT: WRAP + FLIP', 'TOP <-> BOTTOM: WRAP + FLIP'],
    tessellated: true,
    periodX: 2,
    periodY: 2,
    project(r, c, size) {
      let rr = mod(r, size);
      let cc = mod(Math.floor(r / size), 2) === 1 ? size - 1 - c : c;
      if (mod(Math.floor(cc / size), 2) === 1) rr = size - 1 - rr;
      return [rr, mod(cc, size)];
    },
  },
];

export const TOPOLOGY_MAP = new Map(TOPOLOGIES.map(t => [t.id, t]));

// Orientation of the board copy occupying the tile whose top-left plane cell
// is (tileRow*size, tileCol*size). Derived by probing project(), so new
// topologies get correct overlay labels for free.
export interface TileOrientation {
  label: string;
  cssTransform: string;
  reflected: boolean;
  identity: boolean;
  key: string;
}

export function tileOrientation(topo: Topology, tileRow: number, tileCol: number, size: number): TileOrientation {
  const R0 = tileRow * size;
  const C0 = tileCol * size;
  const p00 = topo.project(R0, C0, size)!;
  const p10 = topo.project(R0 + 1, C0, size)!;
  const p01 = topo.project(R0, C0 + 1, size)!;

  // Linear part of the plane -> board map: board delta per display row/col step
  const er = [p10[0] - p00[0], p10[1] - p00[1]];
  const ec = [p01[0] - p00[0], p01[1] - p00[1]];
  const det = er[0] * ec[1] - er[1] * ec[0];

  // Invert to get the display direction of board vectors (for the glyph)
  const invRR = ec[1] / det, invRC = -ec[0] / det;
  const invCR = -er[1] / det, invCC = er[0] / det;
  const cssTransform = `matrix(${invCC}, ${invRC}, ${invCR}, ${invRR}, 0, 0)`;

  let label: string;
  if (det < 0) {
    label = 'REFLECTED';
  } else if (er[0] === 1) {
    label = 'ORIGINAL';
  } else if (er[0] === -1) {
    label = 'ROTATED 180';
  } else {
    label = ec[0] === -1 ? 'ROTATED 90' : 'ROTATED 270';
  }

  return {
    label,
    cssTransform,
    reflected: det < 0,
    identity: label === 'ORIGINAL',
    key: `${er[0]},${er[1]},${ec[0]},${ec[1]}`,
  };
}

// Edge-gluing coloring. Each glued boundary crossing gets a gradient value t in
// [0,1] and a scheme index, shared by the two cells the seam glues together, so
// rendering can draw matching-colored inward arrows on both sides. A flipped
// edge (Mobius) then shows its gradient reversed on the partner edge. Derived
// purely from project(), so new topologies get correct arrows for free.

// Two-color ramp per gluing pair (t=0 -> first, t=1 -> second). A square board
// has at most two glued edge pairs, so two schemes suffice. Shared by every
// renderer (board overlay + catalog preview) so gluing colors stay consistent.
export const SEAM_SCHEME_COLORS: [string, string][] = [
  ['#3b74ff', '#ff3b30'], // blue -> red
  ['#22b573', '#b25de0'], // green -> purple
];

export function seamColor(scheme: number, t: number): string {
  const [a, b] = SEAM_SCHEME_COLORS[scheme % SEAM_SCHEME_COLORS.length];
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const mix = (i: number) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t);
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}

export interface SeamColoring {
  schemeCount: number;
  // For a boundary crossing (board cell `interior` glued to board cell
  // `exterior`): t/scheme give the gradient color, `label` is a number shared by
  // the two glued cells (matching number = glued), and `onto` is true on the
  // "entry" side (arrow points onto the grid) and false on the "exit" side
  // (points off), so a piece leaves the exit edge and arrives at the entry edge.
  lookup(
    interior: [number, number] | null,
    exterior: [number, number] | null,
  ): { t: number; scheme: number; label: number; onto: boolean } | null;
}

type EdgeName = 'left' | 'right' | 'top' | 'bottom';
const EDGE_PRIORITY: Record<EdgeName, number> = { left: 0, right: 1, top: 2, bottom: 3 };

// interior/exterior plane cells for base-board edge `edge` at index i
function edgePlaneCells(edge: EdgeName, i: number, size: number): [[number, number], [number, number]] {
  switch (edge) {
    case 'left': return [[i, 0], [i, -1]];
    case 'right': return [[i, size - 1], [i, size]];
    case 'top': return [[0, i], [-1, i]];
    case 'bottom': return [[size - 1, i], [size, i]];
  }
}

function seamKey(a: [number, number], b: [number, number]): string {
  const ka = `${a[0]},${a[1]}`, kb = `${b[0]},${b[1]}`;
  return ka <= kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

export function seamColoring(topo: Topology, size: number): SeamColoring {
  interface Crossing { edge: EdgeName; index: number; interior: string; }
  // Board-cell pair {interior, exterior} identifies a seam crossing globally
  // (independent of which tile draws it); both glued cells share this key.
  const byKey = new Map<string, Crossing[]>();

  for (const edge of ['left', 'right', 'top', 'bottom'] as EdgeName[]) {
    for (let i = 0; i < size; i++) {
      const [inCell, outCell] = edgePlaneCells(edge, i, size);
      const a = topo.project(inCell[0], inCell[1], size);
      const b = topo.project(outCell[0], outCell[1], size);
      if (!a || !b) continue; // wall crossing: no arrow
      const key = seamKey(a, b);
      const crossing: Crossing = { edge, index: i, interior: `${a[0]},${a[1]}` };
      const list = byKey.get(key);
      if (list) list.push(crossing);
      else byKey.set(key, [crossing]);
    }
  }

  // Per key, the lowest-priority edge is "primary": it sets the gradient t, the
  // shared label, and the entry (onto) side; the partner crossing inherits them.
  // Scheme index groups the (at most two) gluing pairs by their primary edge so
  // each pair gets its own two-color ramp.
  const keyInfo = new Map<string, { t: number; label: number; primaryEdge: EdgeName; primaryInterior: string }>();
  for (const [key, list] of byKey) {
    let prim = list[0];
    for (const c of list) if (EDGE_PRIORITY[c.edge] < EDGE_PRIORITY[prim.edge]) prim = c;
    keyInfo.set(key, {
      t: size <= 1 ? 0.5 : prim.index / (size - 1),
      label: prim.index + 1,
      primaryEdge: prim.edge,
      primaryInterior: prim.interior,
    });
  }

  const primaryEdges = [...new Set([...keyInfo.values()].map(v => v.primaryEdge))]
    .sort((a, b) => EDGE_PRIORITY[a] - EDGE_PRIORITY[b]);
  const schemeOf = new Map<EdgeName, number>(primaryEdges.map((e, i) => [e, i]));

  return {
    schemeCount: primaryEdges.length,
    lookup(interior, exterior) {
      if (!interior || !exterior) return null;
      const info = keyInfo.get(seamKey(interior, exterior));
      if (!info) return null;
      return {
        t: info.t,
        scheme: schemeOf.get(info.primaryEdge)!,
        label: info.label,
        onto: `${interior[0]},${interior[1]}` === info.primaryInterior,
      };
    },
  };
}
