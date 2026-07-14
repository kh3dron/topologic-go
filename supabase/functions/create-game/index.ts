// create-game(variant, topology?) -> { game }
// Opens a new game in 'waiting', seats the caller as white_player, and sets the
// canonical initial board_state from the engine.

import { corsHeaders, json } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { initialBoardState } from '../_shared/engine.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await requireUser(req);
    if (!user) return json({ error: 'unauthorized' }, 401);

    const { variant, topology } = await req.json();
    if (typeof variant !== 'string') return json({ error: 'variant required' }, 400);

    // Throws on unknown variant/topology -> caught below as 400.
    const { boardState } = initialBoardState(variant, topology ?? null);

    const svc = serviceClient();
    const { data, error } = await svc
      .from('games')
      .insert({
        variant,
        topology: topology ?? null,
        white_player: user.id,
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
