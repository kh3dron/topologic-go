// Online game network layer: calls the Edge Functions (server-authoritative
// writes) and reads/subscribes to game state (RLS-guarded reads + Realtime).

import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Database } from '../database.types';
import { requireClient } from './client';

export type GameRow = Database['public']['Tables']['games']['Row'];

// Invoke an Edge Function, surfacing the server's JSON error message on failure.
async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await requireClient().functions.invoke(name, { body });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      const j = ctx ? await ctx.json() : null;
      if (j?.error) message = j.error;
    } catch { /* keep default message */ }
    throw new Error(message);
  }
  return data as T;
}

// `opponent` (a profile id) turns the game into a directed challenge: only
// that player may claim the open seat. `options` is the per-game new-game
// settings bag (e.g. { size } for Go), validated server-side by the engine.
export function createGame(
  variant: string,
  topology: string | null,
  opponent?: string,
  options?: Record<string, unknown>,
): Promise<{ game: GameRow }> {
  return invoke('create-game', {
    variant,
    topology,
    opponent: opponent ?? null,
    options: options ?? null,
  });
}

// Board size of a Go game, read from the serialized state (rows from before
// sizes were configurable lack the explicit field, so fall back to the board).
export function goBoardSizeOf(g: GameRow): number | null {
  if (g.variant !== 'go') return null;
  const bs = g.board_state as { size?: number; board?: unknown[] } | null;
  return bs?.size ?? (Array.isArray(bs?.board) ? bs.board.length : null);
}

export function joinGame(gameId: string): Promise<{ game: GameRow }> {
  return invoke('join-game', { game_id: gameId });
}

// Creator cancels a waiting game; an invited player declines a challenge.
export function cancelGame(gameId: string): Promise<{ ok: true }> {
  return invoke('cancel-game', { game_id: gameId });
}

export function submitMove(gameId: string, expectedPly: number, move: unknown): Promise<{ game: GameRow }> {
  return invoke('submit-move', { game_id: gameId, expected_ply: expectedPly, move });
}

export async function fetchGame(gameId: string): Promise<GameRow | null> {
  const { data } = await requireClient().from('games').select('*').eq('id', gameId).single();
  return data;
}

// Open games anyone may join — challenges (invited_player set) are excluded.
export async function listOpenGames(): Promise<GameRow[]> {
  const { data } = await requireClient()
    .from('games')
    .select('*')
    .eq('status', 'waiting')
    .is('invited_player', null)
    .order('created_at', { ascending: false })
    .limit(20);
  return data ?? [];
}

// Live games for the spectator browse page, most recently moved first.
export async function listActiveGames(): Promise<GameRow[]> {
  const { data } = await requireClient()
    .from('games')
    .select('*')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(50);
  return data ?? [];
}

// Finished games, for player win/played stats (games are world-readable).
export async function listFinishedGames(): Promise<Pick<GameRow, 'white_player' | 'black_player' | 'winner'>[]> {
  const { data } = await requireClient()
    .from('games')
    .select('white_player, black_player, winner')
    .eq('status', 'done')
    .limit(1000);
  return data ?? [];
}

// Everything on my plate: games I'm seated in (waiting or active) plus
// challenges directed at me. Callers partition by status/invite.
export async function listMyGames(userId: string): Promise<GameRow[]> {
  const { data } = await requireClient()
    .from('games')
    .select('*')
    .or(`white_player.eq.${userId},black_player.eq.${userId},invited_player.eq.${userId}`)
    .in('status', ['waiting', 'active'])
    .order('updated_at', { ascending: false })
    .limit(50);
  return data ?? [];
}

// Subscribe to updates on one game row (moves land as UPDATEs to games).
// onReady fires when the channel is live, so the caller can re-fetch and catch
// any update that happened during subscription setup (avoids a missed-event race).
export function subscribeGame(
  gameId: string,
  cb: (game: GameRow) => void,
  onReady?: () => void,
): RealtimeChannel {
  return requireClient()
    .channel(`game:${gameId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
      (payload) => cb(payload.new as GameRow),
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onReady?.();
    });
}
