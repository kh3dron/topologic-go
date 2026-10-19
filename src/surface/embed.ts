// Fold embeddings: board point (u,v) in [0,1]^2 (u = column, v = row) at fold
// progress t in [0,1] -> 3D point (Y up). t = 0 is the flat board lying on the
// floor; t = 1 is the glued surface. Every family is written once in a
// canonical frame (interesting axis along columns) and rotated by plan.rot.
// Shapes are unnormalised; the stage recentres and rescales each frame.

import { SurfacePlan } from './plan';

export type V3 = [number, number, number];

const TAU = Math.PI * 2;
const L = 2;   // flat sheet spans [-1, 1] on both axes

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// smoothstep on a sub-interval of the timeline
function seg(t: number, a: number, b: number): number {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
}

// Roll a straight coordinate s in [-len/2, len/2] into an arc of 2*pi*f
// radians, keeping arc length. Returns [along, up]; the ends curl downward so
// the board's face ends up outside, and at f = 1 the arc is a closed circle
// centred on the origin.
function roll(s: number, f: number, len: number): [number, number] {
  if (f < 1e-4) return [s, 0];
  const r = len / (TAU * f);
  const a = s / r;
  return [r * Math.sin(a), f * len / TAU - r * (1 - Math.cos(a))];
}

// Bend the X axis into a horizontal arc (XZ plane) of 2*pi*f radians.
// Returns the axis point and its outward normal (unit, XZ plane).
function bendAxis(x: number, f: number, len: number): { c: V3; n: V3 } {
  if (f < 1e-4) return { c: [x, 0, 0], n: [0, 0, 1] };
  const r = len / (TAU * f);
  const th = x / r;
  const s = Math.sin(th), co = Math.cos(th);
  return { c: [r * s, 0, -r + r * co + f * len / TAU], n: [s, 0, co] };
}

