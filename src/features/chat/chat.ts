import type { Conversation, Message, Profile } from '../../lib/database.types';

export const MESSAGE_TEXT_LIMIT = 2000;
export const MESSAGE_PAGE_SIZE = 30;
export const CONVERSATION_PAGE_SIZE = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

export function requireChatUuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error('Invalid chat identifier.');
  return value.toLowerCase();
}

export function isChatUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

// --- Participants -------------------------------------------------------------------

export type ChatProfile = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;
export type ConversationSummary = Pick<Conversation,
  'id' | 'user_low' | 'user_high' | 'created_at' | 'last_message_at' | 'last_message_sender_id' | 'last_message_preview'> & {
  low: ChatProfile | null;
  high: ChatProfile | null;
};
export type ChatParticipant = { id: string | null; name: string; username: string | null; avatarUrl: string | null; deleted: boolean };

export const DELETED_STUDENT = 'Deleted Student';

// The other side of a one-to-one conversation. A missing identifier means that
// student deleted their account: nothing of their former profile is shown.
export function otherParticipant(conversation: ConversationSummary, userId: string): ChatParticipant {
  const mineIsLow = conversation.user_low === userId;
  const id = mineIsLow ? conversation.user_high : conversation.user_low;
  const profile = mineIsLow ? conversation.high : conversation.low;
  if (!id || !profile || profile.id !== id) {
    return { id: null, name: DELETED_STUDENT, username: null, avatarUrl: null, deleted: true };
  }
  return {
    id,
    name: profile.display_name?.trim() || 'Penguin student',
    username: profile.username?.trim() || null,
    avatarUrl: profile.avatar_url?.trim() || null,
    deleted: false,
  };
}

export function isParticipant(conversation: Pick<Conversation, 'user_low' | 'user_high'>, userId: string) {
  return conversation.user_low === userId || conversation.user_high === userId;
}

// "You: Thanks!" for your own last message, the text alone otherwise.
export function conversationPreview(conversation: ConversationSummary, userId: string) {
  const text = conversation.last_message_preview?.replace(/\s+/g, ' ').trim() ?? '';
  if (!text) return '';
  return conversation.last_message_sender_id === userId ? `You: ${text}` : text;
}

// --- Unread ------------------------------------------------------------------------

// The student's own read cursor per conversation: the time, null when they have
// never opened it. A conversation with no entry was not checked and is never
// reported as unread.
export type ReadCursors = Readonly<Record<string, string | null>>;

// Unread means the last message came from the other side after the student last
// opened the conversation. It is a yes or no: the app does not know how many.
export function isConversationUnread(
  conversation: Pick<ConversationSummary, 'last_message_at' | 'last_message_sender_id'>,
  userId: string,
  lastReadAt: string | null | undefined,
) {
  if (lastReadAt === undefined) return false;
  if (!conversation.last_message_at || conversation.last_message_sender_id === userId) return false;
  if (lastReadAt === null) return true;
  const sent = Date.parse(conversation.last_message_at);
  const read = Date.parse(lastReadAt);
  return Number.isFinite(sent) && Number.isFinite(read) && sent > read;
}

export function readCursorsFor(
  conversationIds: readonly string[],
  rows: readonly { conversation_id: string; last_read_at: string }[],
): ReadCursors {
  const found = new Map(rows.map((row) => [row.conversation_id, row.last_read_at]));
  return Object.fromEntries(conversationIds.map((id) => [id, found.get(id) ?? null]));
}

// --- Pagination ---------------------------------------------------------------------

export type ChatCursor = { createdAt: string; id: string };
export type MessagePage = { items: Message[]; nextCursor: ChatCursor | null };
export type ConversationPage = { items: ConversationSummary[]; nextCursor: ChatCursor | null };

// Keyset filter for "older than this row" on (timestamp desc, id desc). Strict
// validation keeps the cursor from carrying extra PostgREST filter syntax.
export function chatCursorFilter(column: 'created_at' | 'last_message_at', cursor: ChatCursor) {
  const id = requireChatUuid(cursor.id);
  const stamp = cursor.createdAt;
  if (typeof stamp !== 'string' || !STAMP.test(stamp) || !Number.isFinite(Date.parse(stamp))) {
    throw new Error('Invalid chat cursor.');
  }
  return `${column}.lt.${stamp},and(${column}.eq.${stamp},id.lt.${id})`;
}

