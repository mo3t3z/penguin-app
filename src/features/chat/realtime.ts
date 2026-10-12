import type { Message } from '../../lib/database.types';
import { isChatUuid, requireChatUuid, type ChatMessage, type ConversationSummary } from './chat.ts';

// Sprint 6B live chat: everything here is plain logic with no Supabase import, so
// it runs under the Node test runner. Row-level security decides what the server
// sends; the checks below are a second line that drops anything malformed or
// addressed to another conversation.

// --- Rows received from the server ---------------------------------------------------

function stamp(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

// A message row for this conversation, or null.
export function parseMessageRow(value: unknown, conversationId: string): Message | null {
  const row = record(value);
  if (!row || !isChatUuid(row.id) || row.conversation_id !== conversationId) return null;
  if (row.sender_id !== null && !isChatUuid(row.sender_id)) return null;
  const createdAt = stamp(row.created_at);
  if (typeof row.content !== 'string' || !row.content || !createdAt) return null;
  return {
    id: row.id, conversation_id: conversationId, sender_id: row.sender_id as string | null,
    content: row.content, created_at: createdAt,
  };
}

export type ConversationChange = Pick<ConversationSummary,
  'id' | 'user_low' | 'user_high' | 'last_message_at' | 'last_message_sender_id' | 'last_message_preview'>;

// A conversation row the signed-in student takes part in, or null.
export function parseConversationRow(value: unknown, userId: string): ConversationChange | null {
  const row = record(value);
  if (!row || !isChatUuid(row.id)) return null;
  const side = (id: unknown) => id === null || isChatUuid(id);
  if (!side(row.user_low) || !side(row.user_high) || (row.user_low !== userId && row.user_high !== userId)) return null;
  if (row.last_message_sender_id !== null && !isChatUuid(row.last_message_sender_id)) return null;
  const lastMessageAt = row.last_message_at === null ? null : stamp(row.last_message_at);
  if (row.last_message_at !== null && !lastMessageAt) return null;
  return {
    id: row.id,
    user_low: row.user_low as string | null,
    user_high: row.user_high as string | null,
    last_message_at: lastMessageAt,
    last_message_sender_id: row.last_message_sender_id as string | null,
    last_message_preview: typeof row.last_message_preview === 'string' ? row.last_message_preview : null,
  };
}

export type ReadChange = { conversationId: string; userId: string; lastReadAt: string };

export function parseReadRow(value: unknown): ReadChange | null {
  const row = record(value);
  const lastReadAt = stamp(row?.last_read_at);
  if (!row || !isChatUuid(row.conversation_id) || !isChatUuid(row.user_id) || !lastReadAt) return null;
  return { conversationId: row.conversation_id, userId: row.user_id, lastReadAt };
}

// --- Messages ------------------------------------------------------------------------

function newestFirst(left: ChatMessage, right: ChatMessage) {
  if (left.created_at !== right.created_at) return left.created_at < right.created_at ? 1 : -1;
  return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
}

// Adds a stored message. It replaces a pending or failed copy with the same
// identifier (your own message echoed back) and an earlier delivery of itself, so
// the same event twice, or events out of order, leave the list unchanged.
export function receiveMessage(items: ChatMessage[], stored: Message): ChatMessage[] {
  const existing = items.find(({ id }) => id === stored.id);
  if (existing && !existing.delivery && existing.created_at === stored.created_at && existing.content === stored.content) return items;
  return [...items.filter(({ id }) => id !== stored.id), { ...stored }].sort(newestFirst);
}

// After a reconnect: the newest page from the database joined with what is held.
// `gap` is true when none of the held stored messages is on that page, which
// means more than a page was missed; the caller then keeps only the new page (and
// anything unsent) so no hole is left in the history.
export function mergeNewestMessages(current: ChatMessage[], newest: Message[]) {
  const fresh = new Map(newest.map((message) => [message.id, message]));
  const stored = current.filter((item) => !item.delivery);
  const gap = stored.length > 0 && newest.length > 0 && !stored.some((item) => fresh.has(item.id));
  const kept = current.filter((item) => !fresh.has(item.id) && (item.delivery || !gap));
  return { items: [...kept, ...newest.map((message) => ({ ...message }))].sort(newestFirst), gap };
}

// --- Inbox ---------------------------------------------------------------------------

export function laterStamp(left: string | null, right: string | null) {
  if (!left) return right;
  if (!right) return left;
  return Date.parse(right) > Date.parse(left) ? right : left;
}

function mostRecentFirst(left: ConversationSummary, right: ConversationSummary) {
  const a = left.last_message_at ? Date.parse(left.last_message_at) : 0;
  const b = right.last_message_at ? Date.parse(right.last_message_at) : 0;
  if (a !== b) return b - a;
  return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
}

// Applies a changed conversation row to the inbox. An older event never overwrites
// a newer preview. `known` is false when the conversation is not in the list yet
// (a first message from someone new): the caller then reloads, because the event
// carries no profile to show.
export function applyConversationChange(items: ConversationSummary[], change: ConversationChange) {
  const index = items.findIndex(({ id }) => id === change.id);
  if (index < 0) return { items, known: false };
  const held = items[index];
  if (held.last_message_at && change.last_message_at
    && Date.parse(change.last_message_at) < Date.parse(held.last_message_at)) return { items, known: true };
  const next = [...items];
  next[index] = {
    ...held,
    user_low: change.user_low,
    user_high: change.user_high,
    last_message_at: change.last_message_at,
    last_message_sender_id: change.last_message_sender_id,
    last_message_preview: change.last_message_preview,
  };
  return { items: next.sort(mostRecentFirst), known: true };
}

// --- Receipts ------------------------------------------------------------------------

// What can be said truthfully about one of your own messages:
//  - 'sent': the server stored it.
//  - 'read': the server reports that the other student has read up to it.
// There is no "delivered": nothing tells the server a device received a message.
export type MessageReceipt = 'sent' | 'read';

// The receipt is shown on your newest stored message only. `readMessageId` is the
// server's answer to "which is the newest message of mine they have read?"; the
// device never learns when.
export function newestOwnReceipt(items: readonly ChatMessage[], userId: string, readMessageId: string | null) {
  const newest = items.find((item) => !item.delivery && item.sender_id === userId);
  if (!newest) return null;
  return { messageId: newest.id, receipt: (newest.id === readMessageId ? 'read' : 'sent') as MessageReceipt };
}

// Keeps the receipt moving forward only. A later answer that points at an older
// message, at one not held, or at nothing (a failed request) never takes "Read"
// away from a message that already showed it.
export function advanceReceipt(items: readonly ChatMessage[], current: string | null, next: string | null) {
  if (!next || next === current) return current;
  const position = (id: string) => items.findIndex((item) => item.id === id);
  const found = position(next);
  if (found < 0) return current;
  if (!current) return next;
  const held = position(current);
  return held < 0 || found < held ? next : current;
}

// --- Typing --------------------------------------------------------------------------

// "Typing" is sent at most this often while the student keeps typing, is withdrawn
// after this long without a keystroke, and a received one is forgotten after the
// expiry even if "stopped" never arrives (the sender lost connection).
export const TYPING_SEND_INTERVAL_MS = 3_000;
export const TYPING_IDLE_MS = 4_000;
export const TYPING_EXPIRY_MS = 6_000;

// The private channel for one conversation. The server only lets its two
// participants join it.
export function chatTopic(conversationId: string) {
  return `chat:${requireChatUuid(conversationId)}`;
}

export function shouldSendTyping(lastSentAt: number | null, now: number) {
  return lastSentAt === null || now - lastSentAt >= TYPING_SEND_INTERVAL_MS;
}

export function isTypingVisible(receivedAt: number | null, now: number) {
  return receivedAt !== null && now - receivedAt < TYPING_EXPIRY_MS;
}

// Accepts a typing signal only from the other participant of this conversation.
export function parseTypingSignal(value: unknown, otherId: string | null): boolean | null {
  const payload = record(value);
  if (!payload || !otherId || payload.user_id !== otherId || typeof payload.typing !== 'boolean') return null;
  return payload.typing;
}

// "I just read this conversation", from the other participant. It carries no
// state and is not trusted: it only prompts a fresh question to the server.
export function isReadSignal(value: unknown, otherId: string | null) {
  const payload = record(value);
  return Boolean(payload && otherId && payload.user_id === otherId);
}

// --- Subscriptions -------------------------------------------------------------------

// The part of the Supabase client these subscriptions use, so tests can pass a fake.
export type LiveChannel = {
  on(type: string, filter: Record<string, unknown>, callback: (payload: { new?: unknown; payload?: unknown }) => void): LiveChannel;
  subscribe(callback?: (status: string) => void): LiveChannel;
  send(message: { type: string; event: string; payload: Record<string, unknown> }): unknown;
};
export type LiveClient = {
  channel(name: string, options?: Record<string, unknown>): LiveChannel;
  removeChannel(channel: LiveChannel): unknown;
};
export type LiveState = 'joined' | 'down';
export type Subscription = { close(): void };

let sequence = 0;
// Channel names are never reused, so two screens can never share (or double
// subscribe) one channel.
function uniqueName(prefix: string) {
  sequence += 1;
  return `${prefix}:${sequence}`;
}

// Opens one channel, forwards its state, and guarantees that nothing is delivered
// after close(). close() is safe to call twice.
function open(client: LiveClient, channel: LiveChannel, onState: (state: LiveState) => void, alive: { current: boolean }): Subscription {
  channel.subscribe((status) => {
    if (alive.current) onState(status === 'SUBSCRIBED' ? 'joined' : 'down');
  });
  return {
    close() {
      if (!alive.current) return;
      alive.current = false;
      void client.removeChannel(channel);
    },
  };
}

const changes = (table: string, filter?: string) => ({ event: '*', schema: 'public', table, ...(filter ? { filter } : {}) });

// New messages for one conversation. The filter narrows what is asked for;
// row-level security decides what is actually sent.
export function subscribeToConversation(client: LiveClient, conversationId: string, handlers: {
  onMessage: (message: Message) => void;
  onState: (state: LiveState) => void;
}): Subscription {
  const id = requireChatUuid(conversationId);
  const alive = { current: true };
  const channel = client.channel(uniqueName(`conversation:${id}`))
    .on('postgres_changes', { ...changes('messages', `conversation_id=eq.${id}`), event: 'INSERT' }, (payload) => {
      const message = parseMessageRow(payload.new, id);
      if (alive.current && message) handlers.onMessage(message);
    });
  return open(client, channel, handlers.onState, alive);
}

// Every conversation of the signed-in student (previews and order) and the
// student's own read cursors (unread dots).
export function subscribeToInbox(client: LiveClient, userId: string, handlers: {
  onConversation: (change: ConversationChange) => void;
  onRead: (change: ReadChange) => void;
  onState: (state: LiveState) => void;
}): Subscription {
  const id = requireChatUuid(userId);
  const alive = { current: true };
  const channel = client.channel(uniqueName(`inbox:${id}`))
    .on('postgres_changes', changes('conversations'), (payload) => {
      const change = parseConversationRow(payload.new, id);
      if (alive.current && change) handlers.onConversation(change);
    })
    .on('postgres_changes', changes('conversation_reads', `user_id=eq.${id}`), (payload) => {
      const change = parseReadRow(payload.new);
      if (alive.current && change && change.userId === id) handlers.onRead(change);
    });
  return open(client, channel, handlers.onState, alive);
}

// Typing and "just read" signals for one conversation on a private broadcast
// channel. Nothing is stored. If the server has no policy that admits this student
// to the channel the join is refused, the state stays 'down', and nothing is sent
// or received.
export function openTypingChannel(client: LiveClient, conversationId: string, userId: string, otherId: string, handlers: {
  onTyping: (typing: boolean) => void;
  onPeerRead: () => void;
  onState: (state: LiveState) => void;
}) {
  const alive = { current: true };
  let joined = false;
  const channel = client.channel(chatTopic(conversationId), { config: { private: true, broadcast: { self: false, ack: false } } })
    .on('broadcast', { event: 'typing' }, (message) => {
      const typing = parseTypingSignal(message.payload, otherId);
      if (alive.current && typing !== null) handlers.onTyping(typing);
    })
    .on('broadcast', { event: 'read' }, (message) => {
      if (alive.current && isReadSignal(message.payload, otherId)) handlers.onPeerRead();
    });
  const subscription = open(client, channel, (state) => {
    joined = state === 'joined';
    handlers.onState(state);
  }, alive);
  return {
    // Sent only over a joined socket; never queued and never retried.
    send(typing: boolean) {
      if (!alive.current || !joined) return false;
      void channel.send({ type: 'broadcast', event: 'typing', payload: { user_id: userId, typing } });
      return true;
    },
    sendRead() {
      if (!alive.current || !joined) return false;
      void channel.send({ type: 'broadcast', event: 'read', payload: { user_id: userId } });
      return true;
    },
    close() {
      joined = false;
      subscription.close();
    },
  };
}
