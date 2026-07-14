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

export function createGame(variant: string, topology: string | null): Promise<{ game: GameRow }> {
  return invoke('create-game', { variant, topology });
}

export function joinGame(gameId: string): Promise<{ game: GameRow }> {
  return invoke('join-game', { game_id: gameId });
}

export function submitMove(gameId: string, expectedPly: number, move: unknown): Promise<{ game: GameRow }> {
  return invoke('submit-move', { game_id: gameId, expected_ply: expectedPly, move });
}

export async function fetchGame(gameId: string): Promise<GameRow | null> {
  const { data } = await requireClient().from('games').select('*').eq('id', gameId).single();
  return data;
}

export async function listOpenGames(): Promise<GameRow[]> {
  const { data } = await requireClient()
    .from('games')
    .select('*')
    .eq('status', 'waiting')
    .order('created_at', { ascending: false })
    .limit(20);
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
