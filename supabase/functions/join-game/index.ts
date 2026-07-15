// join-game(game_id) -> { game }
// Atomically claims the empty black seat and activates the game. The first
// mover's colour comes from board_state (chess/hex: white; go: black), mapped
// to the seat that now holds it.

import { corsHeaders, json } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await requireUser(req);
    if (!user) return json({ error: 'unauthorized' }, 401);

    const { game_id } = await req.json();
    if (typeof game_id !== 'string') return json({ error: 'game_id required' }, 400);

    const svc = serviceClient();
    const { data: game, error: loadErr } = await svc
      .from('games').select('*').eq('id', game_id).single();
    if (loadErr || !game) return json({ error: 'not found' }, 404);
    if (game.status !== 'waiting' || game.black_player) return json({ error: 'not joinable' }, 409);
    if (game.white_player === user.id) return json({ error: 'cannot join your own game' }, 409);
    if (game.invited_player && game.invited_player !== user.id) {
      return json({ error: 'this game is a private challenge' }, 403);
    }

    // First mover's seat: white -> creator (white_player); black -> joiner.
    const firstMover: string = game.board_state?.turn ?? 'white';
    const turnPlayer = firstMover === 'white' ? game.white_player : user.id;

    const { data, error } = await svc
      .from('games')
      .update({ black_player: user.id, status: 'active', turn: turnPlayer })
      .eq('id', game_id).eq('status', 'waiting').is('black_player', null)
      .select().single();

    if (error || !data) return json({ error: 'join failed (already taken?)' }, 409);
    return json({ game: data });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 400);
  }
});
