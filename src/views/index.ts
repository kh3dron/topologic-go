// VIEWS registry: one client view adapter per game, keyed by the same id as the
// engine GAMES registry. render.ts / play.ts dispatch through viewFor(id).

import { GameView } from './kit';
import { chessView } from './chess';
import { goView } from './go';
import { hexView } from './hexchess';
import { hyperView } from './hyperchess';
import { hyperGoView } from './hypergo';
import { pentaView } from './pentachess';
import { snakeView } from './snake';

export const VIEWS = new Map<string, GameView>([
  [chessView.id, chessView],
  [goView.id, goView],
  [hexView.id, hexView],
  [hyperView.id, hyperView],
  [hyperGoView.id, hyperGoView],
  [pentaView.id, pentaView],
  [snakeView.id, snakeView],
]);

export function viewFor(id: string): GameView {
  return VIEWS.get(id)!;
}

export * from './kit';
