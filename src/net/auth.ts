// Auth: passwordless email magic-link sign-in + session/profile helpers.

import type { Session, User } from '@supabase/supabase-js';
import { requireClient } from './client';

export interface Profile {
  id: string;
  username: string;
  rating: number;
}

// Sends a magic link to the given email. The user clicks it to complete sign-in
// (Supabase redirects back to `redirectTo`, default: the current page).
export async function sendMagicLink(email: string, redirectTo?: string): Promise<void> {
  const { error } = await requireClient().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo ?? window.location.href },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await requireClient().auth.signOut();
}

export async function currentUser(): Promise<User | null> {
  const { data } = await requireClient().auth.getUser();
  return data.user;
}

// Fires immediately with the current session, then on every auth change.
// Returns an unsubscribe handle.
export function onAuthChange(cb: (session: Session | null) => void): () => void {
  const { data } = requireClient().auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data } = await requireClient()
    .from('profiles')
    .select('id, username, rating')
    .eq('id', userId)
    .single();
  return data;
}
