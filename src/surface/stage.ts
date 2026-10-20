// Three.js stage showing a board in one of three views, with animated
// transitions between them:
//   board   - the n x n board as played; gluings are invisible
//   tiling  - the board plus neighbouring copies, each mapped by the gluing
//             (the universal cover); pieces move straight through the copies
//   surface - the board folded so glued edges meet (embed(plan, u, v, 1))
// The mesh is re-embedded every frame from embed(plan, u, v, fold), so one
// code path runs the fold animation, the catalog autoplay, and the live
// in-game view. Walls and mirrors are drawn as tubes; glued edges show as a
// neutral outline in the tiling and only flash while they zip shut.
// An optional mover (a chess piece, a short snake) walks the grid in plane
// coordinates; every displayed copy of it is placed through the continuous
// extension of project(), so it crosses gluings exactly as the game does.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Topology } from '../topology';
import { embed, V3 } from './embed';
import { EDGES, EdgeName, SurfacePlan } from './plan';

const GRID = 84;               // mesh resolution per side
const EDGE_SEGS = 96;
const TEX_PX = 1024;
const N = 8;                   // probe board size for tiles and movers
const RINGS = 2;               // ghost tile rings in the tiling view
const FIT_RADIUS = 1.45;
const DECAL = 0.42;            // mover half-size, in cells
const DECAL_SEGS = 4;

export type View = 'board' | 'tiling' | 'surface';

// Autoplay: board -> surface -> tiling -> surface -> ..., holding each.
const SEQUENCE: View[] = ['board', 'surface', 'tiling', 'surface'];
const HOLD: Record<View, number> = { board: 2.4, tiling: 4, surface: 5 };
const FOLD_SECONDS = 2.8;
const FADE_SECONDS = 0.9;

export interface MoverSpec {
  sprites: HTMLCanvasElement[];   // [head, body]; body reused for every trailing segment
  chain: number;                  // 1 = a single piece, >1 = a snake
  step: number;                   // seconds per cell
  pause: number;                  // seconds between straight runs (0 = continuous)
  free(row: number, col: number): boolean;   // board cell may be entered
}

export interface StageBoard {
  plan: SurfacePlan;
  topo: Topology | null;          // null: no tiling copies or mover (boards without project())
  paint(ctx: CanvasRenderingContext2D, px: number): void;
  mover?: MoverSpec;
}

export interface StageOptions {
  autoplay?: boolean;             // cycle the views (catalog)
  initialView?: View;
  interactive?: boolean;          // drag to rotate
  autoSpin?: number;              // radians / second while idle
  distance?: number;              // camera distance (default 6.4)
  onView?(view: View): void;      // a transition toward `view` started
}

export interface Stage {
  setBoard(board: StageBoard): void;
  repaint(): void;                // re-run the board's paint() into the texture
  setView(view: View, animate?: boolean): void;
  view(): View;
  setAutoplay(on: boolean): void;
  autoplaying(): boolean;
  resize(): void;
  renderNow(): void;              // one synchronous frame, visible or not
  pick(clientX: number, clientY: number): [number, number] | null;   // board (u, v) under a point
  destroy(): void;
}

function smooth(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}

// Rigid map of the tile containing plane point (y, x) (cell units): board
// position of the point plus the board images of the plane's unit x / y
// steps. Null past a wall.
interface TileMap { row: number; col: number; ex: [number, number]; ey: [number, number]; }

function tileMap(topo: Topology, y: number, x: number): TileMap | null {
  const R0 = Math.floor(y / N) * N;
  const C0 = Math.floor(x / N) * N;
  const p00 = topo.project(R0, C0, N);
  const p10 = topo.project(R0 + 1, C0, N);
  const p01 = topo.project(R0, C0 + 1, N);
  if (!p00 || !p10 || !p01) return null;
  const ey: [number, number] = [p10[0] - p00[0], p10[1] - p00[1]];
  const ex: [number, number] = [p01[0] - p00[0], p01[1] - p00[1]];
  const oy = y - R0 - 0.5, ox = x - C0 - 0.5;
  return {
    row: p00[0] + 0.5 + ey[0] * oy + ex[0] * ox,
    col: p00[1] + 0.5 + ey[1] * oy + ex[1] * ox,
    ex, ey,
  };
}

