// Supabase clients for Edge Functions. SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY are injected into the function environment by the
// platform - never hard-code them.

import { createClient, type User } from 'npm:@supabase/supabase-js@2';

// Privileged client: bypasses RLS. Use for all game-table writes.
export function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

// Resolve the caller from the request's Authorization header (the user's JWT).
// Returns null if unauthenticated.
export async function requireUser(req: Request): Promise<User | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: { user } } = await client.auth.getUser();
  return user;
}
