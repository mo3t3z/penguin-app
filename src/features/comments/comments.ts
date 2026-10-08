import type { PostComment, Profile } from '../../lib/database.types';

export const COMMENT_TEXT_LIMIT = 1000;

function requireCommentUuid(value: string) {
  if (typeof value !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('Invalid post identifier.');
  }
  return value.toLowerCase();
}

export type CommentAuthor = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;
export type CommentItem = Pick<PostComment, 'id' | 'post_id' | 'author_id' | 'content' | 'created_at' | 'updated_at'> & {
  author: CommentAuthor | null;
};
export type CommentCursor = { createdAt: string; id: string };
export type CommentPage = { items: CommentItem[]; nextCursor: CommentCursor | null };
export type CommentListItem = CommentItem & { optimistic?: boolean; deleting?: boolean };
export type CommentSubmitAttempt = { commentId: string; content: string };
export type CommentsStatus = 'idle' | 'loading' | 'empty' | 'ready' | 'error';
export type CommentsErrorKind = 'refresh' | 'load-more' | null;
export type CommentsState = {
  userId: string | null;
  postId: string | null;
  status: CommentsStatus;
  items: CommentListItem[];
  nextCursor: CommentCursor | null;
  loadingMore: boolean;
  error: string | null;
  errorKind: CommentsErrorKind;
};

export const initialCommentsState = (): CommentsState => ({
  userId: null,
  postId: null,
  status: 'idle',
  items: [],
  nextCursor: null,
  loadingMore: false,
  error: null,
  errorKind: null,
});

export function normalizeCommentContent(content: string) {
  if (typeof content !== 'string') throw new Error('Comment must be text.');
  const normalized = content.trim();
  if (!normalized || [...normalized].length > COMMENT_TEXT_LIMIT) {
    throw new Error(`Comments require 1–${COMMENT_TEXT_LIMIT.toLocaleString('en-US')} characters.`);
  }
  return normalized;
}

export function prepareCommentSubmitAttempt(
  current: CommentSubmitAttempt | null,
  content: string,
  createId: () => string,
) {
  const normalized = normalizeCommentContent(content);
  return current?.content === normalized
    ? current
    : { commentId: requireCommentUuid(createId()), content: normalized };
}

export function commentCursorFilter(cursor: CommentCursor) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor.id)) {
    throw new Error('Invalid comment cursor.');
  }
  const stamp = cursor.createdAt;
  if (typeof stamp !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(stamp)
    || !Number.isFinite(Date.parse(stamp))) {
    throw new Error('Invalid comment cursor.');
  }
  return `created_at.lt.${stamp},and(created_at.eq.${stamp},id.lt.${cursor.id.toLowerCase()})`;
}

export function buildCommentPage(rows: CommentItem[], limit: number): CommentPage {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > limit && last ? { createdAt: last.created_at, id: last.id } : null,
  };
}

export function postCommentCountIds(values: readonly string[]) {
  if (!Array.isArray(values)) throw new Error('Post identifiers must be an array.');
  const ids = [...new Set(values.map(requireCommentUuid))];
  if (ids.length > 50) throw new Error('At most 50 post identifiers are allowed.');
  return ids;
}

export function beginCommentsLoad(current: CommentsState, userId: string, postId: string, append: boolean) {
  if (current.userId === userId && current.postId === postId && current.items.length) {
    return { ...current, status: 'ready' as const, loadingMore: append, error: null, errorKind: null };
  }
  return { ...initialCommentsState(), userId, postId, status: 'loading' as const };
}

export function failCommentsLoad(
  current: CommentsState,
  userId: string,
  postId: string,
  append: boolean,
  error: string,
) {
  if (current.userId === userId && current.postId === postId && current.items.length) {
    return { ...current, status: 'ready' as const, loadingMore: false, error, errorKind: append ? 'load-more' as const : 'refresh' as const };
  }
  return { ...initialCommentsState(), userId, postId, status: 'error' as const, error, errorKind: append ? 'load-more' as const : 'refresh' as const };
}

function sameComment(left: CommentListItem, right: CommentItem) {
  return left.id === right.id
    && left.post_id === right.post_id
    && left.author_id === right.author_id
    && left.content === right.content
    && left.created_at === right.created_at
    && left.updated_at === right.updated_at
    && left.author?.id === right.author?.id
    && left.author?.username === right.author?.username
    && left.author?.display_name === right.author?.display_name
    && left.author?.avatar_url === right.author?.avatar_url;
}

export function mergeCommentPage(current: CommentListItem[], next: CommentItem[]) {
  const seen = new Set(current.map(({ id }) => id));
  const merged = [...current];
  for (const item of next) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}

export function reconcileComments(current: CommentListItem[], next: CommentItem[]) {
  const existing = new Map(current.map((item) => [item.id, item]));
  const pending = current.filter((item) => item.optimistic && !next.some(({ id }) => id === item.id));
  const server = next.map((item) => {
    const previous = existing.get(item.id);
    return previous && !previous.optimistic && !previous.deleting && sameComment(previous, item) ? previous : item;
  });
  return [...pending, ...server];
}

export function markCommentDeleting(items: CommentListItem[], commentId: string) {
  const index = items.findIndex(({ id }) => id === commentId);
  if (index < 0) return null;
  const item = items[index];
  if (item.optimistic || item.deleting) return null;
  const next = [...items];
  next[index] = { ...item, deleting: true };
  return { item, index, items: next };
}

export function confirmCommentDeletion(items: CommentListItem[], commentId: string) {
  return items.filter(({ id }) => id !== commentId);
}

export function restoreDeletingComment(items: CommentListItem[], item: CommentListItem, index: number) {
  const existing = items.findIndex(({ id }) => id === item.id);
  if (existing >= 0) {
    const next = [...items];
    next[existing] = item;
    return next;
  }
  const next = [...items];
  next.splice(Math.min(Math.max(index, 0), next.length), 0, item);
  return next;
}

export class CommentDeletionLocks {
  private readonly active = new Map<string, symbol>();

  begin(userId: string, commentId: string) {
    const key = `${userId}:${commentId}`;
    if (this.active.has(key)) return null;
    const token = Symbol(key);
    this.active.set(key, token);
    return token;
  }

  finish(userId: string, commentId: string, token: symbol) {
    const key = `${userId}:${commentId}`;
    if (this.active.get(key) === token) this.active.delete(key);
  }

  clear() {
    this.active.clear();
  }
}

export async function performLockedCommentDeletion({
  locks,
  userId,
  commentId,
  request,
  onBegin,
  onSuccess,
  onFailure,
  isCurrent = () => true,
}: {
  locks: CommentDeletionLocks;
  userId: string;
  commentId: string;
  request: () => Promise<unknown>;
  onBegin: () => void;
  onSuccess: () => void;
  onFailure: () => void;
  isCurrent?: () => boolean;
}) {
  const token = locks.begin(userId, commentId);
  if (!token) return 'ignored' as const;
  onBegin();
  try {
    await request();
    if (!isCurrent()) return 'stale' as const;
    onSuccess();
    return 'deleted' as const;
  } catch {
    if (!isCurrent()) return 'stale' as const;
    onFailure();
    return 'failed' as const;
  } finally {
    locks.finish(userId, commentId, token);
  }
}
