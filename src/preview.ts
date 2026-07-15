// Particle-flow topology preview for the catalog picker. Streams of particles
// fly in straight plane lines out through every glued edge; a continuous
// extension of project() maps each sample onto the board, so a particle
// leaving an edge re-enters at the exact glued cell with the correct flip or
// rotation - the flow is the real topology, never a canned per-mode effect.
// Particle color reuses the shared seam gradient and travels with the
// particle, so exit and entry match by continuity; a self-glued (mirror)
// crossing literally bounces the flight path back; wall edges absorb the
// occasional stray particle with a flash. Derived entirely by probing
// project(), so new topologies animate for free.

import { seamColor, seamColoring, Topology, tileOrientation } from './topology';
import { allHexCells, hexColorIndex } from './engine/games/hexchess';

const SIZE = 8;
const PAD = 10;
const MID = Math.floor(SIZE / 2);

const LIGHT = '#1c1c1c';
const DARK = '#171717';
const BG = '#141414';
const HEX_COLORS = ['#e8e8e8', '#b0b0b0', '#7d7d7d'];   // Glinski 3-colouring
const BOUNCE = '#d9d9d9';
const DOOMED = '#757575';

const SPEED = 2.4;       // cells per second
const DEPTH = 2.3;       // flight distance on each side of the seam, in cells
const FADE = 0.3;        // fade-in/out time, seconds
const FLASH = 0.35;      // wall-hit flash duration, seconds
const TRAIL = 5;         // ghost samples behind the head
const TRAIL_DT = 0.075;  // seconds between ghost samples
const HEAD_R = 0.13;     // head radius, in cells
const WAVE_PAUSE = 0.9;  // rest between waves, seconds
const WAVE_PERIOD = (2 * DEPTH) / SPEED + FLASH + WAVE_PAUSE;

type Vec = [number, number];

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

type SeamType = 'wall' | 'wrap' | 'reflect' | 'rotate';
interface Seam { score: number; type: SeamType; }

// Classifies one axis by probing the neighbouring tile: a wall axis (null
// period) scores 0, a plain wrap 1, and a reflect / rotate 2 so the caption
// names the most interesting glue.
function axisSeam(topo: Topology, axis: 'x' | 'y'): Seam {
  const period = axis === 'x' ? topo.periodX : topo.periodY;
  if (period == null) return { score: 0, type: 'wall' };
  const o0 = tileOrientation(topo, 0, 0, SIZE);
  const o1 = axis === 'x' ? tileOrientation(topo, 0, 1, SIZE) : tileOrientation(topo, 1, 0, SIZE);
  if (o0.key === o1.key) return { score: 1, type: 'wrap' };
  return { score: 2, type: o0.reflected !== o1.reflected ? 'reflect' : 'rotate' };
}

const CAPTION: Record<SeamType, string> = {
  wall: 'BOUNDED EDGES',
  wrap: 'EDGES WRAP',
  reflect: 'EDGES REFLECT',
  rotate: 'EDGES ROTATE',
};

// One perpetually-recycling particle anchored to a single edge crossing. All
// particles ride one global clock: every WAVE_PERIOD a synchronized wave
// leaves every edge at once, so exits and their glued entries are trivially
// matched by eye. Each flight is a pure function of time (seam point +
// outward dir * dist), so no per-frame state is kept and the sim never
// drifts.
type ParticleKind = 'flow' | 'bounce' | 'doomed';
interface Particle {
  sy: number; sx: number;   // seam crossing point, continuous plane coords
  dy: number; dx: number;   // outward unit direction
  color: string;
  kind: ParticleKind;
  life: number;             // flight time, seconds
}

// Continuous extension of project(): maps a real-valued plane point (cell
// units, cell (r,c) spans y in [r,r+1], x in [c,c+1]) to real-valued board
// coordinates by applying the containing tile's isometry. Exact, because each
// tile is one rigid copy of the board; null past a wall.
function projectPoint(topo: Topology, y: number, x: number): Vec | null {
  const R0 = Math.floor(y / SIZE) * SIZE;
  const C0 = Math.floor(x / SIZE) * SIZE;
  const p00 = topo.project(R0, C0, SIZE);
  if (!p00) return null;
  const p10 = topo.project(R0 + 1, C0, SIZE)!;
  const p01 = topo.project(R0, C0 + 1, SIZE)!;
  const er: Vec = [p10[0] - p00[0], p10[1] - p00[1]];
  const ec: Vec = [p01[0] - p00[0], p01[1] - p00[1]];
  const oy = y - R0 - 0.5;
  const ox = x - C0 - 0.5;
  return [p00[0] + 0.5 + er[0] * oy + ec[0] * ox, p00[1] + 0.5 + er[1] * oy + ec[1] * ox];
}

