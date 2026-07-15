// create-game(variant, topology?, opponent?) -> { game }
// Opens a new game in 'waiting', seats the caller as white_player, and sets the
// canonical initial board_state from the engine. With `opponent` (a profile id)
// the game is a directed challenge: only that player may claim the open seat.

import { corsHeaders, json } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { initialBoardState } from '../_shared/engine.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await requireUser(req);
    if (!user) return json({ error: 'unauthorized' }, 401);

    const { variant, topology, opponent } = await req.json();
    if (typeof variant !== 'string') return json({ error: 'variant required' }, 400);
    if (opponent != null && typeof opponent !== 'string') return json({ error: 'invalid opponent' }, 400);
    if (opponent === user.id) return json({ error: 'cannot challenge yourself' }, 400);

    // Throws on unknown variant/topology -> caught below as 400.
    const { boardState } = initialBoardState(variant, topology ?? null);

    const svc = serviceClient();

    if (opponent) {
      const { data: prof } = await svc.from('profiles').select('id').eq('id', opponent).maybeSingle();
      if (!prof) return json({ error: 'opponent not found' }, 404);
    }

    const { data, error } = await svc
      .from('games')
      .insert({
        variant,
        topology: topology ?? null,
        white_player: user.id,
        invited_player: opponent ?? null,
        status: 'waiting',
        board_state: boardState,
      })
      .select()
      .single();

    if (error) return json({ error: error.message }, 400);
    return json({ game: data });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 400);
  }
});
