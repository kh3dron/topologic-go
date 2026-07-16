// submit-snake-score(topology, food_rands, events) -> { score, best, improved }
// The leaderboard's only write path. The client sends its full run log and the
// server REPLAYS it through the same pure engine the browser ran, deriving the
// score itself — a submitted number is never trusted. food_rands are the [0,1)
// values the client's Math.random produced for food placement (index 0 seeds
// the initial food, one more per food eaten); events is the input stream in
// order: a positive integer is a run of that many ticks, -1..-4 is a steer
// (up/down/left/right). Replay is deterministic, so the log either reproduces
// a finished game or it is rejected.

import { corsHeaders, json } from '../_shared/http.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { initialSnakeState, setSnakeDir, stepSnake, type Cell } from '../../../src/engine/games/snake.ts';
import { TOPOLOGY_MAP } from '../../../src/topology.ts';

const MAX_EVENTS = 50_000;
const MAX_TICKS = 100_000; // ~4h of play at 150ms/tick
const MAX_RANDS = 170;     // initial food + one per eat; the 13x13 board caps eats at 166

const STEER: Record<number, Cell> = {
  [-1]: [-1, 0], // up
  [-2]: [1, 0],  // down
  [-3]: [0, -1], // left
  [-4]: [0, 1],  // right
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await requireUser(req);
    if (!user) return json({ error: 'unauthorized' }, 401);

    const { topology, food_rands, events } = await req.json();
    const topo = TOPOLOGY_MAP.get(typeof topology === 'string' ? topology : '');
    if (!topo) return json({ error: `unknown topology: ${topology}` }, 400);
    if (!Array.isArray(food_rands) || food_rands.length < 1 || food_rands.length > MAX_RANDS ||
        food_rands.some((r) => typeof r !== 'number' || !(r >= 0 && r < 1))) {
      return json({ error: 'food_rands must be 1..170 numbers in [0,1)' }, 400);
    }
    if (!Array.isArray(events) || events.length > MAX_EVENTS ||
        events.some((e) => !Number.isInteger(e) || e === 0 || e < -4)) {
      return json({ error: 'events must be integers: tick runs (>0) or steer codes (-1..-4)' }, 400);
    }

    // Replay. food_rands[0] seeded the initial food; each eat consumes the next.
    let state = initialSnakeState(topo, food_rands[0]);
    let foodIdx = 1;
    let ticks = 0;
    for (const e of events) {
      if (state.status === 'dead' || state.status === 'won') break;
      if (e < 0) {
        state = setSnakeDir(state, STEER[e]);
        continue;
      }
      ticks += e;
      if (ticks > MAX_TICKS) return json({ error: 'run too long' }, 400);
      for (let i = 0; i < e; i++) {
        const before = state.score;
        state = stepSnake(state, food_rands[foodIdx] ?? 0.5);
        if (state.score > before) foodIdx++;
        if (state.status !== 'playing') break;
      }
    }

    if (state.status !== 'dead' && state.status !== 'won') {
      return json({ error: 'log does not replay to a finished game' }, 422);
    }
    const score = state.score;
    if (score <= 0) return json({ score, best: 0, improved: false });

    const svc = serviceClient();
    const { data: existing, error: readErr } = await svc
      .from('snake_scores').select('score')
      .eq('player', user.id).eq('topology', topo.id).maybeSingle();
    if (readErr) return json({ error: readErr.message }, 500);

    const best = existing?.score ?? 0;
    if (score <= best) return json({ score, best, improved: false });

    const { error: writeErr } = await svc.from('snake_scores').upsert({
      player: user.id,
      topology: topo.id,
      score,
      ticks,
      achieved_at: new Date().toISOString(),
    });
    if (writeErr) return json({ error: writeErr.message }, 500);
    return json({ score, best: score, improved: true });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 400);
  }
});
