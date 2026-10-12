import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/provider';
import { useAppActive } from '@/lib/use-app-active';
import { isConversationUnread, mergeConversations, type ChatCursor, type ConversationSummary, type ReadCursors } from './chat';
import { applyConversationChange, laterStamp, subscribeToInbox } from './realtime';
import { liveClient, RECONCILE_INTERVAL_MS } from './realtime-service';
import { listConversations, listReadCursors } from './service';

type ConversationList = {
  userId: string;
  failed: boolean;
  refreshFailed: boolean;
  items: ConversationSummary[];
  // Read cursors for the conversations they could be loaded for.
  reads: ReadCursors;
  nextCursor: ChatCursor | null;
  loadingMore: boolean;
  loadMoreFailed: boolean;
};

const none: ConversationSummary[] = [];
const noReads: ReadCursors = {};

// Unread dots are an extra: if the cursors cannot be read the list still loads,
// just without dots for those conversations.
function readsFor(items: ConversationSummary[]) {
  return listReadCursors(items.map(({ id }) => id)).catch(() => noReads);
}

// The signed-in student's conversations. Everything held is tagged with the
// account it was loaded for and is ignored for any other account. The screen calls
// refresh when it gains focus.
//
// With `live` (the inbox), one Realtime channel keeps previews, order and unread
// dots current while the app is in the foreground. The channel is closed in the
// background, on logout and on account change. Every time it joins, including
// after a lost connection, the list is reloaded from the database, which is what
// recovers anything missed while it was down.
export function useConversations({ live = false }: { live?: boolean } = {}) {
  const { session, loading: authLoading, recovery } = useAuth();
  const userId = session?.user.id ?? null;
  const enabled = Boolean(userId) && !authLoading && !recovery;
  const [list, setList] = useState<ConversationList | null>(null);
  const generation = useRef(0);
  const loadingMore = useRef(false);
  const appActive = useAppActive();
  const lastRefresh = useRef(0);
  const knownIds = useRef<ReadonlySet<string>>(new Set());

  // A response that arrives after the account changed is dropped.
  useEffect(() => () => { generation.current += 1; loadingMore.current = false; }, [userId]);

  const refresh = useCallback(async () => {
    if (!enabled || !userId) return;
    const request = ++generation.current;
    loadingMore.current = false;
    lastRefresh.current = Date.now();
    try {
      const page = await listConversations();
      const reads = await readsFor(page.items);
      if (request !== generation.current) return;
      setList({
        userId, failed: false, refreshFailed: false, items: page.items, reads, nextCursor: page.nextCursor,
        loadingMore: false, loadMoreFailed: false,
      });
    } catch {
      if (request !== generation.current) return;
      setList((current) => current?.userId === userId && !current.failed
        ? { ...current, refreshFailed: true }
        : { userId, failed: true, refreshFailed: false, items: [], reads: noReads, nextCursor: null, loadingMore: false, loadMoreFailed: false });
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
      const reads = await readsFor(page.items);
      if (request !== generation.current) return;
      setList((current) => current?.userId === userId ? {
        ...current, items: mergeConversations(current.items, page.items), reads: { ...reads, ...current.reads },
        nextCursor: page.nextCursor,
        loadingMore: false, loadMoreFailed: false,
      } : current);
    } catch {
      if (request !== generation.current) return;
      setList((current) => current?.userId === userId ? { ...current, loadingMore: false, loadMoreFailed: true } : current);
    } finally {
      if (request === generation.current) loadingMore.current = false;
    }
  }, [nextCursor, userId]);

  const items = held?.items ?? none;
  const reads = held?.reads ?? noReads;

  useEffect(() => { knownIds.current = new Set(items.map(({ id }) => id)); }, [items]);

  useEffect(() => {
    const client = liveClient();
    if (!live || !enabled || !userId || !appActive || !client) return;
    const subscription = subscribeToInbox(client, userId, {
      onConversation: (change) => {
        // A conversation not in the list yet has no profile in the event: reload.
        if (!knownIds.current.has(change.id)) { if (change.last_message_at) void refresh(); return; }
        setList((current) => current?.userId === userId && !current.failed
          ? { ...current, items: applyConversationChange(current.items, change).items }
          : current);
      },
      onRead: (change) => {
        setList((current) => current?.userId === userId && !current.failed ? {
          ...current,
          reads: { ...current.reads, [change.conversationId]: laterStamp(current.reads[change.conversationId] ?? null, change.lastReadAt) },
        } : current);
      },
      onState: (state) => {
        if (state === 'joined' && Date.now() - lastRefresh.current >= RECONCILE_INTERVAL_MS) void refresh();
      },
    });
    return () => subscription.close();
  }, [appActive, enabled, live, refresh, userId]);
  const unreadIds = useMemo<ReadonlySet<string>>(
    () => new Set(userId ? items.filter((item) => isConversationUnread(item, userId, reads[item.id])).map(({ id }) => id) : []),
    [items, reads, userId],
  );

  return {
    status: !held ? 'loading' as const : held.failed ? 'error' as const : held.items.length ? 'ready' as const : 'empty' as const,
    items,
    unreadIds,
    hasMore: Boolean(nextCursor),
    loadingMore: held?.loadingMore ?? false,
    loadMoreFailed: held?.loadMoreFailed ?? false,
    refreshFailed: held?.refreshFailed ?? false,
    refresh,
    loadMore,
  };
}
