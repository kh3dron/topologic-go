// Which 3D surface a topology folds into, derived by probing project() the
// same way the overlay and particle preview are: each board edge is
// classified by where a step across it lands, and the edge pattern picks an
// embedding family. New topologies get a 3D fold for free when their edge
// pattern matches a known family; anything else stays a flat sheet with
// coloured seams.

import { Topology } from '../topology';

export const PROBE = 8;

export type EdgeName = 'left' | 'right' | 'top' | 'bottom';
export const EDGES: EdgeName[] = ['left', 'right', 'top', 'bottom'];

// wall: step leaves the board. mirror: step lands back on the same cell.
// wrap: opposite edge, same index. flip: opposite edge, reversed index.
// fold: same edge, reversed index (half-turn about the edge midpoint).
// turn: adjacent edge (quarter-turn about a corner).
export type EdgeKind = 'wall' | 'mirror' | 'wrap' | 'flip' | 'fold' | 'turn' | 'other';

export interface EdgeInfo { kind: EdgeKind; partner: EdgeName | null; }

export type SurfaceKind =
  | 'flat' | 'cylinder' | 'mobius' | 'torus' | 'klein' | 'projective' | 'purse' | 'windmill';

export interface SurfacePlan {
  kind: SurfaceKind;
  edges: Record<EdgeName, EdgeInfo>;
  // quarter turns applied to (u,v) before the canonical embedding, so every
  // family is written once with its interesting axis along columns
  rot: 0 | 1 | 3;
  foldLeft: boolean;    // purse: canonical left edge is a fold
  foldRight: boolean;   // purse: canonical right edge is a fold
  closed: boolean;      // purse: canonical top/bottom wrap (pillowcase)
  name: string;         // short surface name for captions
}

type Cell = [number, number];

function edgeCells(edge: EdgeName, i: number, n: number): [Cell, Cell] {
  switch (edge) {
    case 'left': return [[i, 0], [i, -1]];
    case 'right': return [[i, n - 1], [i, n]];
    case 'top': return [[0, i], [-1, i]];
    case 'bottom': return [[n - 1, i], [n, i]];
  }
}

const OPPOSITE: Record<EdgeName, EdgeName> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };

function same(a: Cell | null, b: Cell | null): boolean {
  return !!a && !!b && a[0] === b[0] && a[1] === b[1];
}

function classifyEdge(topo: Topology, edge: EdgeName): EdgeInfo {
  const n = PROBE;
  const i = 1;   // off-centre, so a reversed index is distinguishable
  const [inner, outer] = edgeCells(edge, i, n);
  const a = topo.project(inner[0], inner[1], n);
  const b = topo.project(outer[0], outer[1], n);
  if (!b) return { kind: 'wall', partner: null };
  if (same(a, b)) return { kind: 'mirror', partner: null };
  for (const f of EDGES) {
    for (let j = 0; j < n; j++) {
      const [fi, fo] = edgeCells(f, j, n);
      if (fi[0] !== b[0] || fi[1] !== b[1]) continue;
      if (!same(topo.project(fo[0], fo[1], n), a)) continue;
      if (f === edge) return { kind: j === n - 1 - i ? 'fold' : 'other', partner: f };
      if (f === OPPOSITE[edge]) {
        if (j === i) return { kind: 'wrap', partner: f };
        if (j === n - 1 - i) return { kind: 'flip', partner: f };
        return { kind: 'other', partner: f };
      }
      return { kind: 'turn', partner: f };
    }
  }
  return { kind: 'other', partner: null };
}

const unglued = (k: EdgeKind) => k === 'wall' || k === 'mirror';

export function planSurface(topo: Topology): SurfacePlan {
  const edges = {} as Record<EdgeName, EdgeInfo>;
  for (const e of EDGES) edges[e] = classifyEdge(topo, e);
  const L = edges.left.kind, R = edges.right.kind, T = edges.top.kind, B = edges.bottom.kind;
  const plan: SurfacePlan = {
    kind: 'flat', edges, rot: 0, foldLeft: false, foldRight: false, closed: false, name: 'Square',
  };
  const H = L === R && (L === 'wrap' || L === 'flip') ? L : null;
  const V = T === B && (T === 'wrap' || T === 'flip') ? T : null;
  const hFree = unglued(L) && unglued(R);
  const vFree = unglued(T) && unglued(B);
  const hFold = (L === 'fold' || unglued(L)) && (R === 'fold' || unglued(R)) && (L === 'fold' || R === 'fold');
  const vFold = (T === 'fold' || unglued(T)) && (B === 'fold' || unglued(B)) && (T === 'fold' || B === 'fold');

  const set = (kind: SurfaceKind, rot: 0 | 1 | 3, name: string) => {
    plan.kind = kind; plan.rot = rot; plan.name = name;
  };

  if (H === 'wrap' && V === 'wrap') set('torus', 0, 'Torus');
  else if (H === 'flip' && V === 'wrap') set('klein', 0, 'Klein bottle');
  else if (V === 'flip' && H === 'wrap') set('klein', 1, 'Klein bottle');
  else if (H === 'flip' && V === 'flip') set('projective', 0, "Boy's surface");
  else if (H === 'wrap' && vFree) set('cylinder', 0, 'Cylinder');
  else if (V === 'wrap' && hFree) set('cylinder', 1, 'Cylinder');
  else if (H === 'flip' && vFree) set('mobius', 0, 'Mobius band');
  else if (V === 'flip' && hFree) set('mobius', 1, 'Mobius band');
  else if (hFold && (V === 'wrap' || vFree)) {
    set('purse', 0, V === 'wrap' ? 'Pillowcase' : 'Folded strip');
    plan.foldLeft = L === 'fold'; plan.foldRight = R === 'fold'; plan.closed = V === 'wrap';
  } else if (vFold && (H === 'wrap' || hFree)) {
    // rot 1 maps canonical left/right onto top/bottom
    set('purse', 1, H === 'wrap' ? 'Pillowcase' : 'Folded strip');
    plan.foldLeft = T === 'fold'; plan.foldRight = B === 'fold'; plan.closed = H === 'wrap';
  } else if ([L, R, T, B].every(k => k === 'turn')) {
    // canonical windmill glues right<->bottom and top<->left (fold along the
    // TL-BR diagonal); the other diagonal is a quarter turn away
    set('windmill', edges.right.partner === 'bottom' ? 0 : 3, 'Triangular pillow');
  } else if (hFree && vFree) {
    set('flat', 0, 'Square');
  }
  return plan;
}
