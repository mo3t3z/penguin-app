import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  addPendingMessage,
  appendOlderMessages,
  buildConversationPage,
  buildMessagePage,
  canSendMessage,
  chatCursorFilter,
  chatErrorKind,
  chatErrorMessages,
  composerState,
  confirmMessage,
  conversationPreview,
  DELETED_STUDENT,
  isChatUuid,
  isConversationUnread,
  isParticipant,
  markMessageFailed,
  markMessagePending,
  mergeConversations,
  MESSAGE_PAGE_SIZE,
  MESSAGE_TEXT_LIMIT,
  messageDayLabel,
  normalizeMessageContent,
  otherParticipant,
  pendingMessage,
  readCursorsFor,
  reconcileNewestMessages,
  requireChatUuid,
  startsNewDay,
} from '../src/features/chat/chat.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../supabase/migrations/20261010120000_private_chat_foundation.sql');
const integration = read('./chat-integration.sql');
const fn = (name) => {
  const start = migration.indexOf(`create function public.${name}(`);
  assert.notEqual(start, -1, `${name} is defined`);
  return migration.slice(start, migration.indexOf('$$;', start));
};

const alice = '00000000-0000-4000-8000-0000000000a1';
const bob = '00000000-0000-4000-8000-0000000000b2';
const carol = '00000000-0000-4000-8000-0000000000c3';
const conv = '00000000-0000-4000-8000-000000000c01';
const profile = (id, name) => ({ id, username: name.toLowerCase(), display_name: name, avatar_url: null });
const conversation = (overrides = {}) => ({
  id: conv, user_low: alice, user_high: bob, created_at: '2026-10-10T09:00:00+00:00',
  last_message_at: '2026-10-10T10:00:00+00:00', last_message_sender_id: alice, last_message_preview: 'Thanks!',
  low: profile(alice, 'Alice'), high: profile(bob, 'Bob'), ...overrides,
});
const message = (n, overrides = {}) => ({
  id: `00000000-0000-4000-8000-00000000100${n}`, conversation_id: conv, sender_id: alice,
  content: `message ${n}`, created_at: `2026-10-10T10:00:0${n}.000000+00:00`, ...overrides,
});

// --- Schema (source checks; behaviour is proven by tests/chat-integration.sql) -------

test('the migration is additive and changes no existing object', () => {
  assert.doesNotMatch(migration, /\b(drop|truncate)\b/i);
  assert.doesNotMatch(migration, /alter table public\.(profiles|posts|post_media|post_likes|post_comments|institutions|fields)\b/i);
  assert.doesNotMatch(migration, /create or replace/i);
  assert.doesNotMatch(migration, /on auth\.users|alter publication/i);
});

test('chat keeps history when an account is deleted and holds no profile alive', () => {
  for (const column of ['user_low', 'user_high', 'created_by', 'last_message_sender_id']) {
    assert.match(migration, new RegExp(`constraint conversations_${column}_fkey foreign key \\(${column}\\)\\s+references public\\.profiles\\(id\\) on delete set null`));
  }
  assert.match(migration, /constraint messages_sender_id_fkey foreign key \(sender_id\)\s+references public\.profiles\(id\) on delete set null/);
  assert.match(migration, /constraint messages_conversation_id_fkey foreign key \(conversation_id\)\s+references public\.conversations\(id\) on delete cascade/);
  // Nothing in chat can stop a profile from being deleted.
  assert.doesNotMatch(migration, /on delete (restrict|no action)/i);
  assert.match(migration, /if new\.user_low is null and new\.user_high is null then\s+delete from public\.conversations c where c\.id = new\.id;/);
  assert.match(migration, /after update of user_low, user_high on public\.conversations/);
});

test('a pair has one canonical conversation and messages have bounded text', () => {
  assert.match(migration, /constraint conversations_canonical_pair check \(user_low < user_high\)/);
  assert.match(migration, /constraint conversations_pair_unique unique \(user_low, user_high\)/);
  assert.match(migration, /char_length\(content\) between 1 and 2000 and content ~ '\[\^\[:space:\]\]'/);
  assert.match(migration, /create index messages_conversation_cursor_idx\s+on public\.messages \(conversation_id, created_at desc, id desc\)/);
  assert.match(migration, /primary key \(blocker_id, blocked_id\)/);
  assert.match(migration, /constraint user_blocks_not_self check \(blocker_id <> blocked_id\)/);
});

