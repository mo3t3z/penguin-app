import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/provider';
import {
  beginFeedLoad,
  feedRequestKey,
  FeedRequestRegistry,
  failFeedLoad,
  initialFeedState,
  mergeFeedPosts,
  reconcileFeedPosts,
  type FeedCursor,
  type FeedState,
} from './feed';
import { getFeed } from './service';
import { getPostLikeSummaries, likePost, unlikePost } from './likes-service';
import { postLikeEvents } from './like-events';
import {
  applyPostLikeSync,
  markPostLikesUnavailable,
  mergePostLikeSummaries,
  optimisticPostLikeToggle,
  PostLikeMutationRegistry,
  retainPostLikeStates,
  rollbackPostLike,
  settlePostLike,
} from './likes';
import { getPostCommentCounts } from '../comments/service';
import {
  adjustCommentCount,
  commentCountEvents,
  ensureCommentCounts,
  mergeCommentCounts,
  retainCommentCounts,
} from '../comments/comment-counts';

const feedError = 'Penguin could not load posts. Check your connection and try again.';
const likesError = 'Likes are unavailable. Pull to refresh to try again.';
const likeMutationError = 'Penguin could not update this like. Try again.';
const commentsError = 'Comments are unavailable. Pull to refresh to try again.';

// authorId limits the list to one student's posts (Profile tab, student profile).
// search (a canonical search key) limits it to posts containing every word.
// likedOnly limits it to posts the signed-in user liked (own profile, Liked tab).
// State is always scoped to the signed-in user, so switching account resets it.
export function usePostsFeed({ pageSize = 20, authorId = null, search = null, likedOnly = false }: {
  pageSize?: number;
  authorId?: string | null;
  search?: string | null;
  likedOnly?: boolean;
} = {}) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new Error('Feed page size must be between 1 and 50.');
  }
  const { session, loading: authLoading, recovery } = useAuth();
  const userId = session?.user.id ?? null;
  const enabled = Boolean(userId) && !authLoading && !recovery;
  const [state, setState] = useState<FeedState>(initialFeedState);
  const stateRef = useRef(state);
  const generation = useRef(0);
  const accountGeneration = useRef(0);
  const loadingMore = useRef(false);
  const controllers = useRef(new Set<AbortController>());
  const requests = useRef(new FeedRequestRegistry());
  const likeMutations = useRef(new PostLikeMutationRegistry());
  const likeVersions = useRef(new Map<string, number>());
  const commentVersions = useRef(new Map<string, number>());
  const likeSource = useRef({});
  const updateState = useCallback((updater: (current: FeedState) => FeedState) => {
    setState((current) => {
      const next = updater(current);
      stateRef.current = next;
      return next;
    });
  }, []);

  const load = useCallback(async (cursor: FeedCursor | undefined, append: boolean) => {
    if (!enabled || !userId || (append && (loadingMore.current || requests.current.has('refresh')))) return;
    const requestKey = feedRequestKey(cursor);
    if (requests.current.has(requestKey)) return;
    if (!append) {
      generation.current += 1;
      loadingMore.current = false;
      controllers.current.forEach((activeController) => activeController.abort());
      controllers.current.clear();
      requests.current.clear();
    }
    if (!requests.current.begin(requestKey)) return;
    const request = ++generation.current;
    const controller = new AbortController();
    controllers.current.add(controller);
    if (append) loadingMore.current = true;
    updateState((current) => beginFeedLoad(current, userId, append));
    try {
      const page = await getFeed({ cursor, limit: pageSize, signal: controller.signal, authorId, search, likedOnly });
      if (request !== generation.current) return;
      const postIds = page.items.map(({ id }) => id);
      const likeSnapshot = new Map(postIds.map((postId) => [postId, {
        version: likeVersions.current.get(postId) ?? 0,
        pending: stateRef.current.likesByPostId[postId]?.pending ?? false,
      }]));
      const commentSnapshot = new Map(postIds.map((postId) => [postId, commentVersions.current.get(postId) ?? 0]));
      updateState((current) => {
        const items = append && current.userId === userId
          ? mergeFeedPosts(current.items, page.items)
          : reconcileFeedPosts(current.userId === userId ? current.items : [], page.items);
        const currentLikes = current.userId === userId ? current.likesByPostId : {};
        const currentComments = current.userId === userId ? current.commentCountsByPostId : {};
        const likesByPostId = append
          ? markPostLikesUnavailable(currentLikes, postIds, null)
          : retainPostLikeStates(markPostLikesUnavailable(currentLikes, postIds, null), items.map(({ id }) => id));
        const commentCountsByPostId = append
          ? ensureCommentCounts(currentComments, postIds, null)
          : retainCommentCounts(ensureCommentCounts(currentComments, postIds, null), items.map(({ id }) => id));
        return {
          userId,
          status: items.length ? 'ready' : 'empty',
          items,
          nextCursor: page.nextCursor,
          loadingMore: false,
          error: null,
          errorKind: null,
          likesByPostId,
          commentCountsByPostId,
        };
      });
      const [likesResult, commentsResult] = await Promise.allSettled([
        getPostLikeSummaries(postIds, { signal: controller.signal }),
        getPostCommentCounts(postIds, { signal: controller.signal }),
      ]);
      if (request !== generation.current) return;
      updateState((current) => {
        if (current.userId !== userId) return current;
        const likesByPostId = likesResult.status === 'fulfilled'
          ? mergePostLikeSummaries(
            current.likesByPostId,
            postIds,
            likesResult.value,
            (postId, likeState) => {
              const snapshot = likeSnapshot.get(postId);
              return Boolean(snapshot
                && !snapshot.pending
                && !likeState?.pending
                && snapshot.version === (likeVersions.current.get(postId) ?? 0));
            },
          )
          : markPostLikesUnavailable(current.likesByPostId, postIds, likesError);
        const commentCountsByPostId = commentsResult.status === 'fulfilled'
          ? mergeCommentCounts(
            current.commentCountsByPostId,
            postIds,
            commentsResult.value,
            (postId) => commentSnapshot.get(postId) === (commentVersions.current.get(postId) ?? 0),
          )
          : ensureCommentCounts(current.commentCountsByPostId, postIds, commentsError);
        if (likesByPostId === current.likesByPostId
          && commentCountsByPostId === current.commentCountsByPostId) return current;
        return { ...current, likesByPostId, commentCountsByPostId };
      });
    } catch {
      if (request !== generation.current) return;
      updateState((current) => failFeedLoad(current, userId, append, feedError));
    } finally {
      controllers.current.delete(controller);
      requests.current.finish(requestKey);
      if (request === generation.current) loadingMore.current = false;
    }
  }, [authorId, enabled, likedOnly, pageSize, search, updateState, userId]);

  useEffect(() => {
    const requestControllers = controllers.current;
    const requestRegistry = requests.current;
    const mutationRegistry = likeMutations.current;
    const versions = likeVersions.current;
    const countVersions = commentVersions.current;
    let active = true;
    if (!enabled) {
      accountGeneration.current += 1;
      generation.current += 1;
      loadingMore.current = false;
      requestControllers.forEach((controller) => controller.abort());
      requestControllers.clear();
      requestRegistry.clear();
      mutationRegistry.clear();
      versions.clear();
      countVersions.clear();
      void Promise.resolve().then(() => {
        if (active) updateState(() => initialFeedState());
      });
      return () => { active = false; };
    }
    // Start after the effect has subscribed so React does not receive a
    // synchronous state update from the effect body.
    void Promise.resolve().then(() => {
      if (active) return load(undefined, false);
    });
    return () => {
      active = false;
      accountGeneration.current += 1;
      generation.current += 1;
      loadingMore.current = false;
      requestControllers.forEach((controller) => controller.abort());
      requestControllers.clear();
      requestRegistry.clear();
      mutationRegistry.clear();
      versions.clear();
      countVersions.clear();
    };
  }, [enabled, load, updateState]);

  useEffect(() => commentCountEvents.subscribe((event) => {
    if (!enabled || event.userId !== userId) return;
    commentVersions.current.set(event.postId, (commentVersions.current.get(event.postId) ?? 0) + 1);
    updateState((current) => {
      if (current.userId !== userId) return current;
      const commentCountsByPostId = adjustCommentCount(current.commentCountsByPostId, event.postId, event.delta);
      return commentCountsByPostId === current.commentCountsByPostId ? current : { ...current, commentCountsByPostId };
    });
  }), [enabled, updateState, userId]);

  // Like changes made in another list showing the same post.
  useEffect(() => postLikeEvents.subscribe((event) => {
    if (!enabled || event.userId !== userId || event.source === likeSource.current) return;
    if (!stateRef.current.likesByPostId[event.postId]) return;
    // A summary request already in flight must not overwrite this newer value.
    likeVersions.current.set(event.postId, (likeVersions.current.get(event.postId) ?? 0) + 1);
    updateState((current) => {
      if (current.userId !== userId) return current;
      const likesByPostId = applyPostLikeSync(current.likesByPostId, event.postId, event);
      return likesByPostId === current.likesByPostId ? current : { ...current, likesByPostId };
    });
  }), [enabled, updateState, userId]);

  const toggleLike = useCallback(async (postId: string) => {
    if (!enabled || !userId || !likeMutations.current.begin(userId, postId)) return;
    const current = stateRef.current;
    const previous = current.userId === userId ? current.likesByPostId[postId] : undefined;
    if (!previous || previous.count === null || previous.pending) {
      likeMutations.current.finish(userId, postId);
      return;
    }
    const account = accountGeneration.current;
    const version = (likeVersions.current.get(postId) ?? 0) + 1;
    likeVersions.current.set(postId, version);
    updateState((latest) => latest.userId !== userId ? latest : {
      ...latest,
      likesByPostId: {
        ...latest.likesByPostId,
        [postId]: optimisticPostLikeToggle(latest.likesByPostId[postId] ?? previous),
      },
    });
    const optimistic = optimisticPostLikeToggle(previous);
    if (optimistic.count !== null) {
      postLikeEvents.publish({ userId, postId, count: optimistic.count, likedByMe: optimistic.likedByMe, source: likeSource.current });
    }
    try {
      await (previous.likedByMe ? unlikePost(postId) : likePost(postId));
      if (account !== accountGeneration.current || version !== likeVersions.current.get(postId)) return;
      updateState((latest) => {
        const likeState = latest.userId === userId ? latest.likesByPostId[postId] : undefined;
        if (!likeState) return latest;
        return { ...latest, likesByPostId: { ...latest.likesByPostId, [postId]: settlePostLike(likeState) } };
      });
    } catch {
      if (account !== accountGeneration.current || version !== likeVersions.current.get(postId)) return;
      updateState((latest) => latest.userId !== userId || !latest.likesByPostId[postId] ? latest : {
        ...latest,
        likesByPostId: { ...latest.likesByPostId, [postId]: rollbackPostLike(previous, likeMutationError) },
      });
      // Other lists return to the value from before the failed change.
      postLikeEvents.publish({ userId, postId, count: previous.count, likedByMe: previous.likedByMe, source: likeSource.current });
    } finally {
      likeMutations.current.finish(userId, postId);
    }
  }, [enabled, updateState, userId]);

  const refresh = useCallback(() => load(undefined, false), [load]);
  const loadMore = useCallback(() => {
    if (state.userId !== userId || !state.nextCursor || state.loadingMore) return Promise.resolve();
    return load(state.nextCursor, true);
  }, [load, state.loadingMore, state.nextCursor, state.userId, userId]);

  const visible = enabled && state.userId === userId ? state : initialFeedState();
  return { ...visible, refresh, loadMore, toggleLike };
}
