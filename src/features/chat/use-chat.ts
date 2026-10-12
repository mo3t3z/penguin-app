import { useCallback, useEffect, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/features/auth/provider';
import { useAppActive } from '@/lib/use-app-active';
import {
  addPendingMessage,
  appendOlderMessages,
  chatErrorKind,
  chatErrorMessages,
  composerState,
  confirmMessage,
  markMessageFailed,
  markMessagePending,
  normalizeMessageContent,
  otherParticipant,
  pendingMessage,
  type ChatCursor,
  type ChatMessage,
  type ConversationSummary,
} from './chat';
import { advanceReceipt, mergeNewestMessages, newestOwnReceipt, receiveMessage, subscribeToConversation } from './realtime';
import { liveClient, RECONCILE_INTERVAL_MS } from './realtime-service';
import {
  blockUser,
  getConversation,
  getMessages,
  getReadReceipt,
  hasBlocked,
  markConversationRead,
  sendMessage,
  unblockUser,
} from './service';

type Thread = {
  key: string;
  status: 'ready' | 'missing' | 'error';
  conversation: ConversationSummary | null;
  items: ChatMessage[];
  nextCursor: ChatCursor | null;
  loadingOlder: boolean;
  olderFailed: boolean;
  blockedByMe: boolean;
  // The server refused a send for this pair. No reason is known or shown.
  refused: boolean;
  blockBusy: boolean;
  notice: string | null;
  // The newest of the student's own messages that the server reports as read.
  readMessageId: string | null;
};

const none: ChatMessage[] = [];
const blockError = 'Penguin couldn’t update that. Check your connection and try again.';

// One conversation for the signed-in student: its newest messages, older pages,
// sending with retry, and the student's own block. Everything held carries a key
// of account, conversation and attempt; a response for any other key is dropped.
//
// Live delivery (Sprint 6B): while the conversation is loaded and the app is in
// the foreground, one Realtime channel adds new messages. The receipt comes from
// the server on load, on every join and when the other student signals a read.
// The channel is closed in the background, when the screen unmounts,
// on logout and on account change. Each time it joins, including after a lost
// connection, the newest page is read again from the database, so anything missed
// while it was down appears. The read cursor only moves while the screen is
// actually in view.
// `onMarkedRead` is called after the read cursor moved because of something new,
// so the screen can let the other student's device know.
export function useChat(conversationId: string | null, onMarkedRead: () => void) {
  const { session, loading: authLoading, recovery } = useAuth();
  const userId = session?.user.id ?? null;
  const enabled = Boolean(userId) && !authLoading && !recovery;
  const [attempt, setAttempt] = useState(0);
  const key = `${userId}:${conversationId}:${attempt}`;
  const [thread, setThread] = useState<Thread | null>(null);
  const sending = useRef(new Set<string>());
  const loadingOlder = useRef(false);
  const appActive = useAppActive();
  const focused = useRef(false);
  const viewing = useRef(false);
  // A message arrived while the screen was not in view: mark read on return.
  const unseen = useRef(false);
  const lastReconcile = useRef(0);

  const update = useCallback((change: (current: Thread) => Thread) => {
    setThread((current) => current?.key === key ? change(current) : current);
  }, [key]);

  // Moves the student's read cursor, but only while they are looking at the
  // conversation. A failure changes nothing here; the next view tries again.
  const markRead = useCallback((announce: boolean) => {
    if (!conversationId) return;
    if (!viewing.current) { unseen.current = true; return; }
    unseen.current = false;
    markConversationRead(conversationId).then(() => { if (announce) onMarkedRead(); }).catch(() => {});
  }, [conversationId, onMarkedRead]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    viewing.current = appActive;
    if (viewing.current && unseen.current) markRead(true);
    return () => { focused.current = false; viewing.current = false; };
  }, [appActive, markRead]));

  useEffect(() => {
    if (!enabled || !userId || !conversationId) return;
    const controller = new AbortController();
    let current = true;
    const inFlight = sending.current;
    Promise.all([
      getConversation(conversationId, { signal: controller.signal }),
      getMessages({ conversationId, signal: controller.signal }),
      // Receipts are an extra: the conversation loads without them.
      getReadReceipt(conversationId, { signal: controller.signal }).catch(() => null),
    ]).then(async ([conversation, page, readMessageId]) => {
      if (!current) return;
      const base = {
        key, items: page.items as ChatMessage[], nextCursor: page.nextCursor, loadingOlder: false, olderFailed: false,
        blockedByMe: false, refused: false, blockBusy: false, notice: null, readMessageId: null,
      };
      if (!conversation) {
        setThread({ ...base, status: 'missing', conversation: null, items: [], nextCursor: null });
        return;
      }
      const other = otherParticipant(conversation, userId);
      setThread({ ...base, status: 'ready', conversation, readMessageId: advanceReceipt(page.items, null, readMessageId) });
      // Announced only when there was something of theirs to read.
      markRead(page.items.length > 0 && page.items[0].sender_id !== userId);
      if (!other.id) return;
      const blocked = await hasBlocked(other.id, { signal: controller.signal }).catch(() => false);
      if (current) setThread((latest) => latest?.key === key ? { ...latest, blockedByMe: blocked } : latest);
    }).catch(() => {
      if (!current) return;
      setThread({
        key, status: 'error', conversation: null, items: [], nextCursor: null, loadingOlder: false, olderFailed: false,
        blockedByMe: false, refused: false, blockBusy: false, notice: null, readMessageId: null,
      });
    });
    return () => {
      current = false;
      controller.abort();
      inFlight.clear();
      loadingOlder.current = false;
    };
  }, [conversationId, enabled, key, markRead, userId]);

  const held = enabled && thread?.key === key ? thread : null;
  const conversation = held?.conversation ?? null;
  const other = conversation && userId ? otherParticipant(conversation, userId) : null;
  const nextCursor = held?.nextCursor ?? null;

  const ready = held?.status === 'ready';

  useEffect(() => {
    const client = liveClient();
    if (!ready || !enabled || !userId || !conversationId || !appActive || !client) return;
    let current = true;
    // Reads the newest page and the read cursors again and joins them with what is held.
    const reconcile = async () => {
      const now = Date.now();
      if (now - lastReconcile.current < RECONCILE_INTERVAL_MS) return;
      lastReconcile.current = now;
      try {
        const [page, readMessageId] = await Promise.all([
          getMessages({ conversationId }),
          getReadReceipt(conversationId).catch(() => null),
        ]);
        if (!current) return;
        update((latest) => {
          const merged = mergeNewestMessages(latest.items, page.items);
          return {
            ...latest, items: merged.items, nextCursor: merged.gap ? page.nextCursor : latest.nextCursor,
            readMessageId: advanceReceipt(merged.items, latest.readMessageId, readMessageId),
          };
        });
        if (page.items.some((message) => message.sender_id !== userId)) markRead(true);
      } catch {
        // Still connected or not, the next join or the next visit tries again.
      }
    };
    const subscription = subscribeToConversation(client, conversationId, {
      onMessage: (message) => {
        update((latest) => ({ ...latest, items: receiveMessage(latest.items, message) }));
        if (message.sender_id !== userId) markRead(true);
      },
      onState: (state) => { if (state === 'joined') void reconcile(); },
    });
    return () => { current = false; subscription.close(); };
  }, [appActive, conversationId, enabled, markRead, ready, update, userId]);

  // Asks the server again which of the student's messages has been read. Called
  // when the other student's device signals a read; the signal itself is not trusted.
  const refreshReceipt = useCallback(() => {
    if (!conversationId) return;
    getReadReceipt(conversationId)
      .then((readMessageId) => update((latest) => (
        { ...latest, readMessageId: advanceReceipt(latest.items, latest.readMessageId, readMessageId) }
      )))
      .catch(() => {});
  }, [conversationId, update]);

  const deliver = useCallback(async (messageId: string, content: string) => {
    if (!conversationId || sending.current.has(messageId)) return;
    sending.current.add(messageId);
    try {
      const stored = await sendMessage({ messageId, conversationId, content });
      update((current) => ({ ...current, items: confirmMessage(current.items, stored), refused: false, notice: null }));
    } catch (cause) {
      const kind = chatErrorKind(cause);
      update((current) => ({
        ...current,
        items: markMessageFailed(current.items, messageId),
        refused: current.refused || kind === 'unavailable',
        notice: chatErrorMessages[kind],
      }));
    } finally {
      sending.current.delete(messageId);
    }
  }, [conversationId, update]);

  // Shows the message at once, then asks the server to store it.
  const send = useCallback((draft: string) => {
    if (!userId || !conversationId || !held || held.status !== 'ready') return false;
    let content: string;
    try { content = normalizeMessageContent(draft); } catch { return false; }
    const message = pendingMessage({
      id: Crypto.randomUUID(), conversationId, senderId: userId, content, now: new Date().toISOString(),
    });
    update((current) => ({ ...current, items: addPendingMessage(current.items, message), notice: null }));
    void deliver(message.id, content);
    return true;
  }, [conversationId, deliver, held, update, userId]);

  // Retry sends the same identifier and text again.
  const retry = useCallback((messageId: string) => {
    const failed = held?.items.find((item) => item.id === messageId && item.delivery === 'failed');
    if (!failed) return;
    update((current) => ({ ...current, items: markMessagePending(current.items, messageId), notice: null }));
    void deliver(failed.id, failed.content);
  }, [deliver, held, update]);

  const loadOlder = useCallback(async () => {
    if (!conversationId || !nextCursor || loadingOlder.current) return;
    loadingOlder.current = true;
    update((current) => ({ ...current, loadingOlder: true, olderFailed: false }));
    try {
      const page = await getMessages({ conversationId, cursor: nextCursor });
      update((current) => ({
        ...current, items: appendOlderMessages(current.items, page.items), nextCursor: page.nextCursor,
        loadingOlder: false, olderFailed: false,
      }));
    } catch {
      update((current) => ({ ...current, loadingOlder: false, olderFailed: true }));
    } finally {
      loadingOlder.current = false;
    }
  }, [conversationId, nextCursor, update]);

  const otherId = other?.id ?? null;
  const blockBusy = held?.blockBusy ?? false;
  // Plain functions: the React Compiler memoises them.
  const setBlocked = async (blocked: boolean) => {
    if (!otherId || blockBusy) return;
    update((current) => ({ ...current, blockBusy: true, notice: null }));
    try {
      await (blocked ? blockUser(otherId) : unblockUser(otherId));
      // Unblocking only reopens the composer; nothing is sent.
      update((current) => ({ ...current, blockBusy: false, blockedByMe: blocked, refused: false }));
    } catch {
      update((current) => ({ ...current, blockBusy: false, notice: blockError }));
    }
  };
  const block = () => setBlocked(true);
  const unblock = () => setBlocked(false);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  return {
    status: !conversationId ? 'missing' as const : !held ? 'loading' as const : held.status,
    userId,
    other,
    items: held?.items ?? none,
    hasOlder: Boolean(nextCursor),
    loadingOlder: held?.loadingOlder ?? false,
    olderFailed: held?.olderFailed ?? false,
    composer: composerState({
      deleted: other?.deleted ?? false, blockedByMe: held?.blockedByMe ?? false, refused: held?.refused ?? false,
    }),
    blockBusy,
    notice: held?.notice ?? null,
    // 'sent' or 'read' for your newest stored message; never a guess.
    receipt: userId && held ? newestOwnReceipt(held.items, userId, held.readMessageId) : null,
    refreshReceipt,
    send,
    retry,
    loadOlder,
    block,
    unblock,
    reload,
  };
}
