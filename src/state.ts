import { TOPOLOGY_MAP, Topology } from './topology';

export type Color = 'white' | 'black';
export type GameType = 'chess' | 'go';

export let currentGame: GameType = 'chess';
export let currentTopology: Topology = TOPOLOGY_MAP.get('classic')!;

export function setCurrentGame(game: GameType): void {
  currentGame = game;
}

export function setTopology(id: string): void {
  currentTopology = TOPOLOGY_MAP.get(id)!;
}

export function opponentOf(color: Color): Color {
  return color === 'white' ? 'black' : 'white';
}
