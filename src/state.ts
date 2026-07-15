import { TOPOLOGY_MAP, Topology } from './topology';

// Color / opponentOf are engine primitives; re-exported here for the modules
// that still import them from state.
export type { Color } from './engine/core';
export { opponentOf } from './engine/core';

export type GameType = 'chess' | 'go' | 'hexchess' | 'hyperchess' | 'snake';

export let currentGame: GameType = 'chess';
export let currentTopology: Topology = TOPOLOGY_MAP.get('classic')!;

export function setCurrentGame(game: GameType): void {
  currentGame = game;
}

export function setTopology(id: string): void {
  currentTopology = TOPOLOGY_MAP.get(id)!;
}
