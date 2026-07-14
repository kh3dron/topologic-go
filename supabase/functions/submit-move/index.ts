// submit-move(game_id, expected_ply, move) -> { game }
// The authoritative move path: verify the caller owns the turn, validate the
// move with the shared engine, then commit atomically via the apply_move RPC
// (optimistic-concurrency guarded on ply).

import { corsHeaders, json } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { validateAndApply } from '../_shared/engine.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await requireUser(req);
    if (!user) return json({ error: 'unauthorized' }, 401);

    const { game_id, expected_ply, move } = await req.json();
    if (typeof game_id !== 'string' || typeof expected_ply !== 'number' || move == null) {
      return json({ error: 'game_id, expected_ply, move required' }, 400);
    }

    const svc = serviceClient();
    const { data: game, error: loadErr } = await svc
      .from('games').select('*').eq('id', game_id).single();
    if (loadErr || !game) return json({ error: 'not found' }, 404);
    if (game.status !== 'active') return json({ error: 'game not active' }, 409);
    if (game.turn !== user.id) return json({ error: 'not your turn' }, 403);
    if (game.ply !== expected_ply) return json({ error: 'stale ply', ply: game.ply }, 409);

    const applied = validateAndApply(game.variant, game.board_state, move);
    if (!applied) return json({ error: 'illegal move' }, 422);

    const { boardState, result } = applied;
    const nextTurn = result.status === 'active' ? game[`${result.turn}_player`] : null;
    const status = result.status === 'active' ? 'active' : 'done';
    const winner = result.status === 'done' && result.winner !== 'draw'
      ? game[`${result.winner}_player`]
      : null;

    const { data, error } = await svc.rpc('apply_move', {
      p_game_id: game_id,
      p_expected_ply: expected_ply,
      p_player: user.id,
      p_move: move,
      p_board_state: boardState,
      p_turn: nextTurn,
      p_status: status,
      p_winner: winner,
    });

    if (error) return json({ error: error.message }, 409);
    if (!data) return json({ error: 'stale write, refetch' }, 409);
    return json({ game: data });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 400);
  }
});
