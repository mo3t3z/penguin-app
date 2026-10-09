import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/provider';
import { mergeConversations, type ChatCursor, type ConversationSummary } from './chat';
import { listConversations } from './service';

type ConversationList = {
  userId: string;
  failed: boolean;
  refreshFailed: boolean;
  items: ConversationSummary[];
  nextCursor: ChatCursor | null;
  loadingMore: boolean;
  loadMoreFailed: boolean;
};

const none: ConversationSummary[] = [];

// The signed-in student's conversations. Everything held is tagged with the
// account it was loaded for and is ignored for any other account. The screen calls
// refresh when it gains focus; there is no live update in Sprint 6A.
export function useConversations() {
  const { session, loading: authLoading, recovery } = useAuth();
  const userId = session?.user.id ?? null;
  const enabled = Boolean(userId) && !authLoading && !recovery;
  const [list, setList] = useState<ConversationList | null>(null);
  const generation = useRef(0);
  const loadingMore = useRef(false);

  // A response that arrives after the account changed is dropped.
  useEffect(() => () => { generation.current += 1; loadingMore.current = false; }, [userId]);

  const refresh = useCallback(async () => {
    if (!enabled || !userId) return;
    const request = ++generation.current;
    loadingMore.current = false;
    try {
      const page = await listConversations();
      if (request !== generation.current) return;
      setList({
        userId, failed: false, refreshFailed: false, items: page.items, nextCursor: page.nextCursor,
        loadingMore: false, loadMoreFailed: false,
      });
    } catch {
      if (request !== generation.current) return;
      setList((current) => current?.userId === userId && !current.failed
        ? { ...current, refreshFailed: true }
        : { userId, failed: true, refreshFailed: false, items: [], nextCursor: null, loadingMore: false, loadMoreFailed: false });
    }
  }, [enabled, userId]);

  const held = enabled && list?.userId === userId ? list : null;
  const nextCursor = held && !held.failed ? held.nextCursor : null;

  const loadMore = useCallback(async () => {
    if (!userId || !nextCursor || loadingMore.current) return;
    const request = generation.current;
    loadingMore.current = true;
    setList((current) => current?.userId === userId ? { ...current, loadingMore: true, loadMoreFailed: false } : current);
    try {
      const page = await listConversations({ cursor: nextCursor });
      if (request !== generation.current) return;
      setList((current) => current?.userId === userId ? {
        ...current, items: mergeConversations(current.items, page.items), nextCursor: page.nextCursor,
        loadingMore: false, loadMoreFailed: false,
      } : current);
    } catch {
      if (request !== generation.current) return;
      setList((current) => current?.userId === userId ? { ...current, loadingMore: false, loadMoreFailed: true } : current);
    } finally {
      if (request === generation.current) loadingMore.current = false;
    }
  }, [nextCursor, userId]);

  return {
    status: !held ? 'loading' as const : held.failed ? 'error' as const : held.items.length ? 'ready' as const : 'empty' as const,
    items: held?.items ?? none,
    hasMore: Boolean(nextCursor),
    loadingMore: held?.loadingMore ?? false,
    loadMoreFailed: held?.loadMoreFailed ?? false,
    refreshFailed: held?.refreshFailed ?? false,
    refresh,
    loadMore,
  };
}