function lerp3(a: V3, b: V3, k: number): V3 {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

function flat(u: number, v: number): V3 {
  return [(u - 0.5) * L, 0, (v - 0.5) * L];
}

function cylinder(u: number, v: number, t: number): V3 {
  const [x, y] = roll((u - 0.5) * L, seg(t, 0, 1), L);
  return [x, y, (v - 0.5) * L];
}

// rows roll into the tube cross-section; columns run along the tube
function tube(u: number, v: number, f: number): V3 {
  const [z, y] = roll((v - 0.5) * L, f, L);
  return [(u - 0.5) * L, y, z];
}

function torus(u: number, v: number, t: number): V3 {
  const f1 = seg(t, 0, 0.5);
  const f2 = seg(t, 0.45, 1);
  const [z0, y0] = roll((v - 0.5) * L, f1, L);
  // spin the tube half a turn while it bends, so the seam where the two back
  // ranks meet ends up on top of the ring
  const sp = Math.PI * f2, cs = Math.cos(sp), sn = Math.sin(sp);
  const cz = z0 * cs - y0 * sn, cy = z0 * sn + y0 * cs;
  const stretch = 1 + 1.4 * f2;   // fatten the ring so the hole stays open
  const { c, n } = bendAxis((u - 0.5) * L * stretch, f2, L * stretch);
  return [c[0] + n[0] * cz, c[1] + cy, c[2] + n[2] * cz];
}

function mobius(u: number, v: number, t: number): V3 {
  const f = seg(t, 0, 1);
  const stretch = 1 + 2 * f;
  const x = (u - 0.5) * L;
  const w = (v - 0.5) * L * (1 - 0.4 * f);
  const { c, n } = bendAxis(x * stretch, f, L * stretch);
  const a = f * Math.PI * (x / L);   // half twist spread over the length
  const ca = Math.cos(a), sa = Math.sin(a);
  return [c[0] + w * ca * n[0], c[1] + w * sa, c[2] + w * ca * n[2]];
}

// Classic Klein bottle immersion. bu runs along the tube, bv around it; the
// tube ends meet with bv -> pi - bv, which is the board's row flip.
function bottle(u: number, v: number): V3 {
  const bu = u * Math.PI;
  const bv = Math.PI / 2 - TAU * (v - 0.5);
  const cu = Math.cos(bu), su = Math.sin(bu), cv = Math.cos(bv), sv = Math.sin(bv);
  const c2 = cu * cu, c3 = c2 * cu, c4 = c2 * c2, c5 = c4 * cu, c6 = c4 * c2, c7 = c6 * cu;
  const x = (-2 / 15) * cu * (3 * cv - 30 * su + 90 * c4 * su - 60 * c6 * su + 5 * cu * cv * su);
  const y = (-1 / 15) * su * (3 * cv - 3 * c2 * cv - 48 * c4 * cv + 48 * c6 * cv - 60 * su
    + 5 * cu * cv * su - 5 * c3 * cv * su - 80 * c5 * cv * su + 80 * c7 * cv * su);
  const z = (2 / 15) * (3 + 5 * cu * su) * sv;
  // stand the bottle upright: its profile lies in x/y, with y the long axis
  return [x * 0.42, -(y - 2) * 0.42, z * 0.42];
}

function klein(u: number, v: number, t: number): V3 {
  const f1 = seg(t, 0, 0.45);
  const f2 = seg(t, 0.4, 1);
  return lerp3(tube(u, v, f1), bottle(u, v), f2);
}

// Square -> disk (elliptical grid map); odd-symmetric, so antipodal boundary
// points of the square stay antipodal on the circle.
function squareToDisk(x: number, y: number): [number, number] {
  return [x * Math.sqrt(1 - (y * y) / 2), y * Math.sqrt(1 - (x * x) / 2)];
}

// Bryant-Kusner parametrisation of Boy's surface over the unit disk; w and -w
// on the boundary circle land on the same point, which is exactly the
// projective plane's antipodal gluing.
function boy(dx: number, dy: number): V3 {
  // complex helpers on [re, im]
  const mul = (a: number[], b: number[]) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const div = (a: number[], b: number[]) => {
    const d = b[0] * b[0] + b[1] * b[1];
    return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
  };
  const w = [dx, dy];
  const w2 = mul(w, w), w3 = mul(w2, w), w4 = mul(w2, w2), w6 = mul(w3, w3);
  const s5 = Math.sqrt(5);
  const den = [w6[0] + s5 * w3[0] - 1, w6[1] + s5 * w3[1]];
  const g1 = -1.5 * div(mul(w, [1 - w4[0], -w4[1]]), den)[1];
  const g2 = -1.5 * div(mul(w, [1 + w4[0], w4[1]]), den)[0];
  const g3 = div([1 + w6[0], w6[1]], den)[1] - 0.5;
  const g = g1 * g1 + g2 * g2 + g3 * g3;
  return [(g1 / g) * 0.75, (g3 / g + 0.6) * 0.75, (g2 / g) * 0.75];
}

function projective(u: number, v: number, t: number): V3 {
  const f1 = seg(t, 0, 0.35);
  const f2 = seg(t, 0.3, 1);
  const x = 2 * u - 1, y = 2 * v - 1;
  const [dx, dy] = squareToDisk(x, y);
  const sheet: V3 = [x + (dx - x) * f1, 0, y + (dy - y) * f1];
  if (f2 <= 0) return sheet;
  // stop a hair short of the boundary so the antipodal seam stays finite
  const k = 0.9999;
  return lerp3(sheet, boy(dx * k, dy * k), f2);
}

// Folded edges (half-turn about the edge midpoint): roll the rows into a
// tube (closed when the rows also wrap, a gutter otherwise), then pinch each
// folded end flat so row v meets row 1-v.
function purse(u: number, v: number, t: number, plan: SurfacePlan): V3 {
  const f1 = seg(t, 0, 0.5);
  const f2 = seg(t, 0.45, 1);
  const frac = plan.closed ? 1 : 0.72;
  const [cz, cy] = roll((v - 0.5) * L, f1 * frac, L);
  let k: number;
  if (plan.foldLeft && plan.foldRight) k = Math.sin(Math.PI * u);
  else if (plan.foldRight) k = Math.cos((Math.PI / 2) * u);
  else k = Math.sin((Math.PI / 2) * u);
  k = Math.pow(Math.max(0, k), 0.45);
  const pinch = 1 + (k - 1) * f2;
  return [(u - 0.5) * L, cy, cz * pinch];
}

// Quarter-turn gluings (right<->bottom, top<->left): fold the board along its
// TL-BR diagonal so glued edges meet, then inflate the doubled triangle.
function windmill(u: number, v: number, t: number): V3 {
  const f1 = seg(t, 0, 0.55);
  const f2 = seg(t, 0.5, 1);
  const x = u - 0.5, y = v - 0.5;
  const s2 = Math.SQRT1_2;
  const a = (x + y) * s2;      // along the diagonal, d = (1,1)/sqrt2 in (X,Z)
  const b = (x - y) * s2;      // across it, n = (1,-1)/sqrt2
  const th = Math.PI * f1;
  const top = b > 0;
  const bc = top ? b * Math.cos(th) : b;
  const by = top ? b * Math.sin(th) : 0;
  // distances to the doubled triangle's three sides, in the folded half
  const uu = top ? v : u, vv = top ? u : v;
  const d1 = Math.max(0, vv - uu), d2 = Math.max(0, uu), d3 = Math.max(0, 1 - vv);
  const bump = 3 * Math.cbrt(d1 * d2 * d3);
  const h = 0.55 * f2 * bump * (top ? 1 : -1);
  return [(a + bc) * s2 * L, by * L + h, (a - bc) * s2 * L];
}

function canonical(plan: SurfacePlan, u: number, v: number, t: number): V3 {
  switch (plan.kind) {
    case 'cylinder': return cylinder(u, v, t);
    case 'torus': return torus(u, v, t);
    case 'mobius': return mobius(u, v, t);
    case 'klein': return klein(u, v, t);
    case 'projective': return projective(u, v, t);
    case 'purse': return purse(u, v, t, plan);
    case 'windmill': return windmill(u, v, t);
    default: return flat(u, v);
  }
}

export function embed(plan: SurfacePlan, u: number, v: number, t: number): V3 {
  if (plan.rot === 0) return canonical(plan, u, v, t);
  if (plan.rot === 1) {
    const p = canonical(plan, v, 1 - u, t);
    return [-p[2], p[1], p[0]];
  }
  const p = canonical(plan, 1 - v, u, t);
  return [p[2], p[1], -p[0]];
}
