import type { NotificationType } from '@/lib/database.types';

// The sentence after the actor's name, and where tapping a notice goes. Pure, so it
// can be unit tested.
export const notificationSentence: Record<NotificationType, string> = {
  post_comment: 'commented on your post.',
  connection_comment: 'commented on a post by one of your connections.',
  connection_request: 'wants to connect with you.',
  connection_accepted: 'accepted your connection request.',
  connection_photo: 'shared a new photo.',
};

export type NotificationTarget =
  | { kind: 'post'; postId: string }
  | { kind: 'requests' }
  | { kind: 'profile'; profileId: string }
  | null;

export function notificationTarget(notice: { type: NotificationType; post_id: string | null; actor_id: string | null }): NotificationTarget {
  if (notice.type === 'connection_request') return { kind: 'requests' };
  if (notice.type === 'connection_accepted') return notice.actor_id ? { kind: 'profile', profileId: notice.actor_id } : null;
  return notice.post_id ? { kind: 'post', postId: notice.post_id } : null;
}

// "now", "5m", "3h", "2d", then a short date.
export function notificationAge(createdAt: string, now = Date.now(), locale = 'en-US') {
  const then = Date.parse(createdAt);
  if (!Number.isFinite(then)) return '';
  const minutes = Math.max(0, Math.floor((now - then) / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 60 * 24 * 7) return `${Math.floor(minutes / (60 * 24))}d`;
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(then);
}
