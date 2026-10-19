// Three.js stage that folds a flat board into its quotient surface. The mesh
// is re-embedded every frame from embed(plan, u, v, t), so the same code runs
// the fold animation, the scrubber, and the live in-game view. Edges are
// drawn as tubes (seam gradient / chrome mirror / dark wall); glowing comets
// fly straight plane lines through the continuous extension of project(), so
// on the closed surface their trails run unbroken across every seam.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Topology } from '../topology';
import { embed, V3 } from './embed';
import { EDGES, EdgeName, SurfacePlan } from './plan';
import { EdgeRamp } from './texture';

const GRID = 84;               // mesh resolution per side
const EDGE_SEGS = 96;
const TEX_PX = 1024;
const COMETS = 7;
const TRAIL = 46;
const TRAIL_DT = 0.045;        // seconds between trail samples
const COMET_SPEED = 0.16;      // board widths per second
const FIT_RADIUS = 1.45;

// Fold timeline, seconds: flat hold, fold, glued hold, unfold.
const T_FLAT = 1.6, T_FOLD = 3.6, T_HOLD = 7.5, T_UNFOLD = 2.6;
const T_LOOP = T_FLAT + T_FOLD + T_HOLD + T_UNFOLD;

export interface StageBoard {
  plan: SurfacePlan;
  topo: Topology | null;        // null: no comets (boards without project())
  ramps: Record<EdgeName, EdgeRamp>;
  paint(ctx: CanvasRenderingContext2D, px: number): void;
}

export interface StageOptions {
  autoFold?: boolean;           // run the fold timeline (landing); false holds at fold
  comets?: boolean;
  interactive?: boolean;        // drag to rotate
  autoSpin?: number;            // radians / second while idle
  distance?: number;            // camera distance (default 6.4)
  onFold?(t: number): void;     // timeline position, for a scrubber
}

export interface Stage {
  setBoard(board: StageBoard): void;
  repaint(): void;              // re-run the board's paint() into the texture
  setFold(t: number | null): void;   // null resumes the timeline
  playing(): boolean;
  setPlaying(on: boolean): void;
  resize(): void;
  renderNow(): void;            // one synchronous frame, visible or not
  pick(clientX: number, clientY: number): [number, number] | null;   // board (u, v) under a point
  destroy(): void;
}

