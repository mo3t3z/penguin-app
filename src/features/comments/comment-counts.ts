import type { PostCommentCount } from '../../lib/database.types';

export type CommentCountState = { count: number | null; error: string | null };
export type CommentCountsByPostId = Record<string, CommentCountState>;

function sameCount(left: CommentCountState | undefined, right: CommentCountState) {
  return Boolean(left && left.count === right.count && left.error === right.error);
}

export function ensureCommentCounts(
  current: CommentCountsByPostId,
  postIds: readonly string[],
  error: string | null,
) {
  let changed = false;
  const next = { ...current };
  for (const postId of postIds) {
    const existing = current[postId];
    if (existing && existing.count !== null) continue;
    const candidate = { count: null, error };
    if (sameCount(existing, candidate)) continue;
    next[postId] = candidate;
    changed = true;
  }
  return changed ? next : current;
}

export function mergeCommentCounts(
  current: CommentCountsByPostId,
  postIds: readonly string[],
  summaries: readonly PostCommentCount[],
  canApply: (postId: string) => boolean = () => true,
) {
  const rows = new Map(summaries.map((summary) => [summary.post_id, summary.comment_count]));
  let changed = false;
  const next = { ...current };
  for (const postId of postIds) {
    if (!canApply(postId)) continue;
    const candidate = { count: rows.get(postId) ?? 0, error: null };
    if (sameCount(current[postId], candidate)) continue;
    next[postId] = candidate;
    changed = true;
  }
  return changed ? next : current;
}

export function retainCommentCounts(current: CommentCountsByPostId, postIds: readonly string[]) {
  const next: CommentCountsByPostId = {};
  let retained = 0;
  for (const postId of postIds) {
    if (!current[postId]) continue;
    next[postId] = current[postId];
    retained += 1;
  }
  return retained === Object.keys(current).length ? current : next;
}

export function adjustCommentCount(current: CommentCountsByPostId, postId: string, delta: number) {
  const state = current[postId];
  if (!state || state.count === null) return current;
  const next = { count: Math.max(0, state.count + delta), error: null };
  if (sameCount(state, next)) return current;
  return { ...current, [postId]: next };
}

export type CommentCountEvent = { userId: string; postId: string; delta: 1 | -1 };
type CommentCountListener = (event: CommentCountEvent) => void;
const listeners = new Set<CommentCountListener>();

export const commentCountEvents = {
  publish(event: CommentCountEvent) {
    listeners.forEach((listener) => listener(event));
  },
  subscribe(listener: CommentCountListener) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