test('every chat table has RLS and clients get no direct write on messages or conversations', () => {
  for (const table of ['conversations', 'messages', 'conversation_reads', 'user_blocks']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security;`));
  }
  assert.match(migration, /revoke all on public\.conversations, public\.messages, public\.conversation_reads, public\.user_blocks\s+from public, anon, authenticated;/);
  const grants = [...migration.matchAll(/^grant ([^;]+?)\s+on public\.(\w+) to authenticated;/gms)].map((match) => [match[2], match[1].replace(/\s+/g, ' ')]);
  assert.deepEqual(grants, [
    ['conversations', 'select (id, user_low, user_high, created_at, last_message_at, last_message_sender_id, last_message_preview)'],
    ['messages', 'select (id, conversation_id, sender_id, content, created_at)'],
    ['conversation_reads', 'select (conversation_id, user_id, last_read_at)'],
    ['user_blocks', 'select (blocker_id, blocked_id, created_at), delete'],
  ]);
  assert.doesNotMatch(migration, /to anon\b(?!,)/);
  assert.match(migration, /using \(\(select auth\.uid\(\)\) in \(user_low, user_high\)\);/);
  assert.match(migration, /where c\.id = conversation_id and \(select auth\.uid\(\)\) in \(c\.user_low, c\.user_high\)/);
  assert.equal(migration.match(/using \(blocker_id = \(select auth\.uid\(\)\)\);/g).length, 2);
  assert.match(migration, /using \(user_id = \(select auth\.uid\(\)\)\);/);
});

test('definer functions fix their search path, check the caller and are granted narrowly', () => {
  for (const name of ['get_or_create_conversation', 'send_message_idempotent', 'block_user', 'mark_conversation_read']) {
    const body = fn(name);
    assert.match(body, /security definer\s+set search_path = ''/, name);
    assert.match(body, /caller uuid := \(select auth\.uid\(\)\);/, name);
    assert.match(body, /if caller is null then\s+raise exception using errcode = '42501'/, name);
    assert.doesNotMatch(body, /\bexecute\b/i, `${name} uses no dynamic SQL`);
  }
  assert.match(fn('unblock_user'), /security invoker\s+set search_path = ''/);
  for (const signature of ['get_or_create_conversation(uuid)', 'send_message_idempotent(uuid, uuid, text)', 'block_user(uuid)',
    'unblock_user(uuid)', 'mark_conversation_read(uuid)']) {
    const escaped = signature.replace(/[()]/g, '\\$&');
    assert.match(migration, new RegExp(`revoke all on function public\\.${escaped} from public, anon, authenticated;`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${escaped} to authenticated;`));
  }
  for (const helper of ['penguin_chat_lock_sender(uuid)', 'penguin_chat_lock_pair(uuid, uuid)', 'penguin_chat_pair_blocked(uuid, uuid)',
    'penguin_remove_abandoned_conversation()']) {
    const escaped = helper.replace(/[()]/g, '\\$&');
    assert.match(migration, new RegExp(`revoke all on function public\\.${escaped} from public, anon, authenticated;`));
    assert.doesNotMatch(migration, new RegExp(`grant execute on function public\\.${escaped}`));
  }
});

test('sending validates membership, blocks and limits inside one locked write path', () => {
  const body = fn('send_message_idempotent');
  const order = ['penguin_chat_lock_sender(caller)', 'from public.messages m where m.id = p_message_id',
    'Request identifier belongs to a different message', "errcode = '42501', message = 'Conversation unavailable'",
    'penguin_chat_lock_pair(caller, other_id)', 'penguin_chat_pair_blocked(caller, other_id)',
    'penguin_chat_message_limit_per_minute()', 'insert into public.messages', 'update public.conversations c'];
  const positions = order.map((needle) => body.indexOf(needle));
  assert.ok(positions.every((position) => position >= 0), 'every step is present');
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right), 'steps run in this order');
  assert.match(body, /existing\.sender_id is distinct from caller\s+or existing\.conversation_id is distinct from p_conversation_id\s+or existing\.content is distinct from p_content/);
  assert.match(body, /if other_id is null then\s+raise exception using errcode = 'PC001'/);
  assert.match(body, /values \(p_message_id, p_conversation_id, caller, p_content, stored_at\)/);
  assert.match(body, /stored_at := pg_catalog\.clock_timestamp\(\);/);
  assert.match(migration, /penguin_chat_message_limit_per_minute\(\)\s+returns integer language sql immutable set search_path = '' as \$\$ select 30 \$\$;/);
  assert.match(migration, /penguin_chat_conversation_limit_per_day\(\)\s+returns integer language sql immutable set search_path = '' as \$\$ select 20 \$\$;/);
});

