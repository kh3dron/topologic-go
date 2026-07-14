// Derived classification of every (game, topology) pair. Shared by the about
// page (full census table) and the landing catalog (per-card badges).
//
// MOVE-0 is evaluated by actually running the pure chess engine on the topology;
// singular cells are counted from project(). Verdict is derived, never assigned.
// Fully DOM-free and stateless: it builds a fresh initial state per topology
// rather than mutating any global, so it also runs headlessly (see
// scripts/census.ts).

import { CHESS_SIZE, initialChessState } from './engine/games/chess';
import { GO_SIZE } from './engine/games/go';
import { Topology } from './topology';

export type CensusGame = 'chess' | 'go';

export function singularCellCount(topo: Topology, size: number): number {
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

export function chessMoveZero(topo: Topology): string {
  const { gameOver } = initialChessState(topo);
  if (gameOver === 'draw') return 'STALEMATE AT MOVE 0';
  if (gameOver) return `${gameOver.toUpperCase()} WINS AT MOVE 0`;
  return 'PLAYABLE';
}

export function verdict(dead: boolean, singular: number, orientable: boolean): string {
  if (dead) return 'DEAD';
  if (singular > 0 || !orientable) return 'QUIRKS';
  return 'OK';
}

export interface VariantCensus {
  moveZero: string;
  singular: number;
  verdict: string;
}

export function variantVerdict(game: CensusGame, topo: Topology): VariantCensus {
  const size = game === 'chess' ? CHESS_SIZE : GO_SIZE;
  const singular = singularCellCount(topo, size);
  const moveZero = game === 'chess' ? chessMoveZero(topo) : 'PLAYABLE';
  const dead = moveZero !== 'PLAYABLE';
  return { moveZero, singular, verdict: verdict(dead, singular, topo.formal.orientable) };
}
