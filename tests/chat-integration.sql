-- Executable database checks for the Sprint 6A chat migration: grants, row-level
-- security, RPCs, blocking, rate limits and account deletion, against the REAL schema.
--
-- Run only against a DISPOSABLE database (the Supabase Postgres image, or a local
-- `supabase start` database), never the hosted project. First apply every file in
-- supabase/migrations in name order, including the chat migration, then:
--
--   psql "$DISPOSABLE_DATABASE_URL" -f tests/chat-integration.sql
--
-- The script creates test accounts in auth.users, leaves its data behind, and stops
-- at the first failed assertion. It ends by printing
-- "chat integration: all assertions passed".
--
-- Concurrency needs several sessions: see tests/chat-concurrency.sh.
\set ON_ERROR_STOP on

create function public.test_assert(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;
-- Runs a statement as the current role and reports whether it failed with the
-- expected SQLSTATE. Anything the statement did is rolled back.
create function public.test_fails(statement text, expected_state text)
returns boolean language plpgsql as $$
begin
  execute statement;
  return false;
exception when others then
  if sqlstate <> expected_state then
    raise notice 'expected % but got % (%)', expected_state, sqlstate, sqlerrm;
  end if;
  return sqlstate = expected_state;
end;
$$;
create function public.test_login(user_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', user_id::text, false);
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, false);
end;
$$;
grant execute on function public.test_assert(boolean, text), public.test_fails(text, text), public.test_login(uuid)
  to authenticated;

\set alice '00000000-0000-4000-8000-0000000000a1'
\set bob   '00000000-0000-4000-8000-0000000000b2'
\set carol '00000000-0000-4000-8000-0000000000c3'
\set dave  '00000000-0000-4000-8000-0000000000d4'
\set erin  '00000000-0000-4000-8000-0000000000e5'
\set frank '00000000-0000-4000-8000-0000000000f6'
\set m1    '00000000-0000-4000-8000-000000001001'
\set m2    '00000000-0000-4000-8000-000000001002'
\set m3    '00000000-0000-4000-8000-000000001003'
\set m4    '00000000-0000-4000-8000-000000001004'

-- Accounts are created the real way: a row in auth.users, whose trigger creates the
-- profile. Onboarding is then completed for everyone except dave.
insert into auth.users (id) values (:'alice'), (:'bob'), (:'carol'), (:'dave'), (:'erin'), (:'frank');
insert into auth.users (id)
  select ('00000000-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 21) n;
select public.test_assert((select count(*) from public.profiles) = 27, 'every account has a profile');
update public.profiles p set
    username = 'student_' || right(replace(p.id::text, '-', ''), 6),
    display_name = 'Student ' || right(p.id::text, 4),
    institution_id = (select id from public.institutions order by slug limit 1),
    field_id = (select id from public.fields order by slug limit 1),
    study_level = 'undergraduate',
    onboarding_completed = true
  where p.id <> :'dave';

-- --- Grants ------------------------------------------------------------------------

select public.test_assert(
  not has_table_privilege('authenticated', 'public.conversations', 'insert')
  and not has_table_privilege('authenticated', 'public.conversations', 'update')
  and not has_table_privilege('authenticated', 'public.conversations', 'delete')
  and not has_table_privilege('authenticated', 'public.messages', 'insert')
  and not has_table_privilege('authenticated', 'public.messages', 'update')
  and not has_table_privilege('authenticated', 'public.messages', 'delete')
  and not has_table_privilege('authenticated', 'public.conversation_reads', 'insert')
  and not has_table_privilege('authenticated', 'public.conversation_reads', 'update')
  and not has_table_privilege('authenticated', 'public.user_blocks', 'insert')
  and not has_table_privilege('authenticated', 'public.user_blocks', 'update'),
  'clients must have no direct write access to chat tables');
select public.test_assert(
  not has_any_column_privilege('anon', 'public.conversations', 'select')
  and not has_any_column_privilege('anon', 'public.messages', 'select')
  and not has_any_column_privilege('anon', 'public.user_blocks', 'select')
  and not has_function_privilege('anon', 'public.get_or_create_conversation(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.send_message_idempotent(uuid,uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.block_user(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.unblock_user(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.mark_conversation_read(uuid)', 'execute'),
  'anonymous callers must have no chat access');
select public.test_assert(
  not has_function_privilege('authenticated', 'public.penguin_chat_pair_blocked(uuid,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.penguin_chat_lock_pair(uuid,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.penguin_chat_lock_sender(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.penguin_remove_abandoned_conversation()', 'execute'),
  'internal helpers must not be callable by clients');
select public.test_assert(
  not has_column_privilege('authenticated', 'public.conversations', 'created_by', 'select'),
  'created_by is not exposed to clients');

-- --- Conversations -----------------------------------------------------------------

set role authenticated;
select public.test_login(:'alice');
select public.get_or_create_conversation(:'bob') as conv \gset
select public.test_assert(public.get_or_create_conversation(:'bob') = :'conv', 'the same pair returns the same conversation');
select public.test_assert(public.test_fails(format('select public.get_or_create_conversation(%L)', :'alice'), '22023'),
  'a conversation with yourself is rejected');
select public.test_assert(public.test_fails(format('select public.get_or_create_conversation(%L)', :'dave'), 'PC001'),
  'a student who has not finished onboarding cannot be messaged');
select public.test_assert(public.test_fails('select public.get_or_create_conversation(gen_random_uuid())', 'PC001'),
  'an account that does not exist cannot be messaged');
select public.get_or_create_conversation(:'carol') as conv2 \gset

select public.test_login(:'bob');
select public.test_assert(public.get_or_create_conversation(:'alice') = :'conv', 'the pair is the same from the other side');
select public.test_login(:'dave');
select public.test_assert(public.test_fails(format('select public.get_or_create_conversation(%L)', :'alice'), '42501'),
  'a student who has not finished onboarding cannot start a conversation');
reset role;
select public.test_assert(
  (select count(*) from public.conversations
     where user_low = least(:'alice'::uuid, :'bob'::uuid) and user_high = greatest(:'alice'::uuid, :'bob'::uuid)) = 1,
  'exactly one row exists for the pair');
select public.test_assert(public.test_fails(format(
  'insert into public.conversations (user_low, user_high) values (%L, %L)',
  least(:'alice'::uuid, :'bob'::uuid), greatest(:'alice'::uuid, :'bob'::uuid)), '23505'),
  'a duplicate pair is refused by the unique constraint');
select public.test_assert(public.test_fails(format(
  'insert into public.conversations (user_low, user_high) values (%L, %L)',
  greatest(:'alice'::uuid, :'erin'::uuid), least(:'alice'::uuid, :'erin'::uuid)), '23514'),
  'a pair in the wrong order is refused');

-- --- Messages ----------------------------------------------------------------------

set role authenticated;
select public.test_login(:'alice');
select public.test_assert(
  (select not idempotent_replay and sender_id = :'alice' and content = 'Hello Bob'
     from public.send_message_idempotent(:'m1', :'conv', 'Hello Bob')),
  'a participant can send, and the sender is the caller');
select public.test_assert(
  (select idempotent_replay from public.send_message_idempotent(:'m1', :'conv', 'Hello Bob')),
  'repeating the same request replays the stored message');
select public.test_assert((select count(*) from public.messages where id = :'m1') = 1, 'a replay stores nothing new');
select public.test_assert(public.test_fails(format(
  'select * from public.send_message_idempotent(%L, %L, %L)', :'m1', :'conv', 'Different text'), '22023'),
  'the same identifier with different text is rejected');
select public.test_assert(public.test_fails(format(
  'select * from public.send_message_idempotent(%L, %L, %L)', :'m1', :'conv2', 'Hello Bob'), '22023'),
  'the same identifier for another conversation is rejected');
select public.test_assert(public.test_fails(format(
  'select * from public.send_message_idempotent(gen_random_uuid(), %L, %L)', :'conv', '   '), '23514'),
  'a blank message is rejected');
select public.test_assert(public.test_fails(format(
  'select * from public.send_message_idempotent(gen_random_uuid(), %L, %L)', :'conv', repeat('x', 2001)), '23514'),
  'a message over 2,000 characters is rejected');
select public.test_assert(
  (select char_length(content) = 2000 from public.send_message_idempotent(:'m2', :'conv', repeat('x', 2000))),
  'a message of exactly 2,000 characters is stored');
select public.test_assert(public.test_fails(
  'select * from public.send_message_idempotent(gen_random_uuid(), gen_random_uuid(), ''hi'')', '42501'),
  'a conversation that does not exist gives the same answer as one that is not yours');
select public.test_assert(public.test_fails(format(
  'insert into public.messages (id, conversation_id, sender_id, content) values (gen_random_uuid(), %L, %L, %L)',
  :'conv', :'bob', 'forged'), '42501'),
  'a participant cannot insert a message directly, forged or not');
select public.test_assert(public.test_fails(format(
  'update public.conversations set last_message_preview = %L where id = %L', 'forged', :'conv'), '42501'),
  'a participant cannot rewrite the conversation summary');
select public.test_assert(public.test_fails(format(
  'update public.messages set content = %L where id = %L', 'edited', :'m1'), '42501'),
  'messages cannot be edited');
select public.test_assert(
  (select last_message_sender_id = :'alice' and last_message_preview = repeat('x', 140) and last_message_at is not null
     from public.conversations where id = :'conv'),
  'the summary is maintained by the database and capped at 140 characters');

select public.test_login(:'bob');
select public.test_assert(public.test_fails(format(
  'select * from public.send_message_idempotent(%L, %L, %L)', :'m1', :'conv', 'Hello Bob'), '22023'),
  'another sender cannot replay someone else''s identifier');
select public.test_assert(
  (select sender_id = :'bob' from public.send_message_idempotent(:'m3', :'conv', 'Hello Alice')),
  'the other participant can reply');
select public.test_assert((select count(*) from public.messages where conversation_id = :'conv') = 3,
  'both participants read the whole conversation');

select public.test_login(:'carol');
select public.test_assert((select count(*) from public.conversations where id = :'conv') = 0,
  'a third account cannot read the conversation');
select public.test_assert((select count(*) from public.messages where conversation_id = :'conv') = 0,
  'a third account cannot read the messages');
select public.test_assert(public.test_fails(format(
  'select * from public.send_message_idempotent(gen_random_uuid(), %L, %L)', :'conv', 'intruding'), '42501'),
  'a third account cannot send into the conversation');
select public.test_assert(public.test_fails(format('select public.mark_conversation_read(%L)', :'conv'), '42501'),
  'a third account cannot mark the conversation read');

-- Keyset pagination on (created_at, id): two pages of two cover all three
-- messages once each, newest first.
select public.test_login(:'alice');
select public.test_assert((
  with page1 as (
    select id, created_at from public.messages where conversation_id = :'conv'
    order by created_at desc, id desc limit 2
  ), boundary as (
    select created_at, id from page1 order by created_at asc, id asc limit 1
  ), page2 as (
    select m.id from public.messages m, boundary b
    where m.conversation_id = :'conv' and (m.created_at, m.id) < (b.created_at, b.id)
    order by m.created_at desc, m.id desc limit 2
  )
  select (select count(*) from page1) = 2 and (select count(*) from page2) = 1
    and not exists (select 1 from page1 join page2 using (id))
    and (select id from page2) = :'m1'
), 'pagination is stable and does not repeat or skip messages');
select public.test_assert(
  (select array_agg(id order by created_at desc, id desc) from public.messages where conversation_id = :'conv')
    = array[:'m3'::uuid, :'m2'::uuid, :'m1'::uuid],
  'messages are stamped in the order they were stored');

-- --- Read state --------------------------------------------------------------------

select public.mark_conversation_read(:'conv');
select public.test_assert((select count(*) from public.conversation_reads where conversation_id = :'conv') = 1,
  'a participant sees their own read cursor');
select public.test_assert(public.test_fails(format(
  'update public.conversation_reads set last_read_at = now() + interval ''1 year'' where conversation_id = %L', :'conv'), '42501'),
  'the read cursor cannot be written directly');
select public.test_login(:'bob');
select public.test_assert((select count(*) from public.conversation_reads where conversation_id = :'conv') = 0,
  'a participant cannot see the other participant''s read cursor');

-- --- Blocking ----------------------------------------------------------------------

select public.test_login(:'alice');
select public.block_user(:'bob');
select public.block_user(:'bob');
select public.test_assert((select count(*) from public.user_blocks where blocked_id = :'bob') = 1,
  'blocking is recorded once, however often it is repeated');
select public.test_assert(public.test_fails(format('select public.block_user(%L)', :'alice'), '22023'),
  'blocking yourself is rejected');
select public.test_assert(public.test_fails(format(
  'insert into public.user_blocks (blocker_id, blocked_id) values (%L, %L)', :'bob', :'alice'), '42501'),
  'a block cannot be created for someone else, or directly at all');
select public.test_assert(public.test_fails(format(
  'select * from public.send_message_idempotent(gen_random_uuid(), %L, %L)', :'conv', 'after block'), 'PC001'),
  'the blocker cannot send');
select public.test_assert(
  (select idempotent_replay from public.send_message_idempotent(:'m1', :'conv', 'Hello Bob')),
  'a retry of a message stored before the block still succeeds');
select public.test_assert(public.get_or_create_conversation(:'bob') = :'conv',
  'the existing conversation can still be opened while blocked');
select public.block_user(:'erin');
select public.test_assert(public.test_fails(format('select public.get_or_create_conversation(%L)', :'erin'), 'PC001'),
  'the blocker cannot start a conversation with a blocked student');

select public.test_login(:'bob');
select public.test_assert(public.test_fails(format(
  'select * from public.send_message_idempotent(gen_random_uuid(), %L, %L)', :'conv', 'after block'), 'PC001'),
  'the blocked student cannot send either');
select public.test_assert((select count(*) from public.messages where conversation_id = :'conv') = 3,
  'history stays readable while blocked');
select public.test_assert((select count(*) from public.user_blocks) = 0,
  'the blocked student cannot see the block');
delete from public.user_blocks where blocker_id = :'alice';
select public.unblock_user(:'alice');
select public.test_login(:'erin');
select public.test_assert(public.test_fails(format('select public.get_or_create_conversation(%L)', :'alice'), 'PC001'),
  'the blocked student cannot start a conversation with the blocker');

select public.test_login(:'alice');
select public.test_assert((select count(*) from public.user_blocks where blocked_id = :'bob') = 1,
  'another account cannot remove someone else''s block');
select public.unblock_user(:'bob');
select public.test_assert((select count(*) from public.user_blocks where blocked_id = :'bob') = 0, 'the blocker can unblock');
select public.test_assert((select count(*) from public.messages where conversation_id = :'conv') = 3,
  'unblocking sends nothing');
select public.test_login(:'bob');
select public.test_assert(
  (select not idempotent_replay from public.send_message_idempotent(:'m4', :'conv', 'Back again')),
  'sending works again after the block is removed');

-- --- Rate limits -------------------------------------------------------------------

select public.test_login(:'carol');
select set_config('test.conv2', :'conv2', false);
do $$
begin
  for n in 1..30 loop
    perform public.send_message_idempotent(
      ('00000000-0000-4000-8000-0000000030' || lpad(n::text, 2, '0'))::uuid,
      current_setting('test.conv2')::uuid, 'message ' || n);
  end loop;
end;
$$;
select public.test_assert(public.test_fails(format(
  'select * from public.send_message_idempotent(gen_random_uuid(), %L, %L)', :'conv2', 'one too many'), 'PC002'),
  'the 31st new message within a minute is refused');
select public.test_assert(
  (select idempotent_replay from public.send_message_idempotent(
     '00000000-0000-4000-8000-000000003001', :'conv2', 'message 1')),
  'a retry is answered even at the limit and is not counted');

select public.test_login(:'frank');
do $$
begin
  for n in 1..20 loop
    perform public.get_or_create_conversation(('00000000-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid);
  end loop;
end;
$$;
select public.test_assert(public.test_fails(
  'select public.get_or_create_conversation(''00000000-0000-4000-8000-000000000221'')', 'PC002'),
  'the 21st new conversation within a day is refused');
select public.test_assert(
  public.get_or_create_conversation('00000000-0000-4000-8000-000000000201') is not null,
  'opening an existing conversation is not limited');

-- --- Account deletion --------------------------------------------------------------

reset role;
insert into public.posts (author_id, content) values (:'bob', 'A post by Bob');
insert into public.post_comments (post_id, author_id, content)
  select id, :'bob', 'A comment by Bob' from public.posts where author_id = :'bob';
-- Real account deletion: removing the auth user cascades to the profile.
delete from auth.users where id = :'bob';
select public.test_assert((select count(*) from public.profiles where id = :'bob') = 0, 'the profile is deleted with the account');
select public.test_assert((select count(*) from public.posts where author_id = :'bob') = 0
  and (select count(*) from public.post_comments where author_id = :'bob') = 0,
  'the deleted student''s posts are still removed by the existing cascade');
select public.test_assert(
  (select (user_low is null) <> (user_high is null) and :'alice' in (user_low, user_high)
     from public.conversations where id = :'conv'),
  'the conversation survives with only the remaining participant');
select public.test_assert((select count(*) from public.messages where conversation_id = :'conv') = 4,
  'no message is lost');
select public.test_assert(
  (select count(*) from public.messages where conversation_id = :'conv' and sender_id is null) = 2
  and (select count(*) from public.messages where sender_id = :'bob') = 0,
  'the deleted student''s messages carry no identity');
select public.test_assert(
  (select last_message_sender_id is null from public.conversations where id = :'conv'),
  'the summary no longer names the deleted student');
select public.test_assert(
  (select count(*) from public.user_blocks where :'bob' in (blocker_id, blocked_id)) = 0
  and (select count(*) from public.conversation_reads where user_id = :'bob') = 0,
  'the deleted student''s blocks and read cursors are removed');

set role authenticated;
select public.test_login(:'alice');
select public.test_assert((select count(*) from public.messages where conversation_id = :'conv') = 4,
  'the remaining participant keeps the whole history');
select public.test_assert(public.test_fails(format(
  'select * from public.send_message_idempotent(gen_random_uuid(), %L, %L)', :'conv', 'anyone there?'), 'PC001'),
  'no new message can be sent to a deleted account');
select public.test_assert(public.test_fails(format('select public.get_or_create_conversation(%L)', :'bob'), 'PC001'),
  'no new conversation can be started with a deleted account');
-- The deleted account's old identifier gives no access.
select public.test_login(:'bob');
select public.test_assert((select count(*) from public.conversations) = 0 and (select count(*) from public.messages) = 0,
  'the deleted identifier reads nothing');
select public.test_assert(public.test_fails(format(
  'select * from public.send_message_idempotent(gen_random_uuid(), %L, %L)', :'conv', 'ghost'), '42501'),
  'the deleted identifier cannot send');

reset role;
delete from auth.users where id = :'alice';
select public.test_assert((select count(*) from public.conversations where id = :'conv') = 0
  and (select count(*) from public.messages where conversation_id = :'conv') = 0,
  'a conversation both students have left is removed with its messages');
select public.test_assert(
  (select count(*) from public.messages m where not exists (select 1 from public.conversations c where c.id = m.conversation_id)) = 0,
  'no orphaned messages remain');

\echo 'chat integration: all assertions passed'
