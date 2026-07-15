// cancel-game(game_id) -> { ok: true }
// Deletes a 'waiting' game: the creator cancels their own open game or
// challenge, the invited player declines a challenge. Active games end through
// submit-move (resign), never through cancellation.

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
      .from('games').select('id, status, white_player, invited_player').eq('id', game_id).single();
    if (loadErr || !game) return json({ error: 'not found' }, 404);
    if (game.status !== 'waiting') return json({ error: 'game already started' }, 409);
    if (game.white_player !== user.id && game.invited_player !== user.id) {
      return json({ error: 'not your game to cancel' }, 403);
    }

    const { error } = await svc
      .from('games').delete().eq('id', game_id).eq('status', 'waiting');
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 400);
  }
});
