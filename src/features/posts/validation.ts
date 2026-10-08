import type { FeedCursor } from './feed';

export type { FeedCursor } from './feed';
export type PostPublishAttempt = { clientRequestId: string; content: string };
export const POST_TEXT_LIMIT = 5000;
export function requireUuid(value: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error('Invalid post/media identifier.');
  return value.toLowerCase();
}
export function normalizePostContent(content: string): string {
  if (typeof content !== 'string') throw new Error('Post content must be text.');
  const value = content.trim();
  if (!value || [...value].length > POST_TEXT_LIMIT) throw new Error('Posts require 1–5,000 characters.');
  return value;
}
export function preparePostPublishAttempt(current: PostPublishAttempt | null, content: string, createId: () => string): PostPublishAttempt {
  const normalized = normalizePostContent(content);
  return current?.content === normalized ? current : { clientRequestId: requireUuid(createId()), content: normalized };
}
export function feedCursorFilter(cursor: FeedCursor): string {
  const id = requireUuid(cursor.id);
  const stamp = cursor.createdAt;
  if (typeof stamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(stamp) || !Number.isFinite(Date.parse(stamp))) throw new Error('Invalid feed cursor.');
  // Keep PostgreSQL microseconds intact. Date.toISOString() would truncate them.
  // Strict validation prevents injecting additional PostgREST filter syntax.
  return `created_at.lt.${stamp},and(created_at.eq.${stamp},id.lt.${id})`;
}
