// report-error(message, stack?, page?, version?) -> { ok }
// Sink for client-side error reports (window.onerror / unhandledrejection,
// see src/report.ts). Unauthenticated by design - errors hit signed-out
// visitors too. Inserts via the service role into client_errors, which has no
// client policies at all. Every field is length-clipped server-side, so a
// hostile client can at worst write noise rows.

import { corsHeaders, json } from '../_shared/http.ts';
import { serviceClient } from '../_shared/supabase.ts';

function clip(v: unknown, n: number): string | null {
  return typeof v === 'string' && v.length > 0 ? v.slice(0, n) : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { message, stack, page, version } = await req.json();
    const msg = clip(message, 500);
    if (!msg) return json({ error: 'message required' }, 400);

    const { error } = await serviceClient().from('client_errors').insert({
      message: msg,
      stack: clip(stack, 4000),
      page: clip(page, 200),
      version: clip(version, 40),
      user_agent: clip(req.headers.get('user-agent'), 200),
    });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 400);
  }
});
