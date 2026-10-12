-- Executable database checks for the Sprint 6B migration (20261011090000_chat_realtime):
-- read receipts without exposing the read cursor, receipts across a block,
-- authorization of the private conversation topic, and the Realtime publication.
--
-- Run only against a DISPOSABLE database, never the hosted project, and only AFTER
-- tests/chat-integration.sql in the same database: it reuses that script's helper
-- functions (test_assert, test_fails, test_login). tests/chat-db-verify.sh does both.
--
-- It ends by printing "chat realtime integration: all assertions passed".
\set ON_ERROR_STOP on

\set gina  '00000000-0000-4000-8000-0000000006a1'
\set hugo  '00000000-0000-4000-8000-0000000006b2'
\set ivan  '00000000-0000-4000-8000-0000000006c3'
\set rm1   '00000000-0000-4000-8000-000000006001'
\set rm2   '00000000-0000-4000-8000-000000006002'
\set rm3   '00000000-0000-4000-8000-000000006003'
\set nowhere '00000000-0000-4000-8000-00000000dead'

reset role;
insert into auth.users (id) values (:'gina'), (:'hugo'), (:'ivan');
update public.profiles p set
    username = 'live_' || right(replace(p.id::text, '-', ''), 6),
    display_name = 'Live ' || right(p.id::text, 4),
    institution_id = (select id from public.institutions order by slug limit 1),
    field_id = (select id from public.fields order by slug limit 1),
    study_level = 'undergraduate',
    onboarding_completed = true
  where p.id in (:'gina', :'hugo', :'ivan');

-- --- Grants, ownership and function settings ------------------------------------------

select public.test_assert(
  not has_schema_privilege('anon', 'penguin_chat_private', 'usage')
  and not has_function_privilege('anon', 'penguin_chat_private.chat_peer_visible(uuid)', 'execute')
  and not has_function_privilege('anon', 'penguin_chat_private.chat_topic_allowed(text)', 'execute')
  and not has_function_privilege('anon', 'penguin_chat_private.set_read_receipt()', 'execute')
  and not has_function_privilege('anon', 'public.get_read_receipt(uuid)', 'execute'),
  'anonymous callers reach nothing the migration adds');
select public.test_assert(
  has_function_privilege('authenticated', 'public.get_read_receipt(uuid)', 'execute')
  and has_function_privilege('authenticated', 'penguin_chat_private.chat_peer_visible(uuid)', 'execute')
  and has_function_privilege('authenticated', 'penguin_chat_private.chat_topic_allowed(text)', 'execute')
  and not has_function_privilege('authenticated', 'penguin_chat_private.set_read_receipt()', 'execute'),
  'signed-in students can run the receipt function and the policy helpers, not the trigger function');
select public.test_assert(
  not has_schema_privilege('authenticated', 'penguin_private', 'usage')
  and not has_schema_privilege('anon', 'penguin_private', 'usage')
  and not has_table_privilege('authenticated', 'penguin_private.media_cleanup_queue', 'select'),
  'the media-cleanup schema stays closed to signed-in students');
select public.test_assert(
  (select count(*) from pg_proc where pronamespace = 'penguin_chat_private'::regnamespace) = 3
  and (select count(*) from pg_class where relnamespace = 'penguin_chat_private'::regnamespace) = 0,
  'the chat helper schema holds three functions and nothing else');
select public.test_assert(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'] and pg_get_userbyid(p.proowner) = 'postgres')
     from pg_proc p
    where p.pronamespace = 'penguin_chat_private'::regnamespace or p.oid = 'public.get_read_receipt(uuid)'::regprocedure),
  'every new function is a definer function owned by postgres with an empty search path');
select public.test_assert(
  not has_table_privilege('authenticated', 'public.conversation_reads', 'insert')
  and not has_table_privilege('authenticated', 'public.conversation_reads', 'update')
  and not has_table_privilege('authenticated', 'public.conversation_reads', 'delete')
  and not has_table_privilege('authenticated', 'public.messages', 'insert'),
  'the migration grants clients no write access');
select public.test_assert(
  not has_column_privilege('authenticated', 'public.conversation_reads', 'receipt_at', 'select')
  and not has_column_privilege('anon', 'public.conversation_reads', 'receipt_at', 'select')
  and has_column_privilege('authenticated', 'public.conversation_reads', 'last_read_at', 'select'),
  'clients cannot select the receipt column');
