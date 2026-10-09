import { useCallback, useEffect, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { useAuth } from '@/features/auth/provider';
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
import {
  blockUser,
  getConversation,
  getMessages,
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
};

const none: ChatMessage[] = [];
const blockError = 'Penguin couldn’t update that. Check your connection and try again.';

// One conversation for the signed-in student: its newest messages, older pages,
// sending with retry, and the student's own block. Everything held carries a key
// of account, conversation and attempt; a response for any other key is dropped.
export function useChat(conversationId: string | null) {
  const { session, loading: authLoading, recovery } = useAuth();
  const userId = session?.user.id ?? null;
  const enabled = Boolean(userId) && !authLoading && !recovery;
  const [attempt, setAttempt] = useState(0);
  const key = `${userId}:${conversationId}:${attempt}`;
  const [thread, setThread] = useState<Thread | null>(null);
  const sending = useRef(new Set<string>());
  const loadingOlder = useRef(false);

  const update = useCallback((change: (current: Thread) => Thread) => {
    setThread((current) => current?.key === key ? change(current) : current);
  }, [key]);

  useEffect(() => {
    if (!enabled || !userId || !conversationId) return;
    const controller = new AbortController();
    let current = true;
    const inFlight = sending.current;
    Promise.all([
      getConversation(conversationId, { signal: controller.signal }),
      getMessages({ conversationId, signal: controller.signal }),
    ]).then(async ([conversation, page]) => {
      if (!current) return;
      const base = {
        key, items: page.items as ChatMessage[], nextCursor: page.nextCursor, loadingOlder: false, olderFailed: false,
        blockedByMe: false, refused: false, blockBusy: false, notice: null,
      };
      if (!conversation) {
        setThread({ ...base, status: 'missing', conversation: null, items: [], nextCursor: null });
        return;
      }
      setThread({ ...base, status: 'ready', conversation });
      // The read cursor is only prepared for Sprint 6B; a failure changes nothing here.
      markConversationRead(conversationId).catch(() => {});
      const other = otherParticipant(conversation, userId);
      if (!other.id) return;
      const blocked = await hasBlocked(other.id, { signal: controller.signal }).catch(() => false);
      if (current) setThread((latest) => latest?.key === key ? { ...latest, blockedByMe: blocked } : latest);
    }).catch(() => {
      if (!current) return;
      setThread({
        key, status: 'error', conversation: null, items: [], nextCursor: null, loadingOlder: false, olderFailed: false,
        blockedByMe: false, refused: false, blockBusy: false, notice: null,
      });
    });
    return () => {
      current = false;
      controller.abort();
      inFlight.clear();
      loadingOlder.current = false;
    };
  }, [conversationId, enabled, key, userId]);

  const held = enabled && thread?.key === key ? thread : null;
  const conversation = held?.conversation ?? null;
  const other = conversation && userId ? otherParticipant(conversation, userId) : null;
  const nextCursor = held?.nextCursor ?? null;

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
    send,
    retry,
    loadOlder,
    block,
    unblock,
    reload,
  };
}