export function buildMessagePage(rows: Message[], limit: number): MessagePage {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? { createdAt: last.created_at, id: last.id } : null };
}

export function buildConversationPage(rows: ConversationSummary[], limit: number): ConversationPage {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > limit && last?.last_message_at ? { createdAt: last.last_message_at, id: last.id } : null,
  };
}

export function mergeConversations(current: ConversationSummary[], next: ConversationSummary[]) {
  const seen = new Set(current.map(({ id }) => id));
  return [...current, ...next.filter(({ id }) => !seen.has(id))];
}

// --- Messages -----------------------------------------------------------------------

// Newest first. `delivery` is absent for messages confirmed by the server.
export type ChatMessage = Message & { delivery?: 'pending' | 'failed' };

export function normalizeMessageContent(content: string) {
  if (typeof content !== 'string') throw new Error('Message must be text.');
  const normalized = content.trim();
  if (!normalized || [...normalized].length > MESSAGE_TEXT_LIMIT) {
    throw new Error(`Messages need 1–${MESSAGE_TEXT_LIMIT.toLocaleString('en-US')} characters.`);
  }
  return normalized;
}

export function canSendMessage(content: string) {
  try { normalizeMessageContent(content); return true; } catch { return false; }
}

function newestFirst(left: ChatMessage, right: ChatMessage) {
  if (left.created_at !== right.created_at) return left.created_at < right.created_at ? 1 : -1;
  return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
}

export function pendingMessage(input: {
  id: string; conversationId: string; senderId: string; content: string; now: string;
}): ChatMessage {
  return {
    id: input.id,
    conversation_id: input.conversationId,
    sender_id: input.senderId,
    content: input.content,
    created_at: input.now,
    delivery: 'pending',
  };
}

export function addPendingMessage(items: ChatMessage[], message: ChatMessage) {
  return [message, ...items.filter(({ id }) => id !== message.id)];
}

// The server row replaces the pending one with the same identifier.
export function confirmMessage(items: ChatMessage[], stored: Message) {
  const rest = items.filter(({ id }) => id !== stored.id);
  return [...rest, { ...stored }].sort(newestFirst);
}

export function markMessageFailed(items: ChatMessage[], messageId: string) {
  return items.map((item) => item.id === messageId && item.delivery ? { ...item, delivery: 'failed' as const } : item);
}

export function markMessagePending(items: ChatMessage[], messageId: string) {
  return items.map((item) => item.id === messageId && item.delivery === 'failed' ? { ...item, delivery: 'pending' as const } : item);
}

// Adds an older page below what is already held, without duplicates.
export function appendOlderMessages(current: ChatMessage[], older: Message[]) {
  const seen = new Set(current.map(({ id }) => id));
  return [...current, ...older.filter(({ id }) => !seen.has(id))];
}

// A fresh newest page replaces the confirmed messages; anything still pending or
// failed on this device is kept unless the server now has it.
export function reconcileNewestMessages(current: ChatMessage[], newest: Message[]) {
  const stored = new Set(newest.map(({ id }) => id));
  const unsent = current.filter((item) => item.delivery && !stored.has(item.id));
  return [...unsent, ...newest].sort(newestFirst);
}

// --- Presentation -------------------------------------------------------------------