test('conversation creation checks onboarding, blocks and the daily limit under the pair lock', () => {
  const body = fn('get_or_create_conversation');
  assert.match(body, /p_other_user_id is null or p_other_user_id = caller/);
  assert.match(body, /where p\.id = caller and p\.onboarding_completed/);
  assert.match(body, /where p\.id = p_other_user_id and p\.onboarding_completed/);
  const lock = body.indexOf('penguin_chat_lock_pair(low_id, high_id)');
  assert.ok(lock > 0 && lock < body.indexOf('where c.user_low = low_id and c.user_high = high_id'));
  assert.ok(body.indexOf('penguin_chat_pair_blocked(caller, p_other_user_id)') > lock);
  assert.match(body, /penguin_chat_conversation_limit_per_day\(\)/);
  assert.match(fn('block_user'), /perform public\.penguin_chat_lock_pair\(caller, p_blocked_id\);\s+insert into public\.user_blocks \(blocker_id, blocked_id\)\s+values \(caller, p_blocked_id\)/);
});

test('the executable integration script covers the required security cases', () => {
  for (const phrase of ['a third account cannot read the conversation', 'a third account cannot read the messages',
    'a third account cannot send into the conversation', 'a participant cannot insert a message directly, forged or not',
    'the same identifier with different text is rejected', 'the same identifier for another conversation is rejected',
    'a conversation with yourself is rejected', 'a student who has not finished onboarding cannot start a conversation',
    'the blocked student cannot send either', 'history stays readable while blocked', 'unblocking sends nothing',
    'another account cannot remove someone else', 'the 31st new message within a minute is refused',
    'the 21st new conversation within a day is refused', 'the remaining participant keeps the whole history',
    'the deleted student\'\'s messages carry no identity', 'no new message can be sent to a deleted account',
    'the deleted student\'\'s posts are still removed by the existing cascade', 'no orphaned messages remain',
    'pagination is stable and does not repeat or skip messages', 'the profile is deleted with the account']) {
    assert.ok(integration.includes(phrase), phrase);
  }
  // It runs against the real schema and real account deletion, and stops on the first failure.
  assert.match(integration, /^\\set ON_ERROR_STOP on$/m);
  assert.match(integration, /insert into auth\.users \(id\)/);
  assert.match(integration, /delete from auth\.users where id = :'bob';/);
  assert.doesNotMatch(integration, /create table public\.(profiles|posts)/);
  const concurrency = read('./chat-concurrency.sh');
  for (const phrase of ['six simultaneous creations from both sides return one conversation id',
    'six simultaneous sends of one identifier store one message', '25 stored + 20 simultaneous sends leave exactly 30 messages',
    'a send that waited for an uncommitted block is refused once the block commits',
    'a block waits for a send already in progress for the pair', '30 simultaneous new conversations leave exactly 20']) {
    assert.ok(concurrency.includes(phrase), phrase);
  }
  // The runner only ever talks to its own local container.
  const runner = read('./chat-db-verify.sh');
  assert.doesNotMatch(runner, /supabase\.co|SUPABASE_|DATABASE_URL|\.env/);
  assert.match(runner, /docker rm -f \"\$NAME\"/);
});

// --- Participants and previews ------------------------------------------------------

test('the other participant is resolved from either side', () => {
  assert.deepEqual(otherParticipant(conversation(), alice), { id: bob, name: 'Bob', username: 'bob', avatarUrl: null, deleted: false });
  assert.equal(otherParticipant(conversation(), bob).name, 'Alice');
  assert.equal(isParticipant(conversation(), alice), true);
  assert.equal(isParticipant(conversation(), carol), false);
});

test('a deleted account appears only as Deleted Student', () => {
  const expected = { id: null, name: DELETED_STUDENT, username: null, avatarUrl: null, deleted: true };
  assert.deepEqual(otherParticipant(conversation({ user_high: null, high: null }), alice), expected);
  assert.deepEqual(otherParticipant(conversation({ user_low: null, low: null }), bob), expected);
  // A profile that does not match the participant column is never shown.
  assert.deepEqual(otherParticipant(conversation({ high: profile(carol, 'Carol') }), alice), expected);
  assert.equal(DELETED_STUDENT, 'Deleted Student');
});

test('the preview marks your own last message', () => {
  assert.equal(conversationPreview(conversation(), alice), 'You: Thanks!');
  assert.equal(conversationPreview(conversation(), bob), 'Thanks!');
  assert.equal(conversationPreview(conversation({ last_message_preview: ' two\n lines ' }), bob), 'two lines');
  assert.equal(conversationPreview(conversation({ last_message_preview: null }), bob), '');
  assert.equal(conversationPreview(conversation({ last_message_sender_id: null }), alice), 'Thanks!');
});

// --- Validation and pagination ------------------------------------------------------

test('message text is trimmed and limited to 2,000 characters', () => {
  assert.equal(MESSAGE_TEXT_LIMIT, 2000);
  assert.equal(MESSAGE_PAGE_SIZE, 30);
  assert.equal(normalizeMessageContent('  hello  '), 'hello');
  assert.equal(canSendMessage('   \n '), false);
  assert.equal(canSendMessage('x'.repeat(2000)), true);
  assert.equal(canSendMessage('x'.repeat(2001)), false);
  assert.equal(canSendMessage('🙂'.repeat(2000)), true);
  assert.throws(() => normalizeMessageContent(42));
});

test('identifiers and cursors are validated before they reach a query', () => {
  assert.equal(requireChatUuid('00000000-0000-4000-8000-00000000000A'), '00000000-0000-4000-8000-00000000000a');
  assert.equal(isChatUuid(conv), true);
  for (const value of ['', 'abc', `${conv}' or 1=1`, `${conv},id.neq.0`, null, ['x']]) {
    assert.equal(isChatUuid(value), false);
    assert.throws(() => requireChatUuid(value));
  }
  const cursor = { createdAt: '2026-10-10T10:00:00.123456+00:00', id: conv };
  assert.equal(chatCursorFilter('created_at', cursor),
    `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${conv})`);
  assert.match(chatCursorFilter('last_message_at', cursor), /^last_message_at\.lt\./);
  assert.throws(() => chatCursorFilter('created_at', { createdAt: '2026-10-10,id.neq.0', id: conv }));
  assert.throws(() => chatCursorFilter('created_at', { createdAt: cursor.createdAt, id: 'x' }));
});

test('pages keep the limit and continue after the last row', () => {
  const rows = [message(3), message(2), message(1)];
  assert.deepEqual(buildMessagePage(rows, 2), { items: rows.slice(0, 2), nextCursor: { createdAt: rows[1].created_at, id: rows[1].id } });
  assert.equal(buildMessagePage(rows, 3).nextCursor, null);
  assert.deepEqual(buildMessagePage([], 30), { items: [], nextCursor: null });
  const list = [conversation({ id: 'c2' }), conversation({ id: 'c1' })];
  assert.deepEqual(buildConversationPage(list, 1).nextCursor, { createdAt: list[0].last_message_at, id: 'c2' });
  assert.equal(mergeConversations(list, [list[1], conversation({ id: 'c0' })]).length, 3);
});

test('older pages are appended without duplicates', () => {
  const held = [message(4), message(3)];
  assert.deepEqual(appendOlderMessages(held, [message(3), message(2), message(1)]).map(({ id }) => id.slice(-1)), ['4', '3', '2', '1']);
});

// --- Sending, reconciliation and retry ----------------------------------------------

test('a pending message is shown first and replaced by the server row with the same id', () => {
  const pending = pendingMessage({ id: message(5).id, conversationId: conv, senderId: alice, content: 'hi', now: '2026-10-10T10:00:05.000Z' });
  assert.equal(pending.delivery, 'pending');
  const withPending = addPendingMessage([message(2), message(1)], pending);
  assert.deepEqual(withPending.map(({ id }) => id.slice(-1)), ['5', '2', '1']);
  const stored = message(5, { content: 'hi', created_at: '2026-10-10T10:00:06.500000+00:00' });
  const confirmed = confirmMessage(withPending, stored);
  assert.equal(confirmed.length, 3);
  assert.equal(confirmed[0].id, stored.id);
  assert.equal(confirmed[0].delivery, undefined);
  assert.equal(confirmed[0].created_at, stored.created_at);
  // The same confirmation arriving twice changes nothing.
  assert.deepEqual(confirmMessage(confirmed, stored), confirmed);
});

test('a failed message stays visible and Retry reuses its identifier and text', () => {
  const pending = pendingMessage({ id: message(5).id, conversationId: conv, senderId: alice, content: 'hi', now: '2026-10-10T10:00:05.000Z' });
  const failed = markMessageFailed(addPendingMessage([message(1)], pending), pending.id);
  assert.deepEqual([failed.length, failed[0].delivery, failed[0].id, failed[0].content], [2, 'failed', pending.id, 'hi']);
  const retrying = markMessagePending(failed, pending.id);
  assert.deepEqual([retrying[0].delivery, retrying[0].id, retrying[0].content], ['pending', pending.id, 'hi']);
  // Confirmed messages are never marked failed or pending.
  assert.equal(markMessageFailed([message(1)], message(1).id)[0].delivery, undefined);
  assert.equal(markMessagePending([message(1)], message(1).id)[0].delivery, undefined);
  // An uncertain response: the retry is confirmed once, with no duplicate.
  assert.equal(confirmMessage(retrying, message(5, { content: 'hi' })).filter(({ id }) => id === pending.id).length, 1);
});

test('reloading keeps unsent messages unless the server already has them', () => {
  const pending = pendingMessage({ id: message(6).id, conversationId: conv, senderId: alice, content: 'unsent', now: '2026-10-10T10:00:06.000Z' });
  const held = markMessageFailed(addPendingMessage([message(2), message(1)], pending), pending.id);
  const reloaded = reconcileNewestMessages(held, [message(3), message(2), message(1)]);
  assert.deepEqual(reloaded.map(({ id }) => id.slice(-1)), ['6', '3', '2', '1']);
  assert.equal(reloaded[0].delivery, 'failed');
  const arrived = reconcileNewestMessages(held, [message(6, { content: 'unsent' }), message(2), message(1)]);
  assert.deepEqual(arrived.map(({ delivery }) => delivery), [undefined, undefined, undefined]);
});

test('date separators mark the first message of each day', () => {
  const items = [
    { created_at: new Date(2026, 9, 10, 9, 0).toISOString() },
    { created_at: new Date(2026, 9, 10, 8, 0).toISOString() },
    { created_at: new Date(2026, 9, 9, 23, 0).toISOString() },
  ];
  assert.deepEqual(items.map((_, index) => startsNewDay(items, index)), [false, true, true]);
  const now = new Date(2026, 9, 10, 12, 0);
  assert.equal(messageDayLabel(items[0].created_at, now), 'Today');
  assert.equal(messageDayLabel(items[2].created_at, now), 'Yesterday');
  assert.equal(messageDayLabel(new Date(2026, 8, 1, 12).toISOString(), now), 'Sep 1');
  assert.equal(messageDayLabel(new Date(2025, 8, 1, 12).toISOString(), now), 'Sep 1, 2025');
});

// --- Errors and blocking state ------------------------------------------------------

test('database codes map to neutral messages', () => {
  assert.equal(chatErrorKind({ code: 'PC001' }), 'unavailable');
  assert.equal(chatErrorKind({ code: 'PC002' }), 'rate-limited');
  assert.equal(chatErrorKind({ code: '23514' }), 'invalid');
  assert.equal(chatErrorKind({ code: '22023' }), 'invalid');
  assert.equal(chatErrorKind({ code: '42501' }), 'forbidden');
  assert.equal(chatErrorKind(new Error('Network request failed')), 'network');
  // The app never says who blocked whom, or that an account was deleted.
  assert.doesNotMatch(chatErrorMessages.unavailable, /block|delet/i);
});

test('the composer state explains why sending is unavailable', () => {
  assert.equal(composerState({ deleted: false, blockedByMe: false, refused: false }), 'open');
  assert.equal(composerState({ deleted: false, blockedByMe: true, refused: false }), 'blocked-by-me');
  assert.equal(composerState({ deleted: false, blockedByMe: false, refused: true }), 'unavailable');
  assert.equal(composerState({ deleted: true, blockedByMe: true, refused: true }), 'deleted');
});

// --- App wiring ---------------------------------------------------------------------

test('the service writes only through the RPCs and never sends an identity', () => {
  const service = read('../src/features/chat/service.ts');
  for (const rpc of ['get_or_create_conversation', 'send_message_idempotent', 'block_user', 'unblock_user', 'mark_conversation_read']) {
    assert.match(service, new RegExp(`\\.rpc\\('${rpc}'`));
  }
  assert.doesNotMatch(service, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  // The only parameters ever sent: the other student, the conversation, the message id and its text.
  assert.deepEqual([...new Set(service.match(/\bp_[a-z_]+(?=:)/g))].sort(),
    ['p_blocked_id', 'p_content', 'p_conversation_id', 'p_message_id', 'p_other_user_id']);
  assert.doesNotMatch(service, /p_sender|p_blocker|service_role|createClient|auth\.getUser/);
  assert.match(service, /\.order\('created_at', \{ ascending: false \}\)\.order\('id', \{ ascending: false \}\)/);
  assert.match(service, /p_content: normalizeMessageContent\(content\)/);
});

test('chat state is scoped to the account and nothing is logged', () => {
  const chat = read('../src/features/chat/use-chat.ts');
  assert.match(chat, /const key = `\$\{userId\}:\$\{conversationId\}:\$\{attempt\}`;/);
  assert.match(chat, /setThread\(\(current\) => current\?\.key === key \? change\(current\) : current\);/);
  assert.match(chat, /id: Crypto\.randomUUID\(\)/);
  assert.match(chat, /void deliver\(failed\.id, failed\.content\);/);
  const list = read('../src/features/chat/use-conversations.ts');
  assert.match(list, /const held = enabled && list\?\.userId === userId \? list : null;/);
  const directory = new URL('../src/features/chat/', import.meta.url);
  for (const name of readdirSync(directory)) {
    assert.doesNotMatch(readFileSync(new URL(name, directory), 'utf8'), /console\./, name);
  }
  assert.match(read('../src/app/(protected)/(tabs)/messages.tsx'), /<ConversationsScreen key=\{state\.profile\.id\}/);
  assert.match(read('../src/app/(protected)/messages/[conversationId].tsx'),
    /<ChatScreen key=\{`\$\{state\.profile\.id\}:\$\{conversationId\}`\} conversationId=\{conversationId\} \/>/);
});

test('Messages is a tab, and opens from the navigation and from another student’s profile', () => {
  // Home has no mail button: one path per task, and Messages is one tap away as a tab.
  const home = read('../src/app/(protected)/(tabs)/home.tsx');
  assert.doesNotMatch(home, /IconButton|Mail\b|\/messages/);
  const route = read('../src/app/(protected)/students/[id].tsx');
  assert.match(route, /actions=\{profile\.id === viewerId \? undefined : <View/);
  assert.match(route, /<MessageStudentButton studentId=\{profile\.id\} compact \/>/);
  const button = read('../src/features/chat/message-student-button.tsx');
  assert.match(button, /router\.push\(\{ pathname: '\/messages\/\[conversationId\]', params: \{ conversationId \} \}\)/);
  // Only an identifier travels in the route; never message text.
  assert.doesNotMatch(button + read('../src/features/chat/conversations-screen.tsx'), /params: \{[^}]*(content|message|preview)/);
  const bar = read('../src/components/navigation/tab-bar.tsx');
  assert.deepEqual([...bar.matchAll(/name: '([a-z]+)'/g)].map((match) => match[1]), ['home', 'discover', 'create', 'messages', 'account']);
  const screen = read('../src/features/chat/chat-screen.tsx');
  assert.match(screen, /KeyboardAvoidingView/);
  // One keyboard strategy only, the same on both platforms: no second offset from
  // keyboard listeners, a vertical offset or a pan layout mode.
  assert.equal(screen.match(/<KeyboardAvoidingView\b/g).length, 1);
  assert.match(screen, /<KeyboardAvoidingView className="flex-1" behavior="padding">/);
  assert.doesNotMatch(screen + read('../src/features/chat/composer.tsx'), /Keyboard\.addListener|keyboardVerticalOffset|useKeyboard|KeyboardAwareScrollView/);
  assert.doesNotMatch(read('../app.json'), /"softwareKeyboardLayoutMode": "pan"/);
  // The composer grows to about five lines, then scrolls inside itself.
  assert.match(read('../src/features/chat/composer.tsx'), /multiline\s+className="max-h-36 /);
  assert.match(screen, /inverted/);
  // Presence and a "delivered" state cannot be established, so neither is shown.
  assert.doesNotMatch(screen + read('../src/features/chat/message-bubble.tsx'), /Online|Delivered|Last seen/);
});

test('the inbox is a tab; conversations and the recipient picker open above the tabs', () => {
  assert.match(read('../src/app/(protected)/(tabs)/_layout.tsx'), /<Tabs\.Screen name="messages" \/>/);
  assert.match(read('../src/features/chat/conversations-screen.tsx'), /router\.push\('\/messages\/new'\)/);
  const picker = read('../src/features/chat/new-message-screen.tsx');
  // An existing conversation opens directly; otherwise the database finds or creates it.
  assert.match(picker, /recipient\.conversationId \?\? await getOrCreateConversation\(recipient\.id\)/);
  assert.match(picker, /router\.replace\(\{ pathname: '\/messages\/\[conversationId\]', params: \{ conversationId \} \}\)/);
  assert.match(picker, /student\.id !== userId/);
  assert.match(read('../src/app/(protected)/messages/new.tsx'), /<NewMessageScreen key=\{state\.profile\.id\}/);
});

test('the chat screens offer nothing the backend lacks', () => {
  const ui = ['chat-screen', 'composer', 'message-bubble', 'conversations-screen', 'conversation-row', 'new-message-screen']
    .map((name) => read(`../src/features/chat/${name}.tsx`).replace(/\/\/.*$/gm, '')).join('\n');
  // No call, attachment, voice or delivery-tick icons, and no presence, group or request wording.
  assert.doesNotMatch(ui, /\b(Phone|Mic|Paperclip|Video|CheckCheck)\b|Online|Delivered|New group|Requests|Invitations/);
});

test('unread comes from the student’s own read cursor and is never a count', () => {
  const me = 'user-me';
  const base = { last_message_at: '2026-10-09T10:00:00.500000+00:00', last_message_sender_id: 'user-other' };
  assert.equal(isConversationUnread(base, me, null), true);
  assert.equal(isConversationUnread(base, me, '2026-10-09T09:59:59.000000+00:00'), true);
  assert.equal(isConversationUnread(base, me, '2026-10-09T10:00:01.000000+00:00'), false);
  // Your own last message, an empty conversation and an unchecked cursor are never unread.
  assert.equal(isConversationUnread({ ...base, last_message_sender_id: me }, me, null), false);
  assert.equal(isConversationUnread({ ...base, last_message_at: null }, me, null), false);
  assert.equal(isConversationUnread(base, me, undefined), false);
  assert.equal(isConversationUnread(base, me, 'not a date'), false);
  // A deleted sender's last message still counts as theirs.
  assert.equal(isConversationUnread({ ...base, last_message_sender_id: null }, me, null), true);
  assert.deepEqual(readCursorsFor(['a', 'b'], [{ conversation_id: 'b', last_read_at: 'x' }]), { a: null, b: 'x' });
  const service = read('../src/features/chat/service.ts');
  assert.match(service, /from\('conversation_reads'\)\.select\('conversation_id,last_read_at'\)\.in\('conversation_id', ids\)/);
  assert.doesNotMatch(read('../src/features/chat/conversation-row.tsx'), /unreadCount/);
});

// --- Message bubbles ------------------------------------------------------------------

test('consecutive messages from one sender form a group', async () => {
  const { messageGroupPosition, MESSAGE_GROUP_WINDOW_MS } = await import('../src/features/chat/chat.ts');
  const at = (minute, second = 0) => new Date(2026, 9, 10, 10, minute, second).toISOString();
  // Newest first, as the list holds them.
  const items = [
    { sender_id: 'me', created_at: at(9) },          // 0: alone
    { sender_id: 'them', created_at: at(8, 30) },    // 1: end of a group of three
    { sender_id: 'them', created_at: at(8) },        // 2: middle
    { sender_id: 'them', created_at: at(7) },        // 3: start
    { sender_id: 'me', created_at: at(6) },          // 4: end of a group of two
    { sender_id: 'me', created_at: at(5) },          // 5: start
    { sender_id: 'me', created_at: at(5 - 1 - MESSAGE_GROUP_WINDOW_MS / 60_000) }, // 6: too long before
    { sender_id: null, created_at: at(-20) },        // 7: a deleted sender, alone
  ];
  const positions = items.map((_, index) => messageGroupPosition(items, index));
  assert.deepEqual(positions.map(({ start, end }) => `${start ? 'S' : '-'}${end ? 'E' : '-'}`),
    ['SE', '-E', '--', 'S-', '-E', 'S-', 'SE', 'SE']);
  // A new day always starts a new group, even from the same sender a minute apart.
  const midnight = [
    { sender_id: 'me', created_at: new Date(2026, 9, 11, 0, 0, 30).toISOString() },
    { sender_id: 'me', created_at: new Date(2026, 9, 10, 23, 59, 50).toISOString() },
  ];
  assert.deepEqual(messageGroupPosition(midnight, 0), { start: true, end: true });
  assert.deepEqual(messageGroupPosition([{ sender_id: 'me', created_at: at(1) }], 0), { start: true, end: true });
});

test('text direction follows the first letter of the message', async () => {
  const { isRightToLeft } = await import('../src/features/chat/chat.ts');
  assert.equal(isRightToLeft('مرحبا، كيف حالك؟'), true);
  assert.equal(isRightToLeft('שלום'), true);
  assert.equal(isRightToLeft('123 ؟ مرحبا'), true);
  assert.equal(isRightToLeft('Bonjour, ça va ?'), false);
  assert.equal(isRightToLeft('Hello مرحبا'), false);
  assert.equal(isRightToLeft('👍 12:30'), false);
  assert.equal(isRightToLeft(''), false);
});

test('bubbles show the other student’s avatar once per group and never your own', () => {
  const bubble = read('../src/features/chat/message-bubble.tsx');
  // The avatar exists only in the incoming branch, beside the last message of a group.
  assert.equal(bubble.match(/<UserAvatar\b/g).length, 1);
  assert.match(bubble, /\{mine \? <View[\s\S]*?<\/View> : <View className="flex-row items-end gap-2">/);
  assert.match(bubble, /<View className=\{cn\('w-7', showStatus && 'pb-5'\)\}>\s*\{group\.end \? <UserAvatar name=\{sender\.name\} uri=\{sender\.avatarUrl\} size="sm" \/> : null\}/);
  assert.match(bubble, /const showStatus = group\.end \|\| pending \|\| failed \|\| receipt !== null;/);
  // 2px inside a group, 16px between groups.
  assert.match(bubble, /group\.start \? 'pt-4' : 'pt-0\.5'/);
  // Bubbles are capped in width and may shrink, so long text wraps instead of overflowing.
  assert.match(bubble, /max-w-\[82%\] rounded-lg bg-primary/);
  assert.match(bubble, /max-w-\[82%\] rounded-lg bg-muted/);
  // The beak: the last bubble of a group points at its sender.
  assert.match(bubble, /group\.end && 'rounded-br-beak'/);
  assert.match(bubble, /group\.end && 'rounded-bl-beak'/);
  const screen = read('../src/features/chat/chat-screen.tsx');
  // A message from a deleted account shows nothing of the former profile.
  assert.match(screen, /sender=\{item\.sender_id === null \? deletedSender : sender\}/);
  assert.match(screen, /const deletedSender = \{ name: DELETED_STUDENT, avatarUrl: null \};/);
});
