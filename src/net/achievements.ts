// Achievements: derived entirely client-side from the world-readable games
// table, the same way the players directory derives win/played counts. Nothing
// is persisted — a player's earned set is a pure function of their game rows,
// so new achievements apply retroactively and there is no server to migrate.
// create-game seats the creator as white_player, which is what makes
// "games started" derivable from the rows.

import { GAMES } from '../engine';
import { TOPOLOGIES } from '../topology';
import type { StatsGameRow } from './games';

export interface PlayerStats {
  started: number; // games created (the white seat), any status
  finished: number; // done games holding a seat
  won: number;
  wonAsWhite: number;
  wonAsBlack: number;
  wonOffClassic: number; // wins on a topology other than classic
  topologies: Set<string>; // distinct topologies across active/done seated games
  variants: Set<string>; // distinct game types, same scope
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  points: number;
  earned: (s: PlayerStats) => boolean;
}

const ONLINE_GAME_COUNT = [...GAMES.values()].filter((g) => !g.soloOnly).length;

export const ACHIEVEMENTS: Achievement[] = [
  // -------- starting games --------
  { id: 'opening-move', name: 'Opening Move', description: 'Start your first online game', points: 10,
    earned: (s) => s.started >= 1 },
  { id: 'instigator', name: 'Instigator', description: 'Start 10 games', points: 25,
    earned: (s) => s.started >= 10 },
  // -------- playing games --------
  { id: 'across-the-board', name: 'Across the Board', description: 'Finish your first game', points: 10,
    earned: (s) => s.finished >= 1 },
  { id: 'regular', name: 'Regular', description: 'Finish 10 games', points: 25,
    earned: (s) => s.finished >= 10 },
  { id: 'veteran', name: 'Veteran', description: 'Finish 50 games', points: 75,
    earned: (s) => s.finished >= 50 },
  // -------- winning --------
  { id: 'first-win', name: 'First Win', description: 'Win a game', points: 15,
    earned: (s) => s.won >= 1 },
  { id: 'on-a-roll', name: 'On a Roll', description: 'Win 5 games', points: 40,
    earned: (s) => s.won >= 5 },
  { id: 'conqueror', name: 'Conqueror', description: 'Win 25 games', points: 100,
    earned: (s) => s.won >= 25 },
  { id: 'both-colors', name: 'Both Colors', description: 'Win as white and as black', points: 30,
    earned: (s) => s.wonAsWhite >= 1 && s.wonAsBlack >= 1 },
  { id: 'twisted-victory', name: 'Twisted Victory', description: 'Win on a non-classic topology', points: 30,
    earned: (s) => s.wonOffClassic >= 1 },
  // -------- exploring the catalog --------
  { id: 'tourist', name: 'Tourist', description: 'Play on 3 different topologies', points: 20,
    earned: (s) => s.topologies.size >= 3 },
  { id: 'explorer', name: 'Explorer', description: 'Play on 8 different topologies', points: 50,
    earned: (s) => s.topologies.size >= 8 },
  { id: 'atlas', name: 'Atlas', description: 'Play on every topology in the catalog', points: 150,
    earned: (s) => s.topologies.size >= TOPOLOGIES.length },
  { id: 'polyglot', name: 'Polyglot', description: 'Play 2 different game types', points: 20,
    earned: (s) => s.variants.size >= 2 },
  { id: 'completionist', name: 'Completionist', description: 'Play every online game type', points: 60,
    earned: (s) => s.variants.size >= ONLINE_GAME_COUNT },
];

export const TOTAL_ACHIEVEMENT_POINTS = ACHIEVEMENTS.reduce((sum, a) => sum + a.points, 0);

// Waiting games count as "started" for the creator but not as exploration or
// play — a board nobody joined was never played on.
export function playerStats(rows: StatsGameRow[], playerId: string): PlayerStats {
  const s: PlayerStats = {
    started: 0, finished: 0, won: 0, wonAsWhite: 0, wonAsBlack: 0,
    wonOffClassic: 0, topologies: new Set(), variants: new Set(),
  };
  for (const g of rows) {
    if (g.white_player !== playerId && g.black_player !== playerId) continue;
    if (g.white_player === playerId) s.started++;
    if (g.status === 'waiting') continue;
    s.variants.add(g.variant);
    if (g.topology) s.topologies.add(g.topology);
    if (g.status !== 'done') continue;
    s.finished++;
    if (g.winner === playerId) {
      s.won++;
      if (g.white_player === playerId) s.wonAsWhite++;
      else s.wonAsBlack++;
      if (g.topology && g.topology !== 'classic') s.wonOffClassic++;
    }
  }
  return s;
}

export function earnedAchievements(s: PlayerStats): Achievement[] {
  return ACHIEVEMENTS.filter((a) => a.earned(s));
}

export function achievementPoints(earned: Achievement[]): number {
  return earned.reduce((sum, a) => sum + a.points, 0);
}
