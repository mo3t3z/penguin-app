import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/provider';
import { useProfile } from '@/features/profile/provider';
import {
  beginCommentsLoad,
  CommentDeletionLocks,
  confirmCommentDeletion,
  failCommentsLoad,
  initialCommentsState,
  markCommentDeleting,
  mergeCommentPage,
  performLockedCommentDeletion,
  reconcileComments,
  restoreDeletingComment,
  type CommentCursor,
  type CommentListItem,
  type CommentsState,
} from './comments';
import { commentCountEvents } from './comment-counts';
import { createComment, deleteOwnedComment, getComments } from './service';

const loadError = 'Penguin could not load comments. Check your connection and try again.';
const createError = 'Penguin could not publish your comment. Your writing is still here.';
const deleteError = 'Penguin could not delete that comment. Try again.';

export function useComments(postId: string, pageSize = 20) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new Error('Comment page size must be between 1 and 50.');
  }
  const { session, loading: authLoading, recovery } = useAuth();
  const { state: profileState } = useProfile();
  const userId = session?.user.id ?? null;
  const profile = profileState.status === 'ready' && profileState.profile.id === userId ? profileState.profile : null;
  const enabled = Boolean(userId && postId) && !authLoading && !recovery;
  const [state, setState] = useState<CommentsState>(initialCommentsState);
  const [submitting, setSubmitting] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const stateRef = useRef(state);
  const generation = useRef(0);
  const accountGeneration = useRef(0);
  const loadingMore = useRef(false);
  const controllers = useRef(new Set<AbortController>());
  const activeRequests = useRef(new Set<string>());
  const submittingRef = useRef(false);
  const deleting = useRef(new CommentDeletionLocks());

  const updateState = useCallback((updater: (current: CommentsState) => CommentsState) => {
    setState((current) => {
      const next = updater(current);
      stateRef.current = next;
      return next;
    });
  }, []);

  const load = useCallback(async (cursor: CommentCursor | undefined, append: boolean) => {
    if (!enabled || !userId || (append && (loadingMore.current || activeRequests.current.has('refresh')))) return;
    const key = cursor ? `page:${cursor.createdAt}:${cursor.id}` : 'refresh';
    if (activeRequests.current.has(key)) return;
    if (!append) {
      generation.current += 1;
      loadingMore.current = false;
      controllers.current.forEach((controller) => controller.abort());
      controllers.current.clear();
      activeRequests.current.clear();
    }
    activeRequests.current.add(key);
    const request = ++generation.current;
    const controller = new AbortController();
    controllers.current.add(controller);
    if (append) loadingMore.current = true;
    updateState((current) => beginCommentsLoad(current, userId, postId, append));
    try {
      const page = await getComments({ postId, cursor, limit: pageSize, signal: controller.signal });
      if (request !== generation.current) return;
      updateState((current) => {
        const sameScope = current.userId === userId && current.postId === postId;
        const items = append && sameScope
          ? mergeCommentPage(current.items, page.items)
          : reconcileComments(sameScope ? current.items : [], page.items);
        return {
          userId,
          postId,
          status: items.length ? 'ready' : 'empty',
          items,
          nextCursor: page.nextCursor,
          loadingMore: false,
          error: null,
          errorKind: null,
        };
      });
    } catch {
      if (request !== generation.current) return;
      updateState((current) => failCommentsLoad(current, userId, postId, append, loadError));
    } finally {
      controllers.current.delete(controller);
      activeRequests.current.delete(key);
      if (request === generation.current) loadingMore.current = false;
    }
  }, [enabled, pageSize, postId, updateState, userId]);

  useEffect(() => {
    const requestControllers = controllers.current;
    const requests = activeRequests.current;
    const deletions = deleting.current;
    let active = true;
    if (!enabled) {
      accountGeneration.current += 1;
      generation.current += 1;
      requestControllers.forEach((controller) => controller.abort());
      requestControllers.clear();
      requests.clear();
      deletions.clear();
      submittingRef.current = false;
      void Promise.resolve().then(() => {
        if (!active) return;
        updateState(() => initialCommentsState());
        setSubmitting(false);
        setMutationError(null);
      });
      return () => { active = false; };
    }
    void Promise.resolve().then(() => {
      if (active) return load(undefined, false);
    });
    return () => {
      active = false;
      accountGeneration.current += 1;
      generation.current += 1;
      requestControllers.forEach((controller) => controller.abort());
      requestControllers.clear();
      requests.clear();
      deletions.clear();
      submittingRef.current = false;
    };
  }, [enabled, load, updateState]);

  const submitComment = useCallback(async (commentId: string, content: string) => {
    if (!enabled || !userId || !profile || submittingRef.current) return false;
    const account = accountGeneration.current;
    const now = new Date().toISOString();
    const optimistic: CommentListItem = {
      id: commentId,
      post_id: postId,
      author_id: userId,
      content,
      created_at: now,
      updated_at: now,
      author: {
        id: profile.id,
        username: profile.username,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
      },
      optimistic: true,
    };
    submittingRef.current = true;
    setSubmitting(true);
    setMutationError(null);
    updateState((current) => current.userId !== userId || current.postId !== postId ? current : {
      ...current,
      status: 'ready',
      items: [optimistic, ...current.items.filter(({ id }) => id !== commentId)],
    });
    commentCountEvents.publish({ userId, postId, delta: 1 });
    try {
      const created = await createComment({ commentId, postId, content });
      if (account !== accountGeneration.current) return false;
      updateState((current) => current.userId !== userId || current.postId !== postId ? current : {
        ...current,
        items: current.items.map((item) => item.id === commentId
          ? { ...created, author: optimistic.author }
          : item),
      });
      return true;
    } catch {
      if (account !== accountGeneration.current) return false;
      updateState((current) => current.userId !== userId || current.postId !== postId ? current : {
        ...current,
        status: current.items.length === 1 ? 'empty' : current.status,
        items: current.items.filter(({ id }) => id !== commentId),
      });
      commentCountEvents.publish({ userId, postId, delta: -1 });
      setMutationError(createError);
      return false;
    } finally {
      if (account === accountGeneration.current) {
        submittingRef.current = false;
        setSubmitting(false);
      }
    }
  }, [enabled, postId, profile, updateState, userId]);

  const deleteComment = useCallback(async (commentId: string) => {
    if (!enabled || !userId) return;
    const current = stateRef.current;
    const item = current.userId === userId ? current.items.find(({ id }) => id === commentId) : null;
    if (!item || item.author_id !== userId || item.optimistic || item.deleting) return;
    const deletion = markCommentDeleting(current.items, commentId);
    if (!deletion) return;
    const account = accountGeneration.current;
    return performLockedCommentDeletion({
      locks: deleting.current,
      userId,
      commentId,
      request: () => deleteOwnedComment(commentId),
      isCurrent: () => account === accountGeneration.current,
      onBegin: () => {
        setMutationError(null);
        updateState((latest) => latest.userId !== userId || latest.postId !== postId ? latest : {
          ...latest,
          items: latest.items.map((latestItem) => latestItem.id === commentId
            ? { ...latestItem, deleting: true }
            : latestItem),
        });
        commentCountEvents.publish({ userId, postId, delta: -1 });
      },
      onSuccess: () => updateState((latest) => {
        if (latest.userId !== userId || latest.postId !== postId) return latest;
        const items = confirmCommentDeletion(latest.items, commentId);
        return { ...latest, status: items.length ? 'ready' : 'empty', items };
      }),
      onFailure: () => {
        updateState((latest) => latest.userId !== userId || latest.postId !== postId ? latest : {
          ...latest,
          status: 'ready',
          items: restoreDeletingComment(latest.items, deletion.item, deletion.index),
        });
        commentCountEvents.publish({ userId, postId, delta: 1 });
        setMutationError(deleteError);
      },
    });
  }, [enabled, postId, updateState, userId]);

  const refresh = useCallback(() => load(undefined, false), [load]);
  const loadMore = useCallback(() => {
    if (state.userId !== userId || state.postId !== postId || !state.nextCursor || state.loadingMore) return Promise.resolve();
    return load(state.nextCursor, true);
  }, [load, postId, state.loadingMore, state.nextCursor, state.postId, state.userId, userId]);
  const clearMutationError = useCallback(() => setMutationError(null), []);
  const visible = enabled && state.userId === userId && state.postId === postId ? state : initialCommentsState();
  return {
    ...visible,
    submitting,
    mutationError,
    refresh,
    loadMore,
    submitComment,
    deleteComment,
    clearMutationError,
  };
}
