import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { addPendingMessage, isConversationUnread, markMessageFailed, pendingMessage } from '../src/features/chat/chat.ts';
import {
  advanceReceipt,
  applyConversationChange,
  chatTopic,
  isReadSignal,
  isTypingVisible,
  laterStamp,
  mergeNewestMessages,
  newestOwnReceipt,
  openTypingChannel,
  parseConversationRow,
  parseMessageRow,
  parseReadRow,
  parseTypingSignal,
  receiveMessage,
  shouldSendTyping,
  subscribeToConversation,
  subscribeToInbox,
  TYPING_EXPIRY_MS,
  TYPING_SEND_INTERVAL_MS,
} from '../src/features/chat/realtime.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ME = id(1);
const OTHER = id(2);
const STRANGER = id(3);
const CONVERSATION = id(100);
const ELSEWHERE = id(200);
const at = (second) => `2026-10-10T10:00:${String(second).padStart(2, '0')}.000000+00:00`;
const message = (n, sender, second) => ({ id: id(1000 + n), conversation_id: CONVERSATION, sender_id: sender, content: `m${n}`, created_at: at(second) });
const ids = (items) => items.map((item) => item.id);

// A stand-in for the Supabase client: records channels and lets a test deliver
// events and connection states.
function fakeClient() {
  const channels = [];
  const removed = [];
  return {
    channels,
    removed,
    channel(name, options) {
      const channel = {
        name, options, handlers: [], sent: [], status: null,
        on(type, filter, callback) { channel.handlers.push({ type, filter, callback }); return channel; },
        subscribe(callback) { channel.status = callback; return channel; },
        send(payload) { channel.sent.push(payload); },
        emit(table, row) {
          for (const handler of channel.handlers) if (handler.filter.table === table) handler.callback({ new: row });
        },
        broadcast(payload) {
          for (const handler of channel.handlers) if (handler.type === 'broadcast') handler.callback({ payload });
        },
      };
      channels.push(channel);
      return channel;
    },
    removeChannel(channel) { removed.push(channel); },
  };
}

function conversationSubscription(client = fakeClient()) {
  const seen = { messages: [], states: [] };
  const subscription = subscribeToConversation(client, CONVERSATION, {
    onMessage: (value) => seen.messages.push(value),
    onState: (value) => seen.states.push(value),
  });
  return { client, channel: client.channels.at(-1), seen, subscription };
}

// --- 1. Incoming realtime message -------------------------------------------------

test('an incoming message is delivered and added newest first', () => {
  const { channel, seen } = conversationSubscription();
  channel.emit('messages', message(2, OTHER, 20));
  assert.deepEqual(ids(seen.messages), [id(1002)]);
  const items = receiveMessage([message(1, ME, 10)], seen.messages[0]);
  assert.deepEqual(ids(items), [id(1002), id(1001)]);
});

