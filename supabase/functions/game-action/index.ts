// game-action(game_id, action) -> { game }
// Off-board actions on an active game: resign (either seated player, on or
// off turn), offer-draw, accept-draw, decline-draw (decline doubles as the
// offerer's retract). No engine involvement — these never touch board_state,
// and a game ended here keeps board_state.gameOver null, which is how clients
// tell resignation/agreement apart from an on-board end.
//
// Every write is a conditional update re-asserting the state it read (status
// still active, offer still present/absent), so a racing move or action loses
// cleanly: zero rows updated -> 409, client refetches.

import { corsHeaders, json } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';

const ACTIONS = ['resign', 'offer-draw', 'accept-draw', 'decline-draw'] as const;
type Action = (typeof ACTIONS)[number];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await requireUser(req);
    if (!user) return json({ error: 'unauthorized' }, 401);

    const { game_id, action } = await req.json();
    if (typeof game_id !== 'string' || !ACTIONS.includes(action as Action)) {
      return json({ error: 'game_id and action (resign|offer-draw|accept-draw|decline-draw) required' }, 400);
    }

    const svc = serviceClient();
    const { data: game, error: loadErr } = await svc
      .from('games').select('*').eq('id', game_id).single();
    if (loadErr || !game) return json({ error: 'not found' }, 404);
    if (game.status !== 'active') return json({ error: 'game not active' }, 409);
    if (game.white_player !== user.id && game.black_player !== user.id) {
      return json({ error: 'not seated in this game' }, 403);
    }
    const opponent = game.white_player === user.id ? game.black_player : game.white_player;

    const now = new Date().toISOString();
    let query;
    switch (action as Action) {
      case 'resign':
        query = svc.from('games')
          .update({ status: 'done', winner: opponent, turn: null, draw_offer: null, updated_at: now })
          .eq('id', game_id).eq('status', 'active');
        break;
      case 'offer-draw':
        if (game.draw_offer === user.id) return json({ error: 'draw already offered' }, 409);
        if (game.draw_offer) return json({ error: 'opponent already offered — accept instead' }, 409);
        query = svc.from('games')
          .update({ draw_offer: user.id, updated_at: now })
          .eq('id', game_id).eq('status', 'active').is('draw_offer', null);
        break;
      case 'accept-draw':
        if (game.draw_offer !== opponent) return json({ error: 'no draw offer from your opponent' }, 409);
        query = svc.from('games')
          .update({ status: 'done', winner: null, turn: null, draw_offer: null, updated_at: now })
          .eq('id', game_id).eq('status', 'active').eq('draw_offer', opponent);
        break;
      case 'decline-draw':
        if (!game.draw_offer) return json({ error: 'no pending draw offer' }, 409);
        query = svc.from('games')
          .update({ draw_offer: null, updated_at: now })
          .eq('id', game_id).eq('status', 'active').eq('draw_offer', game.draw_offer);
        break;
    }

    const { data, error } = await query.select('*').single();
    if (error || !data) return json({ error: 'conflicting update, refetch' }, 409);
    return json({ game: data });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 400);
  }
});
