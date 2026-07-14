// The GAMES registry: one entry per game, the game analogue of the TOPOLOGIES
// registry. Adding a game = implementing a GameModule and registering it here
// (plus a client view adapter and a landing-catalog entry). Dispatch is a
// GAMES.get(id) lookup; there is no closed union of game types in the engine.

import { GameModule } from './core.ts';
import { chessModule } from './games/chess.ts';
import { goModule } from './games/go.ts';
import { hexModule } from './games/hexchess.ts';

export type AnyGameModule = GameModule<any, any, any>;

export const GAMES = new Map<string, AnyGameModule>([
  [chessModule.id, chessModule],
  [goModule.id, goModule],
  [hexModule.id, hexModule],
]);

// The board family whose members are the TOPOLOGIES quotients. A game "uses
// topology" (shows the mode selector, carries a topology id in its URL) iff it
// belongs to this family. When a second topology-bearing family appears, widen
// this to a set of families.
export const TOPOLOGY_FAMILY = 'square-grid';

export function usesTopology(gameId: string): boolean {
  return GAMES.get(gameId)?.boardFamily === TOPOLOGY_FAMILY;
}

export { chessModule, goModule, hexModule };
export * from './core.ts';
