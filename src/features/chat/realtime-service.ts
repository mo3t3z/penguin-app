import { supabase } from '@/lib/supabase';
import type { LiveClient } from './realtime';

// The Supabase client as the live subscriptions see it. The client sends the
// signed-in student's access token to Realtime and replaces it when the session
// is refreshed, so the server authorizes every channel as that student.
export function liveClient(): LiveClient | null {
  return supabase as unknown as LiveClient | null;
}

// A reload after (re)joining a channel is skipped if one ran this recently, so a
// connection that keeps dropping cannot turn into a stream of requests.
export const RECONCILE_INTERVAL_MS = 5_000;
