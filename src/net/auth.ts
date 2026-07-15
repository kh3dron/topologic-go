// Auth: email+password registration/sign-in, magic-link fallback, and
// session/profile helpers. Usernames are picked at registration; the signup
// trigger reads them from user metadata and dodges collisions with a suffix.

import type { Session, User } from '@supabase/supabase-js';
import { requireClient } from './client';

export interface Profile {
  id: string;
  username: string;
  rating: number;
}

export const USERNAME_RE = /^[A-Za-z0-9_]{3,24}$/;

// Registers with email + password; the chosen username rides in metadata for
// the profiles trigger. Returns whether email confirmation is still pending
// (project setting) — if so there is no session yet.
export async function signUpWithPassword(
  email: string,
  password: string,
  username: string,
): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await requireClient().auth.signUp({
    email,
    password,
    options: { data: { username }, emailRedirectTo: window.location.href },
  });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { error } = await requireClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
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

// Renames the caller's profile (RLS: owner-only). Surfaces a friendly message
// on the unique-index collision.
export async function updateUsername(userId: string, username: string): Promise<void> {
  if (!USERNAME_RE.test(username)) {
    throw new Error('Usernames are 3-24 letters, digits, or underscores.');
  }
  const { error } = await requireClient().from('profiles').update({ username }).eq('id', userId);
  if (error) throw new Error(error.code === '23505' ? 'That username is taken.' : error.message);
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