export function messageDayKey(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

// In a newest-first list the first message of a day is the one whose next (older)
// neighbour belongs to another day, or which has no older neighbour.
export function startsNewDay(items: readonly Pick<ChatMessage, 'created_at'>[], index: number) {
  const older = items[index + 1];
  return !older || messageDayKey(older.created_at) !== messageDayKey(items[index].created_at);
}

// Consecutive messages from one sender, on the same day and at most this far
// apart, are shown as one group.
export const MESSAGE_GROUP_WINDOW_MS = 5 * 60_000;

function sameGroup(left: Pick<ChatMessage, 'sender_id' | 'created_at'>, right: Pick<ChatMessage, 'sender_id' | 'created_at'>) {
  if (left.sender_id !== right.sender_id) return false;
  if (messageDayKey(left.created_at) !== messageDayKey(right.created_at)) return false;
  const gap = Math.abs(Date.parse(left.created_at) - Date.parse(right.created_at));
  return Number.isFinite(gap) && gap <= MESSAGE_GROUP_WINDOW_MS;
}

// Where a message sits in its group in a newest-first list: `start` is the first
// (oldest, top) message of the group and `end` the last (newest, bottom) one. A
// message on its own is both.
export type MessageGroupPosition = { start: boolean; end: boolean };
export function messageGroupPosition(
  items: readonly Pick<ChatMessage, 'sender_id' | 'created_at'>[],
  index: number,
): MessageGroupPosition {
  const older = items[index + 1];
  const newer = items[index - 1];
  return {
    start: !older || !sameGroup(items[index], older),
    end: !newer || !sameGroup(items[index], newer),
  };
}

// True when the first letter of the text belongs to a right-to-left script
// (Arabic, Hebrew and their neighbours), so the bubble can align it to the right.
// Digits, punctuation and emoji before it are skipped.
export function isRightToLeft(text: string) {
  const strong = /[\p{L}]/u.exec(text);
  return Boolean(strong) && /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/.test((strong as RegExpExecArray)[0]);
}

export function messageDayLabel(iso: string, now = new Date(), locale = 'en-US') {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  const day = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const difference = Math.round((day(now) - day(date)) / 86_400_000);
  if (difference === 0) return 'Today';
  if (difference === 1) return 'Yesterday';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric', month: 'short', ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  }).format(date);
}

export function messageTimeLabel(iso: string, locale = 'en-GB') {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

// --- Errors -------------------------------------------------------------------------

export type ChatErrorKind = 'unavailable' | 'rate-limited' | 'invalid' | 'forbidden' | 'network';

// Maps a database error code to what the app tells the student. "unavailable"
// deliberately covers both a block in either direction and a deleted account.
export function chatErrorKind(cause: unknown): ChatErrorKind {
  const code = cause && typeof cause === 'object' && 'code' in cause ? (cause as { code?: unknown }).code : null;
  if (code === 'PC001') return 'unavailable';
  if (code === 'PC002') return 'rate-limited';
  if (code === '22023' || code === '23514') return 'invalid';
  if (code === '42501' || code === 'PGRST301') return 'forbidden';
  return 'network';
}

export const chatErrorMessages: Record<ChatErrorKind, string> = {
  unavailable: 'Messages can’t be sent in this conversation right now.',
  'rate-limited': 'You’re sending messages quickly. Wait a moment, then try again.',
  invalid: `Messages need 1–${MESSAGE_TEXT_LIMIT.toLocaleString('en-US')} characters.`,
  forbidden: 'This conversation isn’t available.',
  network: 'Penguin couldn’t send that. Check your connection and try again.',
};

// Why a conversation could not be opened from a profile or the New message screen.
export const conversationOpenErrors: Record<ChatErrorKind, string> = {
  unavailable: 'You can’t message this student right now.',
  'rate-limited': 'You’ve started a lot of conversations today. Try again tomorrow.',
  invalid: 'You can’t message this student right now.',
  forbidden: 'You can’t message this student right now.',
  network: 'Penguin couldn’t open that conversation. Check your connection and try again.',
};

// What the composer area shows.
//  - 'deleted': the other account no longer exists.
//  - 'blocked-by-me': the student blocked the other person and can unblock.
//  - 'unavailable': the server refused a send for this pair; no reason is given.
//  - 'open': the student can write.
export type ComposerState = 'open' | 'deleted' | 'blocked-by-me' | 'unavailable';

export function composerState(input: { deleted: boolean; blockedByMe: boolean; refused: boolean }): ComposerState {
  if (input.deleted) return 'deleted';
  if (input.blockedByMe) return 'blocked-by-me';
  return input.refused ? 'unavailable' : 'open';
}
