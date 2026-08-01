// Realtime verification: subscribe to postgres_changes on a games row over the
// websocket (anon client, same path the browser uses), update the row with the
// service role, assert the UPDATE event arrives.
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.ANON_KEY;
const SVC = process.env.SERVICE_ROLE_KEY;

const anon = createClient(URL, ANON);
const admin = createClient(URL, SVC, { auth: { persistSession: false } });

const { data: game, error } = await admin.from('games')
  .insert({ variant: 'chess', topology: 'classic', board_state: { probe: true } })
  .select().single();
if (error) { console.error('insert failed:', error.message); process.exit(1); }

let received = null;
let subscribed = false;
const channel = anon.channel(`rt-test:${game.id}`)
  .on('postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${game.id}` },
    (payload) => { received = payload.new; })
  .subscribe((status) => {
    console.log('channel status:', status);
    if (status === 'SUBSCRIBED') subscribed = true;
  });

// Keep nudging the row until an event lands: the server confirms the channel
// join before the WAL poller has registered the subscription, so a single
// immediate update can slip through unobserved (real moves arrive much later
// than the subscription, so the app never sees that window).
const deadline = Date.now() + 30000;
let ply = 0;
while (!received && Date.now() < deadline) {
  if (subscribed) await admin.from('games').update({ ply: ++ply }).eq('id', game.id);
  await new Promise((r) => setTimeout(r, 2000));
}

await anon.removeChannel(channel);
await admin.from('games').delete().eq('id', game.id);

if (received) {
  console.log(`REALTIME: PASS (UPDATE event received, ply=${received.ply})`);
  process.exit(0);
}
console.error('REALTIME: FAIL (no event within 30s)');
process.exit(1);