select public.test_assert(
  (select array_agg(policyname::text order by policyname) from pg_policies
     where schemaname = 'public' and tablename = 'conversation_reads') = array['conversation_reads_owner_read'],
  'the read cursor keeps its single owner-only policy');

-- --- Read receipts ----------------------------------------------------------------------

set role authenticated;
select public.test_login(:'gina');
select public.get_or_create_conversation(:'hugo') as live \gset
select count(*) from public.send_message_idempotent(:'rm1', :'live', 'hello hugo');
select public.test_assert(public.get_read_receipt(:'live') is null,
  'a message nobody has opened has no read receipt');

select public.test_login(:'hugo');
select public.mark_conversation_read(:'live');
select public.test_assert(
  (select count(*) from public.conversation_reads where conversation_id = :'live' and user_id = :'hugo') = 1,
  'a participant sees their own read cursor');
select public.test_assert(public.get_read_receipt(:'live') is null,
  'the reader, who sent nothing, has no receipt of their own');

select public.test_login(:'gina');
select public.test_assert((select count(*) from public.conversation_reads where conversation_id = :'live') = 0,
  'the sender cannot see the reader''s cursor or its time');
select public.test_assert(public.test_fails(
  'select receipt_at from public.conversation_reads', '42501'),
  'the receipt column cannot be selected');
select public.test_assert(public.get_read_receipt(:'live') = :'rm1',
  'the sender learns that their message was read, by its identifier only');
select public.test_assert(pg_typeof(public.get_read_receipt(:'live'))::text = 'uuid',
  'the receipt is a message identifier, not a time');

select count(*) from public.send_message_idempotent(:'rm2', :'live', 'are you there?');
select public.test_assert(public.get_read_receipt(:'live') = :'rm1',
  'a newer message that has not been opened is not reported as read');

select public.test_login(:'ivan');
select public.test_assert(public.get_read_receipt(:'live') is null,
  'a third account gets no receipt for the conversation');
select public.test_assert(public.get_read_receipt(:'nowhere') is null,
  'a conversation that does not exist answers the same way');
select public.test_assert((select count(*) from public.conversation_reads where conversation_id = :'live') = 0,
  'a third account sees no read cursor of the conversation');
select public.test_assert((select count(*) from public.messages where conversation_id = :'live') = 0,
  'a third account still sees none of the messages');

select public.test_login(:'gina');
select public.test_assert(public.test_fails(format(
  'update public.conversation_reads set receipt_at = now() where conversation_id = %L', :'live'), '42501'),
  'the receipt column cannot be written directly');
select public.test_assert(public.test_fails(format(
  'insert into public.conversation_reads (conversation_id, user_id, last_read_at) values (%L, %L, now())', :'live', :'gina'), '42501'),
  'a read cursor still cannot be inserted directly');
select public.test_assert(public.test_fails('select penguin_chat_private.set_read_receipt()', '42501'),
  'the trigger function cannot be called');

-- --- Private conversation topic ---------------------------------------------------------

select public.test_assert(penguin_chat_private.chat_topic_allowed('chat:' || :'live'),
  'a participant may join the conversation topic');
select public.test_login(:'hugo');
select public.test_assert(penguin_chat_private.chat_topic_allowed('chat:' || :'live'),
  'the other participant may join it too');
select public.test_assert(
  not penguin_chat_private.chat_topic_allowed(null)
  and not penguin_chat_private.chat_topic_allowed('')
  and not penguin_chat_private.chat_topic_allowed('chat:')
  and not penguin_chat_private.chat_topic_allowed('chat:not-a-uuid')
  and not penguin_chat_private.chat_topic_allowed(:'live')
  and not penguin_chat_private.chat_topic_allowed('room:' || :'live')
  and not penguin_chat_private.chat_topic_allowed('chat:' || upper(:'live'))
  and not penguin_chat_private.chat_topic_allowed('chat:' || :'live' || ':extra')
  and not penguin_chat_private.chat_topic_allowed(' chat:' || :'live')
  and not penguin_chat_private.chat_topic_allowed('chat:' || :'live' || E'\n')
  and not penguin_chat_private.chat_topic_allowed('chat:' || :'nowhere'),
  'malformed, foreign and unknown topics are refused');
