import { supabase } from '@/lib/supabase';
import type { Connection, Profile } from '@/lib/database.types';
import { requireUuid } from '@/features/posts/validation';
import { canonicalPair, connectionStateFor, otherInPair } from './connection-state';

function client() {
  if (!supabase) throw new Error('Connections are not configured.');
  return supabase;
}

const CONNECTION = 'user_low,user_high,requester_id,status,created_at,updated_at,responded_at' as const;

export async function getConnectionState(viewerId: string, otherId: string) {
  const { low, high } = canonicalPair(requireUuid(viewerId), requireUuid(otherId));
  const { data, error } = await client().from('connections').select(CONNECTION)
    .eq('user_low', low).eq('user_high', high).maybeSingle();
  if (error) throw error;
  return connectionStateFor(data, viewerId);
}

// Every write goes through a database function that checks blocks and who may act.
export async function requestConnection(otherId: string) {
  const { data, error } = await client().rpc('request_connection', { p_target: requireUuid(otherId) });
  if (error) throw error;
  return data === 'accepted' ? 'connected' as const : 'outgoing' as const;
}
export async function respondToConnection(requesterId: string, accept: boolean) {
  const { error } = await client().rpc('respond_connection', { p_requester: requireUuid(requesterId), p_accept: accept });
  if (error) throw error;
  return accept ? 'connected' as const : 'none' as const;
}
export async function removeConnection(otherId: string) {
  const { error } = await client().rpc('remove_connection', { p_other: requireUuid(otherId) });
  if (error) throw error;
  return 'none' as const;
}

export type ConnectionRequest = {
  requester: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;
  createdAt: string;
};

// Requests waiting for the viewer, newest first.
export async function getIncomingRequests(viewerId: string): Promise<ConnectionRequest[]> {
  const id = requireUuid(viewerId);
  const { data, error } = await client().from('connections').select(CONNECTION)
    .eq('status', 'pending').neq('requester_id', id).or(`user_low.eq.${id},user_high.eq.${id}`)
    .order('updated_at', { ascending: false }).limit(50);
  if (error) throw error;
  const rows = (data ?? []) as Connection[];
  if (!rows.length) return [];
  const ids = rows.map(row => otherInPair(row, id));
  const profiles = await client().from('profiles').select('id,username,display_name,avatar_url').in('id', ids);
  if (profiles.error) throw profiles.error;
  const byId = new Map((profiles.data ?? []).map(profile => [profile.id, profile]));
  return rows.flatMap(row => {
    const requester = byId.get(otherInPair(row, id));
    return requester ? [{ requester, createdAt: row.updated_at }] : [];
  });
}

export async function getProfileStats(profileId: string) {
  const { data, error } = await client().rpc('get_profile_stats', { p_profile: requireUuid(profileId) });
  if (error) throw error;
  const row = data?.[0];
  return { posts: Number(row?.post_count ?? 0), connections: Number(row?.connection_count ?? 0) };
}
