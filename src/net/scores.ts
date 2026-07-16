// Snake leaderboard network layer. Scores are server-written only: the
// submit-snake-score Edge Function replays the run log through the shared
// engine and upserts the player's best per topology; clients just read.

import type { Database } from '../database.types';
import { requireClient } from './client';
import { invoke } from './games';
import type { SnakeRunLog } from '../snake';

export type SnakeScoreRow = Database['public']['Tables']['snake_scores']['Row'];

export interface SubmitResult {
  score: number;
  best: number;
  improved: boolean;
}

export function submitSnakeScore(log: SnakeRunLog): Promise<SubmitResult> {
  return invoke('submit-snake-score', {
    topology: log.topology,
    food_rands: log.foodRands,
    events: log.events,
  });
}

// Every best-score row, highest first; the leaderboard groups by topology
// client-side (13 topologies x a handful of players stays tiny).
export async function listSnakeScores(): Promise<SnakeScoreRow[]> {
  const { data } = await requireClient()
    .from('snake_scores')
    .select('*')
    .order('score', { ascending: false })
    .order('achieved_at', { ascending: true })
    .limit(2000);
  return data ?? [];
}