// One particle per outbound edge crossing: glued crossings spawn on the exit
// side only (the projection produces the matching entry for free), self-glued
// crossings bounce, wall crossings get a doomed particle that dies at the
// boundary - the wave passes through glued edges and is absorbed by walls.
function buildParticles(topo: Topology): Particle[] {
  const coloring = seamColoring(topo, SIZE);
  const out: Particle[] = [];
  interface EdgeSpec {
    seam(i: number): Vec; dir: Vec;
    interior(i: number): Vec; exterior(i: number): Vec;
  }
  const edges: EdgeSpec[] = [
    { seam: i => [i + 0.5, 0], dir: [0, -1], interior: i => [i, 0], exterior: i => [i, -1] },
    { seam: i => [i + 0.5, SIZE], dir: [0, 1], interior: i => [i, SIZE - 1], exterior: i => [i, SIZE] },
    { seam: i => [0, i + 0.5], dir: [-1, 0], interior: i => [0, i], exterior: i => [-1, i] },
    { seam: i => [SIZE, i + 0.5], dir: [1, 0], interior: i => [SIZE - 1, i], exterior: i => [SIZE, i] },
  ];
  for (const e of edges) {
    for (let i = 0; i < SIZE; i++) {
      const a = topo.project(e.interior(i)[0], e.interior(i)[1], SIZE)!;
      const b = topo.project(e.exterior(i)[0], e.exterior(i)[1], SIZE);
      let kind: ParticleKind;
      let color: string;
      if (!b) {
        kind = 'doomed';
        color = DOOMED;
      } else if (a[0] === b[0] && a[1] === b[1]) {
        kind = 'bounce';
        color = BOUNCE;
      } else {
        const col = coloring.lookup(a, b)!;
        if (col.onto) continue;   // entry side: the partner crossing spawns
        kind = 'flow';
        color = seamColor(col.scheme, col.t);
      }
      const life = (kind === 'doomed' ? DEPTH : 2 * DEPTH) / SPEED;
      const [sy, sx] = e.seam(i);
      out.push({ sy, sx, dy: e.dir[0], dx: e.dir[1], color, kind, life });
    }
  }
  return out;
}

export interface Preview {
  // Switches the animated board; pass null for a non-topology board (hex).
  // Returns a short caption describing the edge behaviour.
  setBoard(topo: Topology | null): string;
  destroy(): void;
}

