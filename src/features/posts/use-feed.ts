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

const feedError = 'Penguin could not load posts. Check your connection and try again.';

export function usePostsFeed(pageSize = 20) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new Error('Feed page size must be between 1 and 50.');
  }
  const { session, loading: authLoading, recovery } = useAuth();
  const userId = session?.user.id ?? null;
  const enabled = Boolean(userId) && !authLoading && !recovery;
  const [state, setState] = useState<FeedState>(initialFeedState);
  const generation = useRef(0);
  const loadingMore = useRef(false);
  const controllers = useRef(new Set<AbortController>());
  const requests = useRef(new FeedRequestRegistry());

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
    setState((current) => beginFeedLoad(current, userId, append));
    try {
      const page = await getFeed({ cursor, limit: pageSize, signal: controller.signal });
      if (request !== generation.current) return;
      setState((current) => {
        const items = append && current.userId === userId
          ? mergeFeedPosts(current.items, page.items)
          : reconcileFeedPosts(current.userId === userId ? current.items : [], page.items);
        return {
          userId,
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
      setState((current) => failFeedLoad(current, userId, append, feedError));
    } finally {
      controllers.current.delete(controller);
      requests.current.finish(requestKey);
      if (request === generation.current) loadingMore.current = false;
    }
  }, [enabled, pageSize, userId]);

  useEffect(() => {
    const requestControllers = controllers.current;
    const requestRegistry = requests.current;
    let active = true;
    if (!enabled) {
      generation.current += 1;
      loadingMore.current = false;
      requestControllers.forEach((controller) => controller.abort());
      requestControllers.clear();
      requestRegistry.clear();
      void Promise.resolve().then(() => {
        if (active) setState(initialFeedState());
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
      generation.current += 1;
      loadingMore.current = false;
      requestControllers.forEach((controller) => controller.abort());
      requestControllers.clear();
      requestRegistry.clear();
    };
  }, [enabled, load]);

  const refresh = useCallback(() => load(undefined, false), [load]);
  const loadMore = useCallback(() => {
    if (state.userId !== userId || !state.nextCursor || state.loadingMore) return Promise.resolve();
    return load(state.nextCursor, true);
  }, [load, state.loadingMore, state.nextCursor, state.userId, userId]);

  const visible = enabled && state.userId === userId ? state : initialFeedState();
  return { ...visible, refresh, loadMore };
}
