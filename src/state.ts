export type Color = 'white' | 'black';
export type GameMode = 'classic' | 'rollover' | 'mirror';
export type GameType = 'chess' | 'go';

export let currentGame: GameType = 'chess';
export let gameMode: GameMode = 'classic';

export function setCurrentGame(game: GameType): void {
  currentGame = game;
}

export function setGameMode(mode: GameMode): void {
  gameMode = mode;
}

export function opponentOf(color: Color): Color {
  return color === 'white' ? 'black' : 'white';
}
