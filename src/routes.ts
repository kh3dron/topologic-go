// URL wiring between the catalog and the play / challenge pages. A variant is
// identified by a game key (g) and a topology id (t); games without a topology
// family (hex) carry no t. Both derive from the engine GAMES registry, so a new
// game routes correctly with no edits here.

import { GameType } from './state';
import { GAMES, usesTopology } from './engine';
import { GO_SIZES } from './engine/games/go';

export type PlayMode = 'playground' | 'challenge';

export interface VariantParams {
  game: GameType;
  topoId: string;
  size: number | null; // Go board size (s), null when absent/invalid
}

export function readVariantParams(): VariantParams {
  const params = new URLSearchParams(window.location.search);
  const g = params.get('g');
  const game = (g && GAMES.has(g) ? g : 'chess') as GameType;
  const topoId = params.get('t') || 'classic';
  const s = Number(params.get('s'));
  const size = game === 'go' && GO_SIZES.includes(s) ? s : null;
  return { game, topoId, size };
}

export function variantSearch(game: GameType, topoId: string, size?: number | null): string {
  const params = new URLSearchParams();
  params.set('g', game);
  if (usesTopology(game)) params.set('t', topoId);
  if (game === 'go' && size != null && GO_SIZES.includes(size)) params.set('s', String(size));
  return `?${params.toString()}`;
}

export function variantHref(mode: PlayMode, game: GameType, topoId: string): string {
  // Single-player games have no online lobby, so they always land on the sandbox
  // even when the catalog is in challenge mode.
  const solo = GAMES.get(game)?.soloOnly ?? false;
  const page = mode === 'challenge' && !solo ? 'game.html' : 'play.html';
  return `${page}${variantSearch(game, topoId)}`;
}
