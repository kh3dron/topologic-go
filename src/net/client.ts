// Typed Supabase client, created from Vite env. Online play is optional: if the
// env vars are absent (e.g. a build without them), `supabase` is null and
// `hasSupabase` is false, so the offline playground keeps working untouched.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const hasSupabase = Boolean(url && anon);

export const supabase: SupabaseClient<Database> | null =
  hasSupabase ? createClient<Database>(url!, anon!) : null;

export function requireClient(): SupabaseClient<Database> {
  if (!supabase) {
    throw new Error('Supabase is not configured (set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
  }
  return supabase;
}
