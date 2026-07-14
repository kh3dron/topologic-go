// VIEWS registry: one client view adapter per game, keyed by the same id as the
// engine GAMES registry. render.ts / play.ts dispatch through viewFor(id).

import { GameView } from './kit';
import { chessView } from './chess';
import { goView } from './go';
import { hexView } from './hexchess';

export const VIEWS = new Map<string, GameView>([
  [chessView.id, chessView],
  [goView.id, goView],
  [hexView.id, hexView],
]);

export function viewFor(id: string): GameView {
  return VIEWS.get(id)!;
}

export * from './kit';
