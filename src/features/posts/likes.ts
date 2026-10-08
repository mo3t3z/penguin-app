import type { PostLikeSummary } from '../../lib/database.types';

export type PostLikeState = {
  count: number | null;
  likedByMe: boolean;
  pending: boolean;
  error: string | null;
};

export type PostLikesById = Record<string, PostLikeState>;

export const unavailablePostLikeState = (message: string | null = null): PostLikeState => ({
  count: null,
  likedByMe: false,
  pending: false,
  error: message,
});

function sameLikeState(left: PostLikeState | undefined, right: PostLikeState) {
  return Boolean(left
    && left.count === right.count
    && left.likedByMe === right.likedByMe
    && left.pending === right.pending
    && left.error === right.error);
}

export function mergePostLikeSummaries(
  current: PostLikesById,
  postIds: readonly string[],
  summaries: readonly PostLikeSummary[],
  canApply: (postId: string, current: PostLikeState | undefined) => boolean = () => true,
): PostLikesById {
  const rows = new Map(summaries.map((summary) => [summary.post_id, summary]));
  let changed = false;
  const next = { ...current };
  for (const postId of postIds) {
    const existing = current[postId];
    if (!canApply(postId, existing)) continue;
    const row = rows.get(postId);
    const candidate: PostLikeState = {
      count: row?.like_count ?? 0,
      likedByMe: row?.liked_by_me ?? false,
      pending: false,
      error: null,
    };
    if (sameLikeState(existing, candidate)) continue;
    next[postId] = candidate;
    changed = true;
  }
  return changed ? next : current;
}

export function markPostLikesUnavailable(
  current: PostLikesById,
  postIds: readonly string[],
  message: string | null,
): PostLikesById {
  let changed = false;
  const next = { ...current };
  for (const postId of postIds) {
    const existing = current[postId];
    if (existing && (existing.count !== null || existing.pending)) continue;
    const candidate = unavailablePostLikeState(message);
    if (sameLikeState(existing, candidate)) continue;
    next[postId] = candidate;
    changed = true;
  }
  return changed ? next : current;
}

export function retainPostLikeStates(current: PostLikesById, postIds: readonly string[]) {
  const retained: PostLikesById = {};
  let count = 0;
  for (const postId of postIds) {
    const state = current[postId];
    if (state) {
      retained[postId] = state;
      count += 1;
    }
  }
  return count === Object.keys(current).length ? current : retained;
}

export function optimisticPostLikeToggle(current: PostLikeState): PostLikeState {
  if (current.count === null || current.pending) return current;
  return {
    count: Math.max(0, current.count + (current.likedByMe ? -1 : 1)),
    likedByMe: !current.likedByMe,
    pending: true,
    error: null,
  };
}

export function settlePostLike(current: PostLikeState): PostLikeState {
  return current.pending ? { ...current, pending: false, error: null } : current;
}

export function rollbackPostLike(previous: PostLikeState, message: string): PostLikeState {
  return { ...previous, pending: false, error: message };
}

export class PostLikeMutationRegistry {
  private active = new Set<string>();

  begin(userId: string, postId: string) {
    const key = `${userId}:${postId}`;
    if (this.active.has(key)) return false;
    this.active.add(key);
    return true;
  }

  finish(userId: string, postId: string) {
    this.active.delete(`${userId}:${postId}`);
  }

  clear() {
    this.active.clear();
  }
}