export function createPreview(canvas: HTMLCanvasElement): Preview {
  const ctx = canvas.getContext('2d')!;
  const accent = cssVar('--accent', '#f40');
  const inkDim = cssVar('--ink-dim', '#9c9c9c');

  let topo: Topology | null = null;
  let particles: Particle[] = [];
  let raf = 0;

  let cw = 0;
  let ch = 0;

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cw = rect.width;
    ch = rect.height;
  }

  function drawBoard(): void {
    if (cw === 0) resize();
    if (cw === 0) return;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, cw, ch);

    const boardPx = Math.min(cw, ch) - 2 * PAD;
    const cell = boardPx / SIZE;
    const ox = (cw - boardPx) / 2;
    const oy = (ch - boardPx) / 2;

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? LIGHT : DARK;
        ctx.fillRect(ox + c * cell, oy + r * cell, cell + 0.5, cell + 0.5);
      }
    }

    drawEdges(ox, oy, boardPx);
    if (topo) drawParticles(ox, oy, cell);
  }

  // A board edge is a lethal wall if the plane cell just past it maps to null;
  // otherwise it glues to another copy (wrap / reflect / rotate) and is drawn
  // as a passable dashed seam.
  function drawEdges(ox: number, oy: number, boardPx: number): void {
    if (!topo) return;
    const sides: { probe: Vec; a: Vec; b: Vec }[] = [
      { probe: [-1, MID], a: [ox, oy], b: [ox + boardPx, oy] },
      { probe: [SIZE, MID], a: [ox, oy + boardPx], b: [ox + boardPx, oy + boardPx] },
      { probe: [MID, -1], a: [ox, oy], b: [ox, oy + boardPx] },
      { probe: [MID, SIZE], a: [ox + boardPx, oy], b: [ox + boardPx, oy + boardPx] },
    ];
    for (const s of sides) {
      const wall = !topo.project(s.probe[0], s.probe[1], SIZE);
      ctx.beginPath();
      ctx.moveTo(s.a[0], s.a[1]);
      ctx.lineTo(s.b[0], s.b[1]);
      if (wall) {
        ctx.strokeStyle = accent;
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = inkDim;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function drawParticles(ox: number, oy: number, cell: number): void {
    if (!topo) return;
    const age = (performance.now() / 1000) % WAVE_PERIOD;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (const p of particles) {
      if (p.kind === 'doomed' && age >= p.life && age < p.life + FLASH) {
        const f = (age - p.life) / FLASH;
        ctx.globalAlpha = (1 - f) * 0.45;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.arc(ox + p.sx * cell, oy + p.sy * cell, cell * (0.08 + 0.3 * f), 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      if (age >= p.life) continue;

      for (let k = TRAIL; k >= 0; k--) {
        const sampleAge = age - k * TRAIL_DT;
        if (sampleAge < 0) continue;
        const dist = SPEED * sampleAge - DEPTH;
        const y = p.sy + p.dy * dist;
        const x = p.sx + p.dx * dist;
        const bp = projectPoint(topo, y, x);
        if (!bp) continue;
        const px = ox + bp[1] * cell;
        const py = oy + bp[0] * cell;
        const env = Math.min(1, sampleAge / FADE, p.kind === 'doomed' ? 1 : (p.life - sampleAge) / FADE);
        if (env <= 0) continue;
        const dim = p.kind === 'doomed' ? 0.55 : 1;
        ctx.fillStyle = p.color;
        if (k === 0) {
          ctx.globalAlpha = env * 0.16 * dim;
          ctx.beginPath();
          ctx.arc(px, py, cell * HEAD_R * 2.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = env * 0.95 * dim;
          ctx.beginPath();
          ctx.arc(px, py, cell * HEAD_R, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const shrink = 1 - k / (TRAIL + 1.5);
          ctx.globalAlpha = env * 0.5 * shrink * dim;
          ctx.beginPath();
          ctx.arc(px, py, cell * HEAD_R * 0.8 * shrink, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  function render(): void {
    if (topo) drawBoard();
    else drawHexBoard();
  }

  function frame(): void {
    drawBoard();
    raf = requestAnimationFrame(frame);
  }

  const ro = new ResizeObserver(() => { resize(); render(); });
  ro.observe(canvas);

  return {
    setBoard(next: Topology | null): string {
      cancelAnimationFrame(raf);
      topo = next;
      if (next) {
        particles = buildParticles(next);
        frame();
        const sx = axisSeam(next, 'x');
        const sy = axisSeam(next, 'y');
        return CAPTION[(sx.score >= sy.score ? sx : sy).type];
      }
      particles = [];
      resize();
      render();
      return ''; // non-topology boards caption themselves (module catalog badge)
    },
    destroy(): void {
      cancelAnimationFrame(raf);
      ro.disconnect();
    },
  };

  // Static preview for non-topology games (hex): the actual Gliński board - a
  // radius-5 hexagon of 91 flat-top hexes in the real 3-colouring - fitted to the
  // frame. No animation, since project() does not apply to the hex family. Cell
  // list, colours and geometry are the same the game view uses, so it reads as a
  // hex chess board rather than a generic honeycomb slab.
  function drawHexBoard(): void {
    if (cw === 0) resize();
    if (cw === 0) return;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, cw, ch);

    const cells = allHexCells();
    const ux = (q: number) => 1.5 * q;
    const uy = (q: number, r: number) => Math.sqrt(3) * (r + q / 2);
    const halfH = Math.sqrt(3) / 2;   // hex half-height in unit (circumradius=1) space

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [q, r] of cells) {
      const x = ux(q), y = uy(q, r);
      minX = Math.min(minX, x - 1); maxX = Math.max(maxX, x + 1);
      minY = Math.min(minY, y - halfH); maxY = Math.max(maxY, y + halfH);
    }
    const scale = Math.min((cw - 2 * PAD) / (maxX - minX), (ch - 2 * PAD) / (maxY - minY));
    const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;

    ctx.lineWidth = Math.max(1, scale * 0.06);
    ctx.strokeStyle = BG;
    for (const [q, r] of cells) {
      const x = (ux(q) - midX) * scale + cw / 2;
      const y = (uy(q, r) - midY) * scale + ch / 2;
      ctx.fillStyle = HEX_COLORS[hexColorIndex(q, r)];
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI / 180) * (60 * i);
        const px = x + scale * Math.cos(ang);
        const py = y + scale * Math.sin(ang);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
}
