// Foundational engine types, shared by every game module and (later) the
// server-side move validator. Pure: no DOM, no module-level mutable game
// selection, no imports from the UI layer. The only dependency is the pure
// Topology type.

import { Topology } from '../topology.ts';

export type Color = 'white' | 'black';

export function opponentOf(color: Color): Color {
  return color === 'white' ? 'black' : 'white';
}

// The board a game is played on is family-specific: the square-grid family
// (chess, go) hands each game a Topology; hex-glinski has a single implicit
// board and takes none. A game declares its family via GameModule.boardFamily
// and types its own board via the B parameter.
export type SquareBoard = Topology;
export type NoBoard = null;

// Outcome of a move, from the perspective of the game after it is applied.
export type GameResult =
  | { status: 'active'; turn: Color }
  | { status: 'done'; winner: Color | 'draw' };

// One entry per game. Adding a game = implementing this once and registering
// it (see engine/index.ts). Topology, when used, is baked into the state S at
// creation, so isLegalMove / applyMove stay board-agnostic in signature.
export interface GameModule<S, M, B> {
  id: string;
  name: string;
  boardFamily: string;
  // Single-player games (Snake): they appear in the catalog but never route to
  // the online lobby (game.html); routes.ts keeps their links on the sandbox.
  soloOnly?: boolean;
  // Landing-picker board card for games outside the topology family (hex,
  // hyperbolic). Topology games derive theirs from the TOPOLOGIES registry.
  catalog?: { group: string; surface: string; spec: string[]; badge: string };
  initialState(board: B): S;
  isLegalMove(state: S, move: M): boolean;
  applyMove(state: S, move: M): { state: S; result: GameResult };
  serialize(state: S): unknown;
  deserialize(data: unknown): S;
}
