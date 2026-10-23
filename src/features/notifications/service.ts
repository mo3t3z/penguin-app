import { supabase } from '@/lib/supabase';
import type { AppNotification, Profile } from '@/lib/database.types';

function client() {
  if (!supabase) throw new Error('Notifications are not configured.');
  return supabase;
}

export type NotificationItem = AppNotification & {
  actor: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'> | null;
};

const PAGE = 50;

// The newest notices for the signed-in student; row-level security limits them to
// their own.
export async function getNotifications(): Promise<NotificationItem[]> {
  const { data, error } = await client().from('notifications')
    .select('id,recipient_id,actor_id,type,post_id,comment_id,created_at,read_at,actor:profiles!notifications_actor_id_fkey(id,username,display_name,avatar_url)')
    .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE);
  if (error) throw error;
  return (data ?? []) as unknown as NotificationItem[];
}

export async function getUnreadNotificationCount() {
  const { data, error } = await client().rpc('get_unread_notification_count');
  if (error) throw error;
  return Number(data ?? 0);
}

// Marks read everything up to the newest notice the student has seen.
export async function markNotificationsRead(until: string | null) {
  const { error } = await client().rpc('mark_notifications_read', { p_until: until });
  if (error) throw error;
}