// ---- grid walker: integer plane cells, straight runs, gluings via project() ----
interface Walker {
  hist: [number, number][];       // plane cells, newest first; hist[0] is the step target
  stepT: number;                  // progress of the current step, 0..1
  runLeft: number;                // steps left in the current run
  dir: [number, number];
  pauseLeft: number;
  rng: () => number;
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function createStage(canvas: HTMLCanvasElement, opts: StageOptions = {}): Stage {
  const interactive = opts.interactive ?? true;
  const autoSpin = opts.autoSpin ?? 0.16;
  const distance = opts.distance ?? 6.4;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
  camera.position.set(0, 0, distance);

  scene.add(new THREE.HemisphereLight(0xdde6ff, 0x2a1a10, 0.55));
  const key = new THREE.DirectionalLight(0xfff1e0, 1.05);
  key.position.set(4, 4, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9db6ff, 0.8);
  rim.position.set(-4, 1.5, -4);
  scene.add(rim);

  const pivot = new THREE.Group();     // user / auto rotation
  scene.add(pivot);
  const body = new THREE.Group();      // recentred + rescaled surface
  pivot.add(body);

  // ---- surface mesh ----
  const vertCount = (GRID + 1) * (GRID + 1);
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const index: number[] = [];
  for (let j = 0; j <= GRID; j++) {
    for (let i = 0; i <= GRID; i++) {
      const k = j * (GRID + 1) + i;
      uvs[k * 2] = i / GRID;
      uvs[k * 2 + 1] = 1 - j / GRID;
      if (i < GRID && j < GRID) {
        const a = k, b = k + 1, c = k + GRID + 1, d = c + 1;
        index.push(a, c, b, b, c, d);
      }
    }
  }
  geom.setIndex(index);
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

  const texCanvas = document.createElement('canvas');
  texCanvas.width = texCanvas.height = TEX_PX;
  const texCtx = texCanvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(texCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const front = new THREE.MeshStandardMaterial({
    map: texture, side: THREE.FrontSide, roughness: 0.7, metalness: 0.0, envMapIntensity: 0.35,
  });
  // the reverse face is tinted cool, so a non-orientable surface visibly
  // swaps faces across its orientation-reversing seam
  const back = new THREE.MeshStandardMaterial({
    map: texture, side: THREE.BackSide, roughness: 0.65, metalness: 0.0,
    color: new THREE.Color(0.55, 0.64, 0.9), envMapIntensity: 0.5,
  });
  const frontMesh = new THREE.Mesh(geom, front);
  const backMesh = new THREE.Mesh(geom, back);
  body.add(frontMesh);
  body.add(backMesh);
  const raycaster = new THREE.Raycaster();

  // ---- edge tubes ----
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x24262c, roughness: 0.8, metalness: 0.1 });
  const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.08, metalness: 1.0, envMapIntensity: 1.6 });
  const seamMat = new THREE.MeshBasicMaterial({ color: 0xf2ece0, transparent: true, opacity: 0, depthWrite: false });
  const edgeMeshes = new Map<EdgeName, THREE.Mesh>();
  for (const e of EDGES) {
    const m = new THREE.Mesh(new THREE.BufferGeometry(), seamMat);
    edgeMeshes.set(e, m);
    body.add(m);
  }

  // ---- ghost tiles: neighbouring copies of the board on the flat sheet ----
  interface Ghost {
    mat: THREE.MeshBasicMaterial;
    base: number;
    // plane -> board linear part of this tile and its inverse, for mover copies
    cy: number; cx: number; p0: [number, number];
    L: [number, number, number, number];      // board = p0 + L * (plane - c), rows (dy, dx)
  }
  const ghostGroup = new THREE.Group();
  body.add(ghostGroup);
  const ghosts: Ghost[] = [];

  function buildGhosts(topo: Topology | null): void {
    for (const m of ghostGroup.children as THREE.Mesh[]) m.geometry.dispose();
    ghostGroup.clear();
    for (const g of ghosts) g.mat.dispose();
    ghosts.length = 0;
    if (!topo) return;
    for (let tr = -RINGS; tr <= RINGS; tr++) {
      for (let tc = -RINGS; tc <= RINGS; tc++) {
        if (tr === 0 && tc === 0) continue;
        const cy = (tr + 0.5) * N, cx = (tc + 0.5) * N;
        const m = tileMap(topo, cy, cx);
        if (!m) continue;
        const uvAt = (y: number, x: number): [number, number] => {
          const dy = y - cy, dx = x - cx;
          const row = m.row + m.ey[0] * dy + m.ex[0] * dx;
          const col = m.col + m.ey[1] * dy + m.ex[1] * dx;
          return [col / N, 1 - row / N];
        };
        const ys = [tr * N, (tr + 1) * N], xs = [tc * N, (tc + 1) * N];
        const pos: number[] = [], uv: number[] = [];
        for (const y of ys) for (const x of xs) {
          pos.push((x / N - 0.5) * 2, -0.002, (y / N - 0.5) * 2);
          uv.push(...uvAt(y, x));
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setIndex([0, 2, 1, 1, 2, 3]);
        const ring = Math.max(Math.abs(tr), Math.abs(tc));
        const base = ring === 1 ? (tr === 0 || tc === 0 ? 0.72 : 0.6) : 0.38;
        const mat = new THREE.MeshBasicMaterial({
          map: texture, transparent: true, opacity: 0, depthWrite: false,
          side: THREE.DoubleSide, color: new THREE.Color(0.8, 0.82, 0.88),
        });
        ghosts.push({
          mat, base, cy, cx, p0: [m.row, m.col],
          L: [m.ey[0], m.ex[0], m.ey[1], m.ex[1]],
        });
        ghostGroup.add(new THREE.Mesh(g, mat));
      }
    }
  }

  // ---- mover: decals on the surface (base copy) and on each ghost tile ----
  const moverGroup = new THREE.Group();
  body.add(moverGroup);
  interface Decal { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; pos: Float32Array; }
  let baseDecals: Decal[] = [];
  let ghostDecals: Decal[][] = [];     // [chain index][ghost index]
  let spriteTextures: THREE.CanvasTexture[] = [];
  let walker: Walker | null = null;

  function makeDecal(tex: THREE.Texture, segs: number): Decal {
    const verts = (segs + 1) * (segs + 1);
    const pos = new Float32Array(verts * 3);
    const uv = new Float32Array(verts * 2);
    const idx: number[] = [];
    for (let j = 0; j <= segs; j++) {
      for (let i = 0; i <= segs; i++) {
        const k = j * (segs + 1) + i;
        uv[k * 2] = i / segs;
        uv[k * 2 + 1] = 1 - j / segs;
        if (i < segs && j < segs) {
          const a = k, b = k + 1, c = k + segs + 1, d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    moverGroup.add(mesh);
    return { mesh, mat, pos };
  }

  function buildMover(b: StageBoard): void {
    for (const m of moverGroup.children as THREE.Mesh[]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    moverGroup.clear();
    for (const t of spriteTextures) t.dispose();
    spriteTextures = [];
    baseDecals = [];
    ghostDecals = [];
    walker = null;
    const spec = b.mover;
    if (!spec || !b.topo) return;
    spriteTextures = spec.sprites.map(c => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    });
    for (let i = 0; i < spec.chain; i++) {
      const tex = spriteTextures[Math.min(i, spriteTextures.length - 1)];
      baseDecals.push(makeDecal(tex, DECAL_SEGS));
      ghostDecals.push(ghosts.map(() => makeDecal(tex, 1)));
    }
    // start on a free cell near the centre
    const rng = lcg(0x9e3779b9 ^ b.topo.id.length * 7919);
    let start: [number, number] = [4, 4];
    for (const [r, c] of [[4, 3], [3, 4], [4, 4], [3, 3], [2, 2], [5, 5], [2, 5], [5, 2]]) {
      if (spec.free(r, c)) { start = [r, c]; break; }
    }
    walker = {
      hist: Array.from({ length: spec.chain + 1 }, () => [start[0], start[1]] as [number, number]),
      stepT: 1, runLeft: 0, dir: [0, 1], pauseLeft: 0.6, rng,
    };
  }

  function cellOk(topo: Topology, spec: MoverSpec, R: number, C: number): boolean {
    const p = topo.project(R, C, N);
    return !!p && spec.free(p[0], p[1]);
  }

  function planRun(topo: Topology, spec: MoverSpec, w: Walker): void {
    const dirs: [number, number][] = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(w.rng() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    // prefer horizontal runs for single pieces: rank crossings read best
    if (spec.chain === 1) dirs.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const [R, C] = w.hist[0];
    const want = spec.chain === 1 ? 4 + Math.floor(w.rng() * 7) : 2 + Math.floor(w.rng() * 6);
    for (const d of dirs) {
      if (spec.chain > 1 && d[0] === -w.dir[0] && d[1] === -w.dir[1]) continue;   // snakes never reverse
      let k = 0;
      while (k < want && cellOk(topo, spec, R + d[0] * (k + 1), C + d[1] * (k + 1))) k++;
      if (k >= Math.min(2, want)) { w.dir = d; w.runLeft = k; return; }
    }
    w.runLeft = 0;
  }

  function advanceWalker(dt: number): void {
    const b = board;
    const w = walker;
    if (!b || !b.topo || !b.mover || !w) return;
    const spec = b.mover;
    let left = dt;
    while (left > 0) {
      if (w.stepT < 1) {
        const need = (1 - w.stepT) * spec.step;
        const use = Math.min(need, left);
        w.stepT += use / spec.step;
        left -= use;
        continue;
      }
      if (w.pauseLeft > 0) {
        const use = Math.min(w.pauseLeft, left);
        w.pauseLeft -= use;
        left -= use;
        continue;
      }
      if (w.runLeft <= 0) {
        planRun(b.topo, spec, w);
        if (w.runLeft <= 0) { w.pauseLeft = 0.5; continue; }
      }
      const [R, C] = w.hist[0];
      w.hist.unshift([R + w.dir[0], C + w.dir[1]]);
      w.hist.length = spec.chain + 1;
      w.stepT = 0;
      w.runLeft--;
      if (w.runLeft === 0) w.pauseLeft = spec.pause;
    }
  }

  // plane position (cell-centre units) of chain element i
  function chainPoint(w: Walker, i: number, eased: boolean): [number, number] {
    const s = eased ? smooth(w.stepT) : w.stepT;
    const a = w.hist[i + 1], b = w.hist[i];
    return [a[0] + (b[0] - a[0]) * s + 0.5, a[1] + (b[1] - a[1]) * s + 0.5];
  }

  // ---- state ----
  let board: StageBoard | null = null;
  let view: View = opts.initialView ?? 'board';
  let fold = view === 'surface' ? 1 : 0;
  let ghostLevel = view === 'tiling' ? 1 : 0;
  interface Tween { f0: number; g0: number; f1: number; g1: number; dur: number; t: number; gAfter: number | null; }
  let tween: Tween | null = null;
  let autoplay = opts.autoplay ?? false;
  let seqIdx = 0;
  let holdLeft = HOLD[view];
  let lastFrame = performance.now();
  let yaw = -0.5, pitch = 0.62;
  let yawVel = 0, pitchVel = 0;
  let dragging = false;
  let idleSince = 0;
  let raf = 0;
  let visible = true;
  let scale = 1;
  const center = new THREE.Vector3();

  function goTo(next: View, animate: boolean): void {
    const prev = view;
    view = next;
    opts.onView?.(next);
    const f1 = next === 'surface' ? 1 : 0;
    let g1 = next === 'tiling' ? 1 : 0;
    let gAfter: number | null = null;
    if (next === 'surface') { g1 = ghostLevel; gAfter = 0; }   // copies fade out as the fold starts
    if (prev === 'surface' && next === 'tiling') ghostLevel = 1;  // and fade back in as it opens
    if (!animate) {
      fold = f1; ghostLevel = gAfter ?? g1; tween = null;
      return;
    }
    const foldMoves = Math.abs(f1 - fold) > 1e-3;
    tween = {
      f0: fold, g0: ghostLevel, f1, g1, gAfter,
      dur: foldMoves ? FOLD_SECONDS * Math.abs(f1 - fold) + 0.2 : FADE_SECONDS,
      t: 0,
    };
  }

  function sequence(): View[] {
    // a flat plan has no fold: alternate board and tiling
    return board?.plan.kind === 'flat' ? ['board', 'tiling'] : SEQUENCE;
  }

  function stepViews(dt: number): void {
    if (tween) {
      tween.t += dt / tween.dur;
      const k = smooth(tween.t);
      fold = tween.f0 + (tween.f1 - tween.f0) * k;
      ghostLevel = tween.g0 + (tween.g1 - tween.g0) * k;
      if (tween.t >= 1) {
        if (tween.gAfter !== null) ghostLevel = tween.gAfter;
        tween = null;
        holdLeft = HOLD[view];
      }
      return;
    }
    if (!autoplay) return;
    holdLeft -= dt;
    if (holdLeft > 0) return;
    const seq = sequence();
    seqIdx = (seqIdx + 1) % seq.length;
    goTo(seq[seqIdx], true);
  }

  function ghostOpacity(): number {
    return ghostLevel * (1 - smooth(fold / 0.18));
  }

  function point(u: number, v: number, t: number): V3 {
    return embed(board!.plan, u, v, t);
  }

  function updateSurface(t: number): void {
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let j = 0; j <= GRID; j++) {
      for (let i = 0; i <= GRID; i++) {
        const p = point(i / GRID, j / GRID, t);
        const k = (j * (GRID + 1) + i) * 3;
        positions[k] = p[0]; positions[k + 1] = p[1]; positions[k + 2] = p[2];
        if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1];
        if (p[2] < minZ) minZ = p[2]; if (p[2] > maxZ) maxZ = p[2];
      }
    }
    geom.attributes.position.needsUpdate = true;
    geom.computeVertexNormals();
    geom.computeBoundingSphere();
    center.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    let r2 = 0;
    for (let k = 0; k < positions.length; k += 3) {
      const dx = positions[k] - center.x, dy = positions[k + 1] - center.y, dz = positions[k + 2] - center.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d > r2) r2 = d;
    }
    // pull back in the tiling so the neighbouring copies come into frame
    const fit = FIT_RADIUS * (1 - 0.42 * ghostOpacity());
    scale = fit / Math.max(0.3, Math.sqrt(r2));
    body.scale.setScalar(scale);
    body.position.copy(center).multiplyScalar(-scale);
  }

  function updateEdges(t: number): void {
    const b = board!;
    const radius = 0.02 / Math.max(0.6, scale);
    // glued edges: outline of the board in the tiling, a brief flash while
    // they zip shut during the fold, invisible otherwise
    seamMat.opacity = Math.max(0.85 * ghostOpacity(), 0.9 * Math.sin(Math.PI * Math.min(1, Math.max(0, t))));
    for (const e of EDGES) {
      const mesh = edgeMeshes.get(e)!;
      const kind = b.plan.edges[e].kind;
      const glued = kind !== 'wall' && kind !== 'mirror';
      mesh.visible = !glued || seamMat.opacity > 0.01;
      if (!mesh.visible) continue;
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= EDGE_SEGS; k++) {
        const s = k / EDGE_SEGS;
        const [u, v] = e === 'left' ? [0, s] : e === 'right' ? [1, s] : e === 'top' ? [s, 0] : [s, 1];
        const p = point(u, v, t);
        pts.push(new THREE.Vector3(p[0], p[1], p[2]));
      }
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
      const r = kind === 'wall' ? radius * 1.5 : kind === 'mirror' ? radius * 1.3 : radius * 0.6;
      const g = new THREE.TubeGeometry(curve, EDGE_SEGS, r, 6, false);
      mesh.material = kind === 'wall' ? wallMat : kind === 'mirror' ? mirrorMat : seamMat;
      mesh.geometry.dispose();
      mesh.geometry = g;
    }
  }

  function normalAt(u: number, v: number, t: number, p: V3): V3 {
    const e = 0.004;
    const pu = point(u + e, v, t), pv = point(u, v + e, t);
    const a = [pu[0] - p[0], pu[1] - p[1], pu[2] - p[2]];
    const c = [pv[0] - p[0], pv[1] - p[1], pv[2] - p[2]];
    const n: V3 = [c[1] * a[2] - c[2] * a[1], c[2] * a[0] - c[0] * a[2], c[0] * a[1] - c[1] * a[0]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    return [n[0] / l, n[1] / l, n[2] / l];
  }

  function updateMover(t: number): void {
    const b = board!;
    const w = walker;
    if (!w || !b.topo || !b.mover) { moverGroup.visible = false; return; }
    moverGroup.visible = true;
    const topo = b.topo;
    const lift = 0.012 / scale;
    const go = ghostOpacity();
    for (let i = 0; i < baseDecals.length; i++) {
      const [py, px] = chainPoint(w, i, b.mover.chain === 1);
      const m = tileMap(topo, py, px);
      const dec = baseDecals[i];
      dec.mesh.visible = !!m;
      for (const gd of ghostDecals[i]) gd.mesh.visible = false;
      if (!m) continue;
      // base copy: board-space square around the piece, bent onto the surface
      const segs = DECAL_SEGS;
      for (let jj = 0; jj <= segs; jj++) {
        for (let ii = 0; ii <= segs; ii++) {
          const sx = (ii / segs - 0.5) * 2 * DECAL, sy = (jj / segs - 0.5) * 2 * DECAL;
          const row = m.row + m.ey[0] * sy + m.ex[0] * sx;
          const col = m.col + m.ey[1] * sy + m.ex[1] * sx;
          const u = col / N, v = row / N;
          const p = point(u, v, t);
          const nn = normalAt(u, v, t, p);
          const k = (jj * (segs + 1) + ii) * 3;
          dec.pos[k] = p[0] + nn[0] * lift;
          dec.pos[k + 1] = p[1] + nn[1] * lift;
          dec.pos[k + 2] = p[2] + nn[2] * lift;
        }
      }
      dec.mesh.geometry.attributes.position.needsUpdate = true;
      // ghost copies: the same board point inside each neighbouring tile
      if (go <= 0.001) continue;
      ghosts.forEach((g, gi) => {
        const [a, bb, c, d] = g.L;          // board delta = L * plane delta (rows: dy, dx)
        const det = a * d - bb * c;
        if (det === 0) return;
        const inv = [d / det, -bb / det, -c / det, a / det];
        const toPlane = (row: number, col: number): [number, number] => {
          const dr = row - g.p0[0], dc = col - g.p0[1];
          return [g.cy + inv[0] * dr + inv[1] * dc, g.cx + inv[2] * dr + inv[3] * dc];
        };
        const gd = ghostDecals[i][gi];
        gd.mesh.visible = true;
        gd.mat.opacity = Math.min(1, g.base * go * 1.25);
        let k = 0;
        for (const sy of [-DECAL, DECAL]) {
          for (const sx of [-DECAL, DECAL]) {
            const row = m.row + m.ey[0] * sy + m.ex[0] * sx;
            const col = m.col + m.ey[1] * sy + m.ex[1] * sx;
            const [y, x] = toPlane(row, col);
            gd.pos[k] = (x / N - 0.5) * 2;
            gd.pos[k + 1] = 0.004;
            gd.pos[k + 2] = (y / N - 0.5) * 2;
            k += 3;
          }
        }
        gd.mesh.geometry.attributes.position.needsUpdate = true;
      });
    }
  }

  function updateGhosts(): void {
    const o = ghostOpacity();
    ghostGroup.visible = o > 0.001;
    for (const g of ghosts) g.mat.opacity = g.base * o;
  }

  function repaint(): void {
    if (!board) return;
    texCtx.setTransform(1, 0, 0, 1, 0, 0);
    texCtx.clearRect(0, 0, TEX_PX, TEX_PX);
    board.paint(texCtx, TEX_PX);
    texture.needsUpdate = true;
  }

  function resize(): void {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the surface fully in frame on tall, narrow canvases
    camera.position.z = w < h ? distance * Math.min(1.6, h / w) : distance;
    camera.updateProjectionMatrix();
  }

  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (!visible || !board) return;
    draw(now, dt);
  }

  function draw(now: number, dt: number): void {
    stepViews(dt);
    advanceWalker(dt);

    if (!dragging) {
      yawVel *= 0.94; pitchVel *= 0.9;
      yaw += yawVel;
      pitch += pitchVel;
      if (now - idleSince > 1200) yaw += autoSpin * dt;
    }
    pitch = Math.max(-1.2, Math.min(1.35, pitch));
    pivot.rotation.set(pitch, yaw, 0, 'XYZ');

    updateSurface(fold);
    updateEdges(fold);
    updateGhosts();
    updateMover(fold);
    renderer.render(scene, camera);
  }

  // ---- pointer rotation ----
  let lastX = 0, lastY = 0;
  const onDown = (e: PointerEvent) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    yawVel = dx * 0.008; pitchVel = dy * 0.006;
    yaw += yawVel; pitch += pitchVel;
  };
  const onUp = () => { dragging = false; idleSince = performance.now(); };
  if (interactive) {
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.style.touchAction = 'none';
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  const io = new IntersectionObserver(entries => {
    visible = entries.some(e => e.isIntersecting) && !document.hidden;
  });
  io.observe(canvas);
  const onVis = () => { visible = !document.hidden; lastFrame = performance.now(); };
  document.addEventListener('visibilitychange', onVis);

  resize();
  raf = requestAnimationFrame(frame);

  return {
    setBoard(next) {
      const samePlan = board?.plan.kind === next.plan.kind && board?.plan.rot === next.plan.rot
        && board?.topo?.id === next.topo?.id;
      board = next;
      buildGhosts(next.topo);
      buildMover(next);
      if (!samePlan && autoplay) {
        // a new board restarts the tour from the plain board
        seqIdx = 0;
        goTo('board', false);
        holdLeft = 1.2;
      }
      repaint();
    },
    repaint,
    setView(next, animate = true) {
      if (next === view && !tween) return;
      goTo(next, animate);
      if (!animate) holdLeft = HOLD[next];
    },
    view: () => view,
    setAutoplay(on) {
      autoplay = on;
      if (on) {
        const seq = sequence();
        const i = seq.indexOf(view);
        seqIdx = i < 0 ? 0 : i;
        holdLeft = Math.min(holdLeft, 1);
      }
    },
    autoplaying: () => autoplay,
    resize,
    pick(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      scene.updateMatrixWorld();
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects([frontMesh, backMesh], false)[0];
      if (!hit?.uv) return null;
      return [hit.uv.x, 1 - hit.uv.y];
    },
    renderNow() {
      if (!board) return;
      resize();
      draw(performance.now(), 0);
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      geom.dispose();
      texture.dispose();
      for (const t of spriteTextures) t.dispose();
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
