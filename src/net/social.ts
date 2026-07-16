// Friends + challenges. Friendship edges are client-written under RLS (they
// carry no game state, so there is nothing for the server to arbitrate).
// Challenges are games rows with invited_player set — those stay behind the
// Edge Functions like every other games write.

import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Profile } from './auth';
import { requireClient } from './client';

export interface FriendEdge {
  requester: string;
  addressee: string;
  status: 'pending' | 'accepted';
  // The counterpart's profile, from my point of view.
  other: Profile;
  direction: 'incoming' | 'outgoing';
}

// Case-insensitive exact lookup (matches the unique lower(username) index).
export async function findProfileByUsername(username: string): Promise<Profile | null> {
  const { data } = await requireClient()
    .from('profiles')
    .select('id, username, rating')
    .ilike('username', username.replace(/[%_]/g, '\\$&'))
    .maybeSingle();
  return data;
}

// Every registered player, best rating first (profiles are world-readable).
export async function listProfiles(): Promise<Profile[]> {
  const { data } = await requireClient()
    .from('profiles')
    .select('id, username, rating')
    .order('rating', { ascending: false })
    .order('username')
    .limit(500);
  return data ?? [];
}

export async function fetchProfiles(ids: string[]): Promise<Map<string, Profile>> {
  if (ids.length === 0) return new Map();
  const { data } = await requireClient()
    .from('profiles')
    .select('id, username, rating')
    .in('id', [...new Set(ids)]);
  return new Map((data ?? []).map((p) => [p.id, p]));
}

// All my edges (accepted friends + pending requests both ways), with the other
// side's profile resolved.
export async function listFriendships(me: string): Promise<FriendEdge[]> {
  const { data: rows, error } = await requireClient()
    .from('friendships')
    .select('*')
    .or(`requester.eq.${me},addressee.eq.${me}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const profiles = await fetchProfiles(rows.map((r) => (r.requester === me ? r.addressee : r.requester)));
  const edges: FriendEdge[] = [];
  for (const r of rows) {
    const otherId = r.requester === me ? r.addressee : r.requester;
    const other = profiles.get(otherId);
    if (!other) continue;
    edges.push({
      requester: r.requester,
      addressee: r.addressee,
      status: r.status as FriendEdge['status'],
      other,
      direction: r.requester === me ? 'outgoing' : 'incoming',
    });
  }
  return edges;
}

export async function requestFriend(me: string, username: string): Promise<Profile> {
  const prof = await findProfileByUsername(username);
  if (!prof) throw new Error(`No player named "${username}".`);
  if (prof.id === me) throw new Error('That would be you.');
  const { error } = await requireClient()
    .from('friendships')
    .insert({ requester: me, addressee: prof.id });
  if (error) {
    throw new Error(error.code === '23505' ? 'Already friends (or a request is pending).' : error.message);
  }
  return prof;
}

export async function acceptFriend(requesterId: string, me: string): Promise<void> {
  const { error } = await requireClient()
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('requester', requesterId)
    .eq('addressee', me);
  if (error) throw error;
}

// Cancel an outgoing request, decline an incoming one, or unfriend.
export async function removeFriendship(requesterId: string, addresseeId: string): Promise<void> {
  const { error } = await requireClient()
    .from('friendships')
    .delete()
    .eq('requester', requesterId)
    .eq('addressee', addresseeId);
  if (error) throw error;
}

// One channel covering everything that should refresh the hub: friendship
// edges touching me and games where I hold a seat or an invite. Callers get a
// single "something changed" signal and re-fetch.
export function subscribeSocial(me: string, onChange: () => void): RealtimeChannel {
  const ch = requireClient().channel(`social:${me}`);
  const tables: Array<{ table: string; filter: string }> = [
    { table: 'friendships', filter: `requester=eq.${me}` },
    { table: 'friendships', filter: `addressee=eq.${me}` },
    { table: 'games', filter: `white_player=eq.${me}` },
    { table: 'games', filter: `black_player=eq.${me}` },
    { table: 'games', filter: `invited_player=eq.${me}` },
  ];
  for (const { table, filter } of tables) {
    ch.on('postgres_changes', { event: '*', schema: 'public', table, filter }, onChange);
  }
  return ch.subscribe();
}