test('the conversation channel asks only for this conversation’s inserts', () => {
  const { channel } = conversationSubscription();
  const messages = channel.handlers.find((handler) => handler.filter.table === 'messages');
  assert.deepEqual(messages.filter, { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${CONVERSATION}` });
  assert.throws(() => subscribeToConversation(fakeClient(), 'x,id=neq.1', { onMessage() {}, onState() {} }), /Invalid chat identifier/);
});

// --- 2. Optimistic message deduplication ------------------------------------------

test('your own message echoed by realtime replaces the pending copy, once', () => {
  const pending = pendingMessage({ id: id(1005), conversationId: CONVERSATION, senderId: ME, content: 'hi', now: at(30) });
  const held = addPendingMessage([message(1, OTHER, 10)], pending);
  const stored = { ...message(5, ME, 31), content: 'hi' };
  const afterEcho = receiveMessage(held, stored);
  assert.deepEqual(ids(afterEcho), [id(1005), id(1001)]);
  assert.equal(afterEcho[0].delivery, undefined);
  assert.equal(afterEcho[0].created_at, at(31));
  // The send response (or a second copy of the event) arriving afterwards changes nothing.
  assert.equal(receiveMessage(afterEcho, stored), afterEcho);
  // A message that failed locally but was in fact stored is corrected by the event.
  const failed = markMessageFailed(held, pending.id);
  assert.equal(receiveMessage(failed, stored)[0].delivery, undefined);
});

// --- 3. Out-of-order events ---------------------------------------------------------

test('events arriving out of order end up in stable newest-first order', () => {
  const arrivals = [message(3, OTHER, 30), message(1, ME, 10), message(4, ME, 40), message(2, OTHER, 20)];
  const items = arrivals.reduce(receiveMessage, []);
  assert.deepEqual(ids(items), [id(1004), id(1003), id(1002), id(1001)]);
  // Equal timestamps fall back to the identifier, so the order never flips.
  const tie = [message(7, ME, 50), message(8, OTHER, 50)];
  assert.deepEqual(ids(tie.reduce(receiveMessage, [])), ids([...tie].reverse().reduce(receiveMessage, [])));
});

test('an older inbox event never overwrites a newer preview', () => {
  const held = [{ id: CONVERSATION, user_low: ME, user_high: OTHER, created_at: at(0), last_message_at: at(30), last_message_sender_id: OTHER, last_message_preview: 'newer', low: null, high: null }];
  const stale = { id: CONVERSATION, user_low: ME, user_high: OTHER, last_message_at: at(10), last_message_sender_id: ME, last_message_preview: 'older' };
  assert.equal(applyConversationChange(held, stale).items[0].last_message_preview, 'newer');
});

// --- 4. Read-state updates ----------------------------------------------------------

test('a receipt says only what the server has confirmed', () => {
  const items = [message(3, ME, 30), message(2, OTHER, 20), message(1, ME, 10)];
  assert.deepEqual(newestOwnReceipt(items, ME, null), { messageId: id(1003), receipt: 'sent' });
  // The server says an older message was read: the newest is still only sent.
  assert.deepEqual(newestOwnReceipt(items, ME, id(1001)), { messageId: id(1003), receipt: 'sent' });
  assert.deepEqual(newestOwnReceipt(items, ME, id(1003)), { messageId: id(1003), receipt: 'read' });
  // A message still being sent, or one that failed, has no receipt.
  const unsent = addPendingMessage([], pendingMessage({ id: id(1009), conversationId: CONVERSATION, senderId: ME, content: 'x', now: at(40) }));
  assert.equal(newestOwnReceipt(unsent, ME, id(1009)), null);
  assert.equal(newestOwnReceipt([message(2, OTHER, 20)], ME, id(1002)), null);
  assert.doesNotMatch(read('../src/features/chat/realtime.ts'), /'delivered'/);
});

test('a receipt only moves forward and never carries a time', () => {
  const items = [message(3, ME, 30), message(2, OTHER, 20), message(1, ME, 10)];
  assert.equal(advanceReceipt(items, null, id(1001)), id(1001));
  assert.equal(advanceReceipt(items, id(1001), id(1003)), id(1003));
  // An older answer, an unknown message or a failed request never takes "Read" away.
  assert.equal(advanceReceipt(items, id(1003), id(1001)), id(1003));
  assert.equal(advanceReceipt(items, id(1003), null), id(1003));
  assert.equal(advanceReceipt(items, id(1003), id(1999)), id(1003));
  assert.equal(advanceReceipt(items, null, id(1999)), null);
  // The student's own inbox cursor moves forward too.
  assert.equal(laterStamp(at(30), at(10)), at(30));
  assert.equal(laterStamp(at(10), at(30)), at(30));
  assert.equal(laterStamp(null, at(5)), at(5));
  // The device asks the server one question and gets back an identifier of its own message.
  const service = read('../src/features/chat/service.ts');
  assert.match(service, /\.rpc\('get_read_receipt', \{ p_conversation_id: requireChatUuid\(conversationId\) \}\)/);
  assert.match(service, /return isChatUuid\(data\) \? data\.toLowerCase\(\) : null;/);
  // It never selects the other student's cursor, and the open conversation does not listen for it.
  assert.doesNotMatch(service, /receipt_at|user_id,last_read_at/);
  const hook = read('../src/features/chat/use-chat.ts');
  assert.doesNotMatch(hook, /last_read_at|lastReadAt|peerReadAt|conversation_reads/);
  const { channel } = conversationSubscription();
  assert.deepEqual(channel.handlers.map((handler) => handler.filter.table), ['messages']);
});

test('a "just read" signal only prompts a fresh question to the server', () => {
  const client = fakeClient();
  let asked = 0;
  const signals = openTypingChannel(client, CONVERSATION, ME, OTHER, { onTyping() {}, onPeerRead: () => { asked += 1; }, onState() {} });
  const channel = client.channels[0];
  const emitRead = (payload) => {
    for (const handler of channel.handlers) if (handler.filter.event === 'read') handler.callback({ payload });
  };
  emitRead({ user_id: OTHER });
  emitRead({ user_id: STRANGER });
  emitRead({ user_id: ME });
  emitRead('read');
  assert.equal(asked, 1);
  assert.equal(isReadSignal({ user_id: OTHER, message_id: id(1003) }, OTHER), true);
  assert.equal(isReadSignal({ user_id: OTHER }, null), false);
  // Not sent before the channel has joined, and it carries no message or time.
  assert.equal(signals.sendRead(), false);
  channel.status('SUBSCRIBED');
  assert.equal(signals.sendRead(), true);
  assert.deepEqual(channel.sent, [{ type: 'broadcast', event: 'read', payload: { user_id: ME } }]);
  const chat = read('../src/features/chat/use-chat.ts');
  assert.match(chat, /getReadReceipt\(conversationId\)\s*\.then\(\(readMessageId\) => update\(\(latest\) => \(\s*\{ \.\.\.latest, readMessageId: advanceReceipt\(latest\.items, latest\.readMessageId, readMessageId\) \}/);
  assert.match(read('../src/features/chat/chat-screen.tsx'), /onPeerRead: refreshReceipt,/);
  signals.close();
  emitRead({ user_id: OTHER });
  assert.equal(asked, 1);
});

test('the read cursor moves only while the conversation is in view', () => {
  const hook = read('../src/features/chat/use-chat.ts');
  assert.match(hook, /if \(!viewing\.current\) \{ unseen\.current = true; return; \}/);
  assert.match(hook, /viewing\.current = appActive;\s*if \(viewing\.current && unseen\.current\) markRead\(true\);/);
  assert.match(hook, /return \(\) => \{ focused\.current = false; viewing\.current = false; \};/);
  // One place moves the cursor, and it is behind that check.
  assert.equal(hook.match(/markConversationRead\(conversationId\)/g).length, 1);
  assert.match(hook, /if \(message\.sender_id !== userId\) markRead\(true\);/);
  // The other student is told only after the cursor really moved.
  assert.match(hook, /markConversationRead\(conversationId\)\.then\(\(\) => \{ if \(announce\) onMarkedRead\(\); \}\)/);
});

// --- 5. Unread indicators -----------------------------------------------------------

test('a live message makes its conversation unread and moves it to the top', () => {
  const row = (n, second) => ({ id: id(100 + n), user_low: ME, user_high: OTHER, created_at: at(0), last_message_at: at(second), last_message_sender_id: ME, last_message_preview: 'x', low: null, high: null });
  const held = [row(2, 20), row(1, 10)];
  const change = parseConversationRow({ id: id(101), user_low: ME, user_high: OTHER, last_message_at: at(40), last_message_sender_id: OTHER, last_message_preview: 'hello' }, ME);
  const { items, known } = applyConversationChange(held, change);
  assert.equal(known, true);
  assert.deepEqual(ids(items), [id(101), id(102)]);
  assert.equal(items[0].last_message_preview, 'hello');
  assert.equal(isConversationUnread(items[0], ME, at(10)), true);
  // Opening it moves the student's own cursor past the message: no longer unread.
  assert.equal(isConversationUnread(items[0], ME, laterStamp(at(10), at(41))), false);
  // A conversation that is not in the list yet is reported, so the inbox reloads.
  assert.equal(applyConversationChange(held, { ...change, id: id(199) }).known, false);
});

// --- 6. Typing expiration -----------------------------------------------------------

test('typing is throttled when sent and expires when received', () => {
  assert.equal(shouldSendTyping(null, 1_000), true);
  assert.equal(shouldSendTyping(1_000, 1_000 + TYPING_SEND_INTERVAL_MS - 1), false);
  assert.equal(shouldSendTyping(1_000, 1_000 + TYPING_SEND_INTERVAL_MS), true);
  assert.equal(isTypingVisible(null, 5_000), false);
  assert.equal(isTypingVisible(5_000, 5_000 + TYPING_EXPIRY_MS - 1), true);
  assert.equal(isTypingVisible(5_000, 5_000 + TYPING_EXPIRY_MS), false);
  const hook = read('../src/features/chat/use-typing.ts');
  assert.match(hook, /if \(typing\) expiryTimer\.current = setTimeout\(\(\) => setOtherTyping\(false\), TYPING_EXPIRY_MS\);/);
  assert.match(hook, /idleTimer\.current = setTimeout\(stop, TYPING_IDLE_MS\);/);
  // Leaving the conversation withdraws your own signal and clears theirs.
  assert.match(hook, /return \(\) => \{\s*stop\(\);\s*clearExpiry\(\);\s*setOtherTyping\(false\);\s*opened\?\.close\(\);/);
});

test('typing signals travel on a private channel and are accepted only from the other participant', () => {
  const client = fakeClient();
  const seen = [];
  const typing = openTypingChannel(client, CONVERSATION, ME, OTHER, { onTyping: (value) => seen.push(value), onPeerRead() {}, onState() {} });
  const channel = client.channels[0];
  assert.equal(channel.name, `chat:${CONVERSATION}`);
  assert.equal(chatTopic(CONVERSATION), channel.name);
  assert.deepEqual(channel.options, { config: { private: true, broadcast: { self: false, ack: false } } });
  // Nothing is sent before the server has admitted this student to the channel.
  assert.equal(typing.send(true), false);
  channel.status('CHANNEL_ERROR');
  assert.equal(typing.send(true), false);
  assert.deepEqual(channel.sent, []);
  channel.status('SUBSCRIBED');
  assert.equal(typing.send(true), true);
  assert.deepEqual(channel.sent, [{ type: 'broadcast', event: 'typing', payload: { user_id: ME, typing: true } }]);
  channel.broadcast({ user_id: OTHER, typing: true });
  channel.broadcast({ user_id: STRANGER, typing: true });
  channel.broadcast({ user_id: OTHER, typing: 'yes' });
  channel.broadcast(null);
  assert.deepEqual(seen, [true]);
  assert.equal(parseTypingSignal({ user_id: OTHER, typing: false }, OTHER), false);
  assert.equal(parseTypingSignal({ user_id: OTHER, typing: true }, null), null);
  typing.close();
  assert.equal(typing.send(false), false);
  channel.broadcast({ user_id: OTHER, typing: true });
  assert.deepEqual(seen, [true]);
});

// --- 7. Reconnection and missed-message recovery ------------------------------------

test('after a reconnect the newest page fills in what was missed', () => {
  const pending = pendingMessage({ id: id(1050), conversationId: CONVERSATION, senderId: ME, content: 'draft', now: at(50) });
  const held = addPendingMessage([message(2, OTHER, 20), message(1, ME, 10)], pending);
  const page = [message(4, OTHER, 40), message(3, OTHER, 30), message(2, OTHER, 20)];
  const merged = mergeNewestMessages(held, page);
  assert.equal(merged.gap, false);
  assert.deepEqual(ids(merged.items), [id(1050), id(1004), id(1003), id(1002), id(1001)]);
  assert.equal(merged.items[0].delivery, 'pending');
  // The pending message turns out to be stored: the database copy wins.
  const stored = mergeNewestMessages(held, [{ ...pending, delivery: undefined, created_at: at(51) }, message(2, OTHER, 20)]);
  assert.equal(stored.items.filter((item) => item.id === pending.id).length, 1);
  assert.equal(stored.items[0].created_at, at(51));
});

test('more than a page missed leaves no hole in the history', () => {
  const held = [message(2, OTHER, 20), message(1, ME, 10)];
  const page = [message(9, OTHER, 59), message(8, OTHER, 58)];
  const merged = mergeNewestMessages(held, page);
  assert.equal(merged.gap, true);
  assert.deepEqual(ids(merged.items), [id(1009), id(1008)]);
  assert.equal(mergeNewestMessages([], page).gap, false);
  const hook = read('../src/features/chat/use-chat.ts');
  assert.match(hook, /nextCursor: merged\.gap \? page\.nextCursor : latest\.nextCursor/);
});

test('every join reloads from the database, but not in a loop', () => {
  const { channel, seen } = conversationSubscription();
  channel.status('SUBSCRIBED');
  channel.status('CHANNEL_ERROR');
  channel.status('TIMED_OUT');
  channel.status('SUBSCRIBED');
  assert.deepEqual(seen.states, ['joined', 'down', 'down', 'joined']);
  const chat = read('../src/features/chat/use-chat.ts');
  assert.match(chat, /onState: \(state\) => \{ if \(state === 'joined'\) void reconcile\(\); \}/);
  assert.match(chat, /if \(now - lastReconcile\.current < RECONCILE_INTERVAL_MS\) return;/);
  const inbox = read('../src/features/chat/use-conversations.ts');
  assert.match(inbox, /if \(state === 'joined' && Date\.now\(\) - lastRefresh\.current >= RECONCILE_INTERVAL_MS\) void refresh\(\);/);
  // The app never re-subscribes on failure itself; the Realtime client reconnects.
  for (const source of [chat, inbox, read('../src/features/chat/use-typing.ts')]) {
    assert.doesNotMatch(source, /setInterval|while \(/);
  }
});

// --- 8. Subscription cleanup --------------------------------------------------------

test('closing a subscription removes its channel once and silences it', () => {
  const { client, channel, seen, subscription } = conversationSubscription();
  subscription.close();
  subscription.close();
  assert.deepEqual(client.removed, [channel]);
  channel.emit('messages', message(1, OTHER, 10));
  channel.status('SUBSCRIBED');
  assert.deepEqual(seen, { messages: [], states: [] });
});

test('each subscription opens exactly one channel with a name of its own', () => {
  const client = fakeClient();
  const handlers = { onMessage() {}, onRead() {}, onConversation() {}, onState() {} };
  subscribeToConversation(client, CONVERSATION, handlers);
  subscribeToConversation(client, CONVERSATION, handlers);
  subscribeToInbox(client, ME, handlers);
  subscribeToInbox(client, ME, handlers);
  assert.equal(client.channels.length, 4);
  assert.equal(new Set(client.channels.map((channel) => channel.name)).size, 4);
  for (const source of ['use-chat', 'use-conversations']) {
    assert.match(read(`../src/features/chat/${source}.ts`), /subscription\.close\(\)/);
  }
});

// --- 9. Logout and account switching ------------------------------------------------

test('channels depend on the signed-in account and the app being in the foreground', () => {
  const chat = read('../src/features/chat/use-chat.ts');
  assert.match(chat, /if \(!ready \|\| !enabled \|\| !userId \|\| !conversationId \|\| !appActive \|\| !client\) return;/);
  assert.match(chat, /\}, \[appActive, conversationId, enabled, markRead, ready, update, userId\]\);/);
  const inbox = read('../src/features/chat/use-conversations.ts');
  assert.match(inbox, /if \(!live \|\| !enabled \|\| !userId \|\| !appActive \|\| !client\) return;/);
  assert.match(inbox, /\}, \[appActive, enabled, live, refresh, userId\]\);/);
  // Events for a previous account are ignored even if one slips through.
  assert.match(inbox, /setList\(\(current\) => current\?\.userId === userId && !current\.failed/);
  assert.match(read('../src/lib/use-app-active.ts'), /state !== 'background'/);
});

test('the inbox channel is scoped to the signed-in student', () => {
  const client = fakeClient();
  const seen = { conversations: [], reads: [] };
  subscribeToInbox(client, ME, {
    onConversation: (value) => seen.conversations.push(value.id),
    onRead: (value) => seen.reads.push(value.conversationId),
    onState() {},
  });
  const channel = client.channels[0];
  const reads = channel.handlers.find((handler) => handler.filter.table === 'conversation_reads');
  assert.equal(reads.filter.filter, `user_id=eq.${ME}`);
  channel.emit('conversation_reads', { conversation_id: CONVERSATION, user_id: ME, last_read_at: at(5) });
  channel.emit('conversation_reads', { conversation_id: ELSEWHERE, user_id: OTHER, last_read_at: at(5) });
  assert.deepEqual(seen.reads, [CONVERSATION]);
});

// --- 10. Blocked conversations ------------------------------------------------------

test('typing is switched off whenever the two students cannot message each other', () => {
  const screen = read('../src/features/chat/chat-screen.tsx');
  assert.match(screen, /enabled: status === 'ready' && composer === 'open' && focused && appActive,/);
  const hook = read('../src/features/chat/use-typing.ts');
  assert.match(hook, /if \(!enabled \|\| !client \|\| !conversationId \|\| !userId \|\| !otherId\) return;/);
  assert.match(hook, /otherTyping: enabled && otherTyping/);
  // A refused channel is closed, not retried.
  assert.match(hook, /if \(!joined\) opened\?\.close\(\);/);
  const migration = read('../supabase/migrations/20261011090000_chat_realtime.sql');
  // The server refuses the channel and hides the read cursor across a block in either direction.
  assert.match(migration, /and not public\.penguin_chat_pair_blocked\(c\.user_low, c\.user_high\)/);
  // Receipts stand still while a block exists, so "Read" never turns back into "Sent".
  assert.match(migration, /elsif tg_op = 'UPDATE' then\s+new\.receipt_at := old\.receipt_at;/);
  assert.match(migration, /and m\.created_at <= r\.receipt_at/);
  assert.match(migration, /return penguin_chat_private\.chat_peer_visible\(substr\(p_topic, 6\)::uuid\);/);
});

// --- 11. Unauthorized realtime access -----------------------------------------------

test('rows for another conversation or another student are dropped', () => {
  const { channel, seen } = conversationSubscription();
  channel.emit('messages', { ...message(1, OTHER, 10), conversation_id: ELSEWHERE });
  channel.emit('messages', { ...message(2, OTHER, 10), sender_id: 'not-a-uuid' });
  channel.emit('messages', { ...message(3, OTHER, 10), content: '' });
  channel.emit('messages', { ...message(4, OTHER, 10), created_at: 'yesterday' });
  channel.emit('messages', null);
  channel.emit('messages', 'DROP TABLE');
  assert.deepEqual(seen.messages, []);
  assert.equal(parseMessageRow({ ...message(5, null, 10) }, CONVERSATION).sender_id, null);
  // A conversation the student is not part of never reaches the inbox.
  assert.equal(parseConversationRow({ id: ELSEWHERE, user_low: OTHER, user_high: STRANGER, last_message_at: at(1), last_message_sender_id: OTHER, last_message_preview: 'secret' }, ME), null);
  assert.equal(parseReadRow({ conversation_id: CONVERSATION, user_id: 'x', last_read_at: at(1) }), null);
});

test('authorization stays on the server: no new write path, and the client never widens it', () => {
  const service = read('../src/features/chat/service.ts');
  assert.doesNotMatch(service, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  const live = read('../src/features/chat/realtime.ts') + read('../src/features/chat/realtime-service.ts');
  assert.doesNotMatch(live, /service_role|createClient|setAuth|accessToken|console\./);
  // Typing is the only thing the app broadcasts, and only on the private channel.
  assert.equal(live.match(/\.send\(\{/g).length, 2);
  assert.deepEqual(live.match(/event: '[a-z]+', payload/g), ["event: 'typing', payload", "event: 'read', payload"]);
  assert.doesNotMatch(live, /presence|track\(/i);
  const migration = read('../supabase/migrations/20261011090000_chat_realtime.sql');
  assert.doesNotMatch(migration, /to anon|to public|security definer(?![^;]*set search_path = '')/i);
  assert.match(migration, /revoke all on function penguin_chat_private\.chat_peer_visible\(uuid\) from public, anon, authenticated, service_role;/);
  assert.match(migration, /revoke all on function public\.get_read_receipt\(uuid\) from public, anon, authenticated;/);
  // The read cursor keeps its 6A owner-only policy: no new policy and no new column grant.
  assert.doesNotMatch(migration, /create policy \w+ on public\.conversation_reads|grant select/i);
  assert.doesNotMatch(migration, /create or replace|drop |alter function|update public\.|delete from/i);
});

// --- 12. Duplicate events and race conditions ---------------------------------------

test('duplicate events leave the list untouched', () => {
  const first = receiveMessage([], message(1, OTHER, 10));
  const again = receiveMessage(first, message(1, OTHER, 10));
  assert.equal(again, first);
  const storm = [1, 2, 1, 3, 2, 3, 1].map((n) => message(n, OTHER, n * 10));
  assert.deepEqual(ids(storm.reduce(receiveMessage, [])), [id(1003), id(1002), id(1001)]);
});

test('an event racing with the send response settles on one stored message', () => {
  const pending = pendingMessage({ id: id(1070), conversationId: CONVERSATION, senderId: ME, content: 'race', now: at(10) });
  const stored = { id: pending.id, conversation_id: CONVERSATION, sender_id: ME, content: 'race', created_at: at(11) };
  const incoming = message(8, OTHER, 12);
  const orders = [[stored, incoming, stored], [incoming, stored, stored], [stored, stored, incoming]];
  for (const order of orders) {
    const items = order.reduce(receiveMessage, addPendingMessage([], pending));
    assert.deepEqual(ids(items), [id(1008), id(1070)]);
    assert.equal(items[1].delivery, undefined);
  }
  // A reload that lands between two events agrees with them.
  const merged = mergeNewestMessages(receiveMessage(addPendingMessage([], pending), incoming), [incoming, stored]);
  assert.deepEqual(ids(merged.items), [id(1008), id(1070)]);
});
