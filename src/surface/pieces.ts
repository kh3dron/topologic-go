// Procedural 3D chess pieces for the stage. Each geometry sits on y = 0 with
// +y up and +x forward, sized in cell units (base diameter ~0.72 cell), so a
// uniform scale by the local cell size stands it on any embedded surface.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PieceType } from '../engine/games/chess';
import type { Color } from '../engine/core';

export const PIECE_TYPES: PieceType[] = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'];

type P = [number, number];   // lathe profile point: [radius, height]

const SEGS = 28;
const FOOT: P[] = [[0, 0], [0.33, 0], [0.36, 0.03], [0.36, 0.07], [0.3, 0.11], [0.25, 0.14]];

function arc(cy: number, r: number, from: number, to: number, steps: number, ry = r): P[] {
  const out: P[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + (to - from) * (i / steps);
    out.push([Math.max(0, r * Math.cos(a)), cy + ry * Math.sin(a)]);
  }
  return out;
}

function lathe(profile: P[]): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), SEGS);
  const flat = g.toNonIndexed();
  g.dispose();
  return flat;
}

function box(w: number, h: number, d: number, y: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, y, 0);
  const flat = g.toNonIndexed();
  g.dispose();
  return flat;
}

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return g;
}

const H = Math.PI / 2;

function pawn(): THREE.BufferGeometry {
  return lathe([
    ...FOOT, [0.17, 0.2], [0.11, 0.42], [0.19, 0.45], [0.19, 0.48], [0.11, 0.5],
    ...arc(0.63, 0.155, -1.0, H, 10),
  ]);
}

function rook(): THREE.BufferGeometry {
  return lathe([
    ...FOOT, [0.21, 0.2], [0.18, 0.56], [0.26, 0.61], [0.26, 0.82], [0.19, 0.82], [0.19, 0.74], [0, 0.74],
  ]);
}

function bishop(): THREE.BufferGeometry {
  return lathe([
    ...FOOT, [0.17, 0.2], [0.1, 0.6], [0.2, 0.63], [0.2, 0.66], [0.11, 0.69],
    ...arc(0.86, 0.15, -0.9, 1.25, 10, 0.2),
    ...arc(1.09, 0.045, -0.6, H, 5),
  ]);
}

function queen(): THREE.BufferGeometry {
  return lathe([
    ...FOOT, [0.19, 0.2], [0.11, 0.78], [0.22, 0.82], [0.22, 0.85], [0.13, 0.88],
    [0.21, 1.08], [0.16, 1.06], [0.07, 1.1],
    ...arc(1.16, 0.065, -0.5, H, 6),
  ]);
}

function king(): THREE.BufferGeometry {
  const bodyGeom = lathe([
    ...FOOT, [0.2, 0.2], [0.12, 0.84], [0.23, 0.88], [0.23, 0.91], [0.14, 0.94],
    [0.2, 1.12], [0.12, 1.16], [0, 1.17],
  ]);
  return merged([bodyGeom, box(0.07, 0.24, 0.07, 1.28), box(0.2, 0.07, 0.07, 1.3)]);
}

function knight(): THREE.BufferGeometry {
  const foot = lathe([...FOOT, [0.22, 0.19], [0.2, 0.23], [0, 0.23]]);
  // side profile, nose toward +x
  const pts: P[] = [
    [-0.17, 0.2], [0.19, 0.2], [0.17, 0.36], [0.08, 0.5], [0.07, 0.58], [0.16, 0.6],
    [0.28, 0.55], [0.32, 0.63], [0.27, 0.74], [0.14, 0.9], [0.09, 1.0], [0.03, 0.93],
    [-0.08, 0.86], [-0.17, 0.7], [-0.2, 0.48],
  ];
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const depth = 0.15;
  const head = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 2, curveSegments: 4,
  });
  head.translate(0, 0, -depth / 2);
  const flat = head.index ? head.toNonIndexed() : head;
  if (flat !== head) head.dispose();
  return merged([foot, flat]);
}

const BUILD: Record<PieceType, () => THREE.BufferGeometry> = { pawn, rook, knight, bishop, queen, king };
const cache = new Map<PieceType, THREE.BufferGeometry>();

// Shared across stages; never disposed (6 small geometries for the page's lifetime).
export function pieceGeometry(type: PieceType): THREE.BufferGeometry {
  let g = cache.get(type);
  if (!g) {
    g = BUILD[type]();
    g.computeBoundingSphere();
    cache.set(type, g);
  }
  return g;
}

export function pieceMaterial(color: Color, ghost: boolean): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: color === 'white' ? 0xe6d8bf : 0x231c18,
    roughness: color === 'white' ? 0.5 : 0.32,
    metalness: 0.0,
    envMapIntensity: color === 'white' ? 0.5 : 1.1,
    side: THREE.DoubleSide,
    transparent: ghost,
    opacity: ghost ? 0 : 1,
  });
}
