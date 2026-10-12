import { supabase } from '@/lib/supabase';
import type { Message } from '@/lib/database.types';
import {
  buildConversationPage,
  buildMessagePage,
  chatCursorFilter,
  CONVERSATION_PAGE_SIZE,
  isChatUuid,
  MESSAGE_PAGE_SIZE,
  normalizeMessageContent,
  readCursorsFor,
  requireChatUuid,
  type ChatCursor,
  type ConversationSummary,
} from './chat';

function client() {
  if (!supabase) throw new Error('Messages are not configured.');
  return supabase;
}

// The two participants' presentation fields only. A deleted account has no profile
// row, so its side comes back as null.
const CONVERSATION = `
  id,user_low,user_high,created_at,last_message_at,last_message_sender_id,last_message_preview,
  low:profiles!conversations_user_low_fkey(id,username,display_name,avatar_url),
  high:profiles!conversations_user_high_fkey(id,username,display_name,avatar_url)
` as const;
const MESSAGE = 'id,conversation_id,sender_id,content,created_at' as const;

function pageLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Chat page size must be between 1 and 50.');
  return limit;
}

// The database finds or creates the conversation for the signed-in student; the
// caller's identity is never sent from the app.
export async function getOrCreateConversation(otherUserId: string): Promise<string> {
  const { data, error } = await client().rpc('get_or_create_conversation', { p_other_user_id: requireChatUuid(otherUserId) });
  if (error) throw error;
  return requireChatUuid(data);
}

// null means the conversation does not exist or is not the caller's.
export async function getConversation(conversationId: string, options: { signal?: AbortSignal } = {}) {
  let request = client().from('conversations').select(CONVERSATION).eq('id', requireChatUuid(conversationId));
  if (options.signal) request = request.abortSignal(options.signal);
  const { data, error } = await request.maybeSingle();
  if (error) throw error;
  return data as unknown as ConversationSummary | null;
}

// Conversations that have at least one message, most recent first. Row-level
// security limits the rows to the caller's own.
export async function listConversations({ cursor, limit = CONVERSATION_PAGE_SIZE, signal }: {
  cursor?: ChatCursor;
  limit?: number;
  signal?: AbortSignal;
} = {}) {
  let query = client().from('conversations').select(CONVERSATION).not('last_message_at', 'is', null);
  if (cursor) query = query.or(chatCursorFilter('last_message_at', cursor));
  let request = query.order('last_message_at', { ascending: false }).order('id', { ascending: false })
    .limit(pageLimit(limit) + 1);
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw error;
  return buildConversationPage(data as unknown as ConversationSummary[], limit);
}

export async function getMessages({ conversationId, cursor, limit = MESSAGE_PAGE_SIZE, signal }: {
  conversationId: string;
  cursor?: ChatCursor;
  limit?: number;
  signal?: AbortSignal;
}) {
  let query = client().from('messages').select(MESSAGE).eq('conversation_id', requireChatUuid(conversationId));
  if (cursor) query = query.or(chatCursorFilter('created_at', cursor));
  let request = query.order('created_at', { ascending: false }).order('id', { ascending: false })
    .limit(pageLimit(limit) + 1);
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw error;
  return buildMessagePage(data as Message[], limit);
}

// messageId is created on the device and reused for every retry of the same
// message, so a lost response can never store it twice.
export async function sendMessage({ messageId, conversationId, content }: {
  messageId: string;
  conversationId: string;
  content: string;
}): Promise<Message> {
  const { data, error } = await client().rpc('send_message_idempotent', {
    p_message_id: requireChatUuid(messageId),
    p_conversation_id: requireChatUuid(conversationId),
    p_content: normalizeMessageContent(content),
  }).single();
  if (error) throw error;
  return {
    id: data.id,
    conversation_id: data.conversation_id,
    sender_id: data.sender_id,
    content: data.content,
    created_at: data.created_at,
  };
}

// The caller's own read cursors for these conversations. Row-level security
// returns no one else's, so this never says what the other student has read.
export async function listReadCursors(conversationIds: readonly string[], options: { signal?: AbortSignal } = {}) {
  const ids = conversationIds.map(requireChatUuid);
  if (!ids.length) return readCursorsFor([], []);
  let request = client().from('conversation_reads').select('conversation_id,last_read_at').in('conversation_id', ids);
  if (options.signal) request = request.abortSignal(options.signal);
  const { data, error } = await request;
  if (error) throw error;
  return readCursorsFor(ids, data);
}

// The newest message the caller sent here that the other student has read, or
// null. The server answers with an identifier of the caller's own message only:
// the other student's read cursor and its time are never sent to this device.
export async function getReadReceipt(conversationId: string, options: { signal?: AbortSignal } = {}) {
  let request = client().rpc('get_read_receipt', { p_conversation_id: requireChatUuid(conversationId) });
  if (options.signal) request = request.abortSignal(options.signal);
  const { data, error } = await request;
  if (error) throw error;
  return isChatUuid(data) ? data.toLowerCase() : null;
}

export async function markConversationRead(conversationId: string) {
  const { error } = await client().rpc('mark_conversation_read', { p_conversation_id: requireChatUuid(conversationId) });
  if (error) throw error;
}

// Only the caller's own blocks are readable, so this answers "did I block them?".
export async function hasBlocked(otherUserId: string, options: { signal?: AbortSignal } = {}) {
  let request = client().from('user_blocks').select('blocked_id').eq('blocked_id', requireChatUuid(otherUserId));
  if (options.signal) request = request.abortSignal(options.signal);
  const { data, error } = await request.maybeSingle();
  if (error) throw error;
  return data !== null;
}

export async function blockUser(otherUserId: string) {
  const { error } = await client().rpc('block_user', { p_blocked_id: requireChatUuid(otherUserId) });
  if (error) throw error;
}

export async function unblockUser(otherUserId: string) {
  const { error } = await client().rpc('unblock_user', { p_blocked_id: requireChatUuid(otherUserId) });
  if (error) throw error;
}