function ease(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function timelineFold(sec: number): number {
  const s = sec % T_LOOP;
  if (s < T_FLAT) return 0;
  if (s < T_FLAT + T_FOLD) return ease((s - T_FLAT) / T_FOLD);
  if (s < T_FLAT + T_FOLD + T_HOLD) return 1;
  return 1 - ease((s - T_FLAT - T_FOLD - T_HOLD) / T_UNFOLD);
}

// Continuous extension of project() for a real-valued plane point (cell
// units, n x n board): the containing tile is a rigid copy of the board, so
// three probes give its isometry. Returns board [row, col] or null past a wall.
function projectPoint(topo: Topology, n: number, y: number, x: number): [number, number] | null {
  const R0 = Math.floor(y / n) * n;
  const C0 = Math.floor(x / n) * n;
  const p00 = topo.project(R0, C0, n);
  if (!p00) return null;
  const p10 = topo.project(R0 + 1, C0, n);
  const p01 = topo.project(R0, C0 + 1, n);
  if (!p10 || !p01) return null;
  const oy = y - R0 - 0.5, ox = x - C0 - 0.5;
  return [
    p00[0] + 0.5 + (p10[0] - p00[0]) * oy + (p01[0] - p00[0]) * ox,
    p00[1] + 0.5 + (p10[1] - p00[1]) * oy + (p01[1] - p00[1]) * ox,
  ];
}

interface Comet {
  y0: number; x0: number;       // plane start, cell units
  dy: number; dx: number;       // direction, unit
  born: number;                 // stage seconds
  life: number;
  color: THREE.Color;
}

const COMET_COLORS = ['#ff5a1f', '#00b3ff', '#ff2d8a', '#18c37e', '#8b5cff'];

export function createStage(canvas: HTMLCanvasElement, opts: StageOptions = {}): Stage {
  const autoFold = opts.autoFold ?? true;
  const showComets = opts.comets ?? true;
  const interactive = opts.interactive ?? true;
  const autoSpin = opts.autoSpin ?? 0.18;
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

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 0, distance);

  scene.add(new THREE.HemisphereLight(0xdde6ff, 0x2a1a10, 0.7));
  const key = new THREE.DirectionalLight(0xfff1e0, 1.35);
  key.position.set(3, 5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6f9dff, 1.1);
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
    map: texture, side: THREE.FrontSide, roughness: 0.55, metalness: 0.0, envMapIntensity: 0.6,
  });
  // the reverse face is tinted cool, so a non-orientable surface visibly
  // swaps faces across its orientation-reversing seam
  const back = new THREE.MeshStandardMaterial({
    map: texture, side: THREE.BackSide, roughness: 0.6, metalness: 0.0,
    color: new THREE.Color(0.5, 0.62, 0.95), envMapIntensity: 0.5,
  });
  const frontMesh = new THREE.Mesh(geom, front);
  const backMesh = new THREE.Mesh(geom, back);
  body.add(frontMesh);
  body.add(backMesh);
  const raycaster = new THREE.Raycaster();

  // ---- edge tubes ----
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x24262c, roughness: 0.8, metalness: 0.1 });
  const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.08, metalness: 1.0, envMapIntensity: 1.6 });
  const seamMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.35, metalness: 0.0, emissive: 0x000000,
  });
  const edgeMeshes = new Map<EdgeName, THREE.Mesh>();
  for (const e of EDGES) {
    const m = new THREE.Mesh(new THREE.BufferGeometry(), seamMat);
    edgeMeshes.set(e, m);
    body.add(m);
  }

  // ---- comets: additive glow points, one per trail sample ----
  const cometGroup = new THREE.Group();
  body.add(cometGroup);
  const cometN = COMETS * TRAIL;
  const trailPos = new Float32Array(cometN * 3);
  const trailCol = new Float32Array(cometN * 3);
  const trailSize = new Float32Array(cometN);
  const trailAlpha = new Float32Array(cometN);
  const trailGeom = new THREE.BufferGeometry();
  trailGeom.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeom.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
  trailGeom.setAttribute('size', new THREE.BufferAttribute(trailSize, 1));
  trailGeom.setAttribute('alpha', new THREE.BufferAttribute(trailAlpha, 1));
  const glowMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 1 } },
    vertexShader: `
      attribute float size;
      attribute float alpha;
      attribute vec3 color;
      varying vec3 vColor;
      varying float vAlpha;
      uniform float uScale;
      void main() {
        vColor = color;
        vAlpha = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float core = smoothstep(0.5, 0.15, d);
        vec3 c = mix(vColor, vec3(1.0), smoothstep(0.25, 0.0, d) * 0.6);
        gl_FragColor = vec4(c, core * vAlpha);
      }`,
    transparent: true, depthWrite: false,
  });
  const trails = new THREE.Points(trailGeom, glowMat);
  trails.renderOrder = 2;
  trails.frustumCulled = false;
  cometGroup.add(trails);

  // ---- ghost tiles: neighbouring copies of the board on the flat sheet ----
  const ghostGroup = new THREE.Group();
  body.add(ghostGroup);
  const ghostMats: { mat: THREE.MeshBasicMaterial; base: number }[] = [];

  function buildGhosts(topo: Topology | null): void {
    for (const m of ghostGroup.children as THREE.Mesh[]) m.geometry.dispose();
    ghostGroup.clear();
    for (const g of ghostMats) g.mat.dispose();
    ghostMats.length = 0;
    if (!topo) return;
    const n = 8;
    for (let tr = -1; tr <= 1; tr++) {
      for (let tc = -1; tc <= 1; tc++) {
        if (tr === 0 && tc === 0) continue;
        const cy = (tr + 0.5) * n, cx = (tc + 0.5) * n, h = n / 4;
        const p0 = projectPoint(topo, n, cy, cx);
        const py = projectPoint(topo, n, cy + h, cx);
        const px = projectPoint(topo, n, cy, cx + h);
        if (!p0 || !py || !px) continue;
        // affine plane -> board map of this tile, applied to its corners
        const uvAt = (y: number, x: number): [number, number] => {
          const dy = (y - cy) / h, dx = (x - cx) / h;
          const row = p0[0] + (py[0] - p0[0]) * dy + (px[0] - p0[0]) * dx;
          const col = p0[1] + (py[1] - p0[1]) * dy + (px[1] - p0[1]) * dx;
          return [col / n, 1 - row / n];
        };
        const ys = [tr * n, (tr + 1) * n], xs = [tc * n, (tc + 1) * n];
        const pos: number[] = [], uv: number[] = [];
        for (const y of ys) for (const x of xs) {
          pos.push((x / n - 0.5) * 2, -0.002, (y / n - 0.5) * 2);
          uv.push(...uvAt(y, x));
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setIndex([0, 2, 1, 1, 2, 3]);
        const base = tr === 0 || tc === 0 ? 0.36 : 0.2;
        const mat = new THREE.MeshBasicMaterial({
          map: texture, transparent: true, opacity: base, depthWrite: false,
          side: THREE.DoubleSide, color: new THREE.Color(0.8, 0.82, 0.9),
        });
        ghostMats.push({ mat, base });
        ghostGroup.add(new THREE.Mesh(g, mat));
      }
    }
  }

  let comets: Comet[] = [];

  // ---- state ----
  let board: StageBoard | null = null;
  let fixedFold: number | null = autoFold ? null : 1;
  let isPlaying = true;
  let clock = 0;            // timeline seconds (advances only while playing)
  let realTime = 0;         // comet seconds (always advances)
  let lastFrame = performance.now();
  let yaw = -0.5, pitch = 0.62;
  let yawVel = 0, pitchVel = 0;
  let dragging = false;
  let idleSince = 0;
  let raf = 0;
  let visible = true;
  let scale = 1;
  const center = new THREE.Vector3();

  function rngComet(now: number, i: number): Comet {
    const a = Math.random() * Math.PI * 2;
    const c = new THREE.Color(COMET_COLORS[i % COMET_COLORS.length]);
    return {
      y0: Math.random() * 8, x0: Math.random() * 8,
      dy: Math.sin(a), dx: Math.cos(a),
      born: now - Math.random() * 2, life: 5 + Math.random() * 5, color: c,
    };
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
    scale = FIT_RADIUS / Math.max(0.3, Math.sqrt(r2));
    body.scale.setScalar(scale);
    body.position.copy(center).multiplyScalar(-scale);
  }

  function updateEdges(t: number): void {
    const b = board!;
    const radius = 0.022 / Math.max(0.6, scale);
    for (const e of EDGES) {
      const mesh = edgeMeshes.get(e)!;
      const kind = b.plan.edges[e].kind;
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= EDGE_SEGS; k++) {
        const s = k / EDGE_SEGS;
        const [u, v] = e === 'left' ? [0, s] : e === 'right' ? [1, s] : e === 'top' ? [s, 0] : [s, 1];
        const p = point(u, v, t);
        pts.push(new THREE.Vector3(p[0], p[1], p[2]));
      }
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
      const r = kind === 'wall' ? radius * 1.5 : kind === 'mirror' ? radius * 1.3 : radius;
      const g = new THREE.TubeGeometry(curve, EDGE_SEGS, r, 7, false);
      if (kind !== 'wall' && kind !== 'mirror') {
        const ring = 8;
        const cols = new Float32Array((EDGE_SEGS + 1) * ring * 3);
        for (let k = 0; k <= EDGE_SEGS; k++) {
          const c = b.ramps[e](k / EDGE_SEGS);
          for (let q = 0; q < ring; q++) cols.set(c, (k * ring + q) * 3);
        }
        g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      }
      mesh.material = kind === 'wall' ? wallMat : kind === 'mirror' ? mirrorMat : seamMat;
      mesh.geometry.dispose();
      mesh.geometry = g;
    }
  }

  function normalAt(u: number, v: number, t: number, p: V3): V3 {
    const e = 0.004;
    const pu = point(Math.min(1, u + e), v, t), pv = point(u, Math.min(1, v + e), t);
    const a = [pu[0] - p[0], pu[1] - p[1], pu[2] - p[2]];
    const c = [pv[0] - p[0], pv[1] - p[1], pv[2] - p[2]];
    const n: V3 = [c[1] * a[2] - c[2] * a[1], c[2] * a[0] - c[0] * a[2], c[0] * a[1] - c[1] * a[0]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    return [n[0] / l, n[1] / l, n[2] / l];
  }

  function updateComets(t: number): void {
    const b = board!;
    if (!showComets || !b.topo) { cometGroup.visible = false; return; }
    cometGroup.visible = true;
    const topo = b.topo;
    const n = 8;
    const lift = 0.02 / scale;
    const speed = COMET_SPEED * n;
    glowMat.uniforms.uScale.value = renderer.getPixelRatio() * canvas.clientHeight;
    for (let i = 0; i < COMETS; i++) {
      let c = comets[i];
      if (!c || realTime - c.born > c.life) c = comets[i] = rngComet(realTime, i);
      const fade = Math.min(1, (realTime - c.born) / 0.6) * Math.min(1, Math.max(0, c.life - (realTime - c.born)) / 0.8);
      for (let k = 0; k < TRAIL; k++) {
        const idx = i * TRAIL + k;
        const age = realTime - c.born - k * TRAIL_DT;
        let bp: [number, number] | null = null;
        if (age >= 0) bp = projectPoint(topo, n, c.y0 + c.dy * speed * age, c.x0 + c.dx * speed * age);
        if (!bp) {
          if (k === 0 && age >= 0) c.life = Math.min(c.life, realTime - c.born + 0.8);
          trailSize[idx] = 0;
          continue;
        }
        const u = bp[1] / n, v = bp[0] / n;
        const p = point(u, v, t);
        const nn = normalAt(u, v, t, p);
        trailPos[idx * 3] = p[0] + nn[0] * lift;
        trailPos[idx * 3 + 1] = p[1] + nn[1] * lift;
        trailPos[idx * 3 + 2] = p[2] + nn[2] * lift;
        const k01 = 1 - k / TRAIL;
        const a = k01 * k01 * fade;
        trailCol[idx * 3] = c.color.r;
        trailCol[idx * 3 + 1] = c.color.g;
        trailCol[idx * 3 + 2] = c.color.b;
        trailAlpha[idx] = a;
        trailSize[idx] = k === 0 ? 0.16 : 0.1 * (0.3 + 0.7 * k01);
      }
    }
    trailGeom.attributes.position.needsUpdate = true;
    trailGeom.attributes.color.needsUpdate = true;
    trailGeom.attributes.size.needsUpdate = true;
    trailGeom.attributes.alpha.needsUpdate = true;
  }

  function updateGhosts(t: number): void {
    const fade = board!.plan.kind === 'flat' ? 1 : 1 - Math.min(1, t / 0.18);
    ghostGroup.visible = fade > 0.001;
    for (const g of ghostMats) g.mat.opacity = g.base * fade;
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
    realTime += dt;
    if (isPlaying && fixedFold === null) clock += dt;
    const t = fixedFold ?? timelineFold(clock);
    if (fixedFold === null) opts.onFold?.(t);

    if (!dragging) {
      yawVel *= 0.94; pitchVel *= 0.9;
      yaw += yawVel;
      pitch += pitchVel;
      if (now - idleSince > 1200) yaw += autoSpin * dt;
    }
    pitch = Math.max(-1.2, Math.min(1.35, pitch));
    pivot.rotation.set(pitch, yaw, 0, 'XYZ');

    updateSurface(t);
    updateEdges(t);
    updateComets(t);
    updateGhosts(t);
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
      const samePlan = board?.plan.kind === next.plan.kind && board?.plan.rot === next.plan.rot;
      board = next;
      comets = [];
      buildGhosts(next.topo);
      if (!samePlan) clock = autoFold ? T_FLAT * 0.6 : clock;
      repaint();
    },
    repaint,
    setFold(t) {
      fixedFold = t;
      if (t === null && autoFold) {
        // resume the timeline from the scrubbed position: pick the matching
        // point on the fold ramp
        clock = clock - (clock % T_LOOP);
      }
    },
    playing: () => isPlaying,
    setPlaying(on) { isPlaying = on; },
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
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