select public.test_login(:'ivan');
select public.test_assert(
  not penguin_chat_private.chat_topic_allowed('chat:' || :'live')
  and not penguin_chat_private.chat_peer_visible(:'live'),
  'a third account may not join the conversation topic');

-- --- Blocking: receipts stand still, in both directions -------------------------------
-- State now: gina sent rm1 (read by hugo) and rm2 (not opened).

select public.test_login(:'hugo');
select public.block_user(:'gina');
select public.test_login(:'gina');
select public.test_assert(public.get_read_receipt(:'live') = :'rm1',
  'a block does not take back a receipt that was already shown');
select public.test_assert(not penguin_chat_private.chat_topic_allowed('chat:' || :'live'),
  'the blocked student may not join the topic');

-- The blocker opens the conversation while the block exists.
select public.test_login(:'hugo');
select public.mark_conversation_read(:'live');
select public.test_assert(
  (select last_read_at >= (select created_at from public.messages where id = :'rm2')
     from public.conversation_reads where conversation_id = :'live' and user_id = :'hugo'),
  'the blocker''s own cursor still moves, so their unread state clears');
select public.test_assert(not penguin_chat_private.chat_topic_allowed('chat:' || :'live'),
  'the blocker may not join the topic either');
select public.test_login(:'gina');
select public.test_assert(public.get_read_receipt(:'live') = :'rm1',
  'opening the conversation during a block tells the blocked student nothing new');

-- The blocked student opens it too: nothing is revealed to the blocker.
select public.mark_conversation_read(:'live');
reset role;
select public.test_assert(
  (select receipt_at is null from public.conversation_reads where conversation_id = :'live' and user_id = :'gina'),
  'a first read made during a block records no receipt');
select public.test_assert(
  (select receipt_at < (select created_at from public.messages where id = :'rm2')
      and receipt_at < last_read_at
     from public.conversation_reads where conversation_id = :'live' and user_id = :'hugo'),
  'the blocker''s receipt stays where it was when the block began');
set role authenticated;
select public.test_login(:'gina');
select public.test_assert(public.test_fails(format(
  'select * from public.send_message_idempotent(%L, %L, %L)', :'rm3', :'live', 'still there?'), 'PC001'),
  'sending stays refused across the block');

-- After unblocking, receipts move again only when the conversation is next opened.
select public.test_login(:'hugo');
select public.unblock_user(:'gina');
select public.test_login(:'gina');
select public.test_assert(public.get_read_receipt(:'live') = :'rm1',
  'unblocking alone reveals nothing that happened during the block');
select public.test_assert(penguin_chat_private.chat_topic_allowed('chat:' || :'live'),
  'after unblocking, the topic is allowed again');
select public.test_login(:'hugo');
select public.mark_conversation_read(:'live');
select public.test_login(:'gina');
select public.test_assert(public.get_read_receipt(:'live') = :'rm2',
  'the next read after unblocking is reported normally');

-- --- Account deletion -------------------------------------------------------------------

reset role;
delete from auth.users where id = :'hugo';
set role authenticated;
select public.test_login(:'gina');
select public.test_assert(public.get_read_receipt(:'live') is null,
  'a deleted student leaves no receipt behind');
select public.test_assert(
  not penguin_chat_private.chat_peer_visible(:'live')
  and not penguin_chat_private.chat_topic_allowed('chat:' || :'live'),
  'a conversation with a deleted student has no topic');
select public.test_assert((select count(*) from public.messages where conversation_id = :'live') = 2,
  'while its history stays readable');
reset role;

-- --- Realtime publication and channel policies ----------------------------------------
-- Present on Supabase projects; skipped where the bare test database lacks them.

select public.test_assert(
  not exists (select 1 from pg_publication where pubname = 'supabase_realtime')
  or (select count(*) from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public'
          and tablename in ('messages', 'conversations', 'conversation_reads')) = 3,
  'the three chat tables are in the Realtime publication');
select public.test_assert(
  not exists (select 1 from pg_publication where pubname = 'supabase_realtime')
  or not exists (select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_blocks'),
  'blocks are never streamed');
select public.test_assert(
  to_regclass('realtime.messages') is null
  or (select count(*) from pg_policies where schemaname = 'realtime' and tablename = 'messages'
        and policyname in ('penguin_chat_typing_receive', 'penguin_chat_typing_send')) = 2,
  'the conversation topic has a receive and a send policy');

\echo 'chat realtime integration: all assertions passed'
