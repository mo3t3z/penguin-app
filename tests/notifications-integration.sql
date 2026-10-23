-- Executable database checks for the Sprint 8 notifications migration: grants,
-- row-level security and the three triggers, against the REAL schema. Run only
-- against a DISPOSABLE database (tests/notifications-db-verify.sh), never the hosted
-- project. Every file in supabase/migrations must be applied first.
-- Ends by printing "notifications integration: all assertions passed".
\set ON_ERROR_STOP on

create function public.test_assert(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;
create function public.test_login(user_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', user_id::text, false);
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, false);
end;
$$;
-- The stored truth, read past row-level security.
create function public.test_notices(r uuid, t text) returns bigint language sql security definer set search_path = '' as
  $$ select count(*) from public.notifications where recipient_id = r and type = t $$;
grant execute on function public.test_assert(boolean, text), public.test_login(uuid), public.test_notices(uuid, text)
  to authenticated, anon;

\set alice '00000000-0000-4000-8000-0000000000a1'
\set bob   '00000000-0000-4000-8000-0000000000b2'
\set carol '00000000-0000-4000-8000-0000000000c3'
\set dave  '00000000-0000-4000-8000-0000000000d4'
\set post1 '00000000-0000-4000-8000-000000000101'
\set post2 '00000000-0000-4000-8000-000000000102'

insert into auth.users (id) values (:'alice'), (:'bob'), (:'carol'), (:'dave');

-- --- Grants ------------------------------------------------------------------------

select public.test_assert(not has_table_privilege('authenticated', 'public.notifications', 'insert'), 'no direct insert');
select public.test_assert(not has_table_privilege('authenticated', 'public.notifications', 'update'), 'no direct update');
select public.test_assert(not has_table_privilege('authenticated', 'public.notifications', 'delete'), 'no direct delete');
select public.test_assert(not has_table_privilege('anon', 'public.notifications', 'select'), 'anon reads nothing');

-- --- Connection requests and acceptance --------------------------------------------

set role authenticated;
select public.test_login(:'alice');
select public.request_connection(:'bob');
select public.test_assert(public.test_notices(:'bob', 'connection_request') = 1, 'bob is told alice wants to connect');
select public.test_login(:'bob');
select public.respond_connection(:'alice', true);
select public.test_assert(public.test_notices(:'alice', 'connection_accepted') = 1, 'alice is told bob accepted');
-- alice and carol connect too, so bob and carol share alice.
select public.test_login(:'carol');
select public.request_connection(:'alice');
select public.test_login(:'alice');
select public.request_connection(:'carol');
select public.test_assert(public.test_notices(:'carol', 'connection_accepted') = 1, 'asking back accepts and tells the first asker');
-- A declined request sent again replaces the unread notice instead of adding one.
select public.test_login(:'dave');
select public.request_connection(:'bob');
select public.test_login(:'bob');
select public.respond_connection(:'dave', false);
select public.test_login(:'dave');
select public.request_connection(:'bob');
select public.test_assert(public.test_notices(:'bob', 'connection_request') = 2, 'one unread request notice per student (alice, dave)');

-- --- Comments ----------------------------------------------------------------------

reset role;
insert into public.posts (id, author_id, content) values (:'post1', :'bob', 'Bob posts'), (:'post2', :'carol', 'Carol posts');
-- alice comments on bob's post: bob is told; carol is connected to alice but not to
-- bob, so she is not.
insert into public.post_comments (post_id, author_id, content) values (:'post1', :'alice', 'Nice');
select public.test_assert(public.test_notices(:'bob', 'post_comment') = 1, 'the post author is told about a comment');
select public.test_assert(public.test_notices(:'carol', 'connection_comment') = 0, 'not connected to the post author: no notice');
-- bob and carol connect; now a comment by alice on bob's post reaches carol.
insert into public.connections (user_low, user_high, requester_id, status)
  values (least(:'bob'::uuid, :'carol'::uuid), greatest(:'bob'::uuid, :'carol'::uuid), :'bob', 'accepted');
insert into public.post_comments (post_id, author_id, content) values (:'post1', :'alice', 'Again');
select public.test_assert(public.test_notices(:'carol', 'connection_comment') = 1, 'a connection commented on another connection''s post');
select public.test_assert(public.test_notices(:'alice', 'post_comment') = 0, 'no notice to yourself');
-- Commenting on your own post tells nobody.
insert into public.post_comments (post_id, author_id, content) values (:'post1', :'bob', 'Thanks');
select public.test_assert(public.test_notices(:'bob', 'post_comment') = 2 and public.test_notices(:'alice', 'post_comment') = 0,
  'your own comment on your own post tells nobody');

-- --- Photos ------------------------------------------------------------------------

insert into public.post_media (post_id, storage_provider, storage_key, upload_key, upload_expires_at, mime_type, size_bytes, position)
  values (:'post2', 'test', 'final/1', 'upload/1', now() + interval '1 hour', 'image/jpeg', 10, 0),
         (:'post2', 'test', 'final/2', 'upload/2', now() + interval '1 hour', 'image/jpeg', 10, 1);
select public.test_assert(public.test_notices(:'alice', 'connection_photo') = 0, 'a pending upload tells nobody');
update public.post_media set status = 'ready', width = 10, height = 10, storage_version = 'v1' where post_id = :'post2';
select public.test_assert(public.test_notices(:'alice', 'connection_photo') = 1, 'a connection is told once per post');
select public.test_assert(public.test_notices(:'bob', 'connection_photo') = 1, 'every connection is told');
select public.test_assert(public.test_notices(:'dave', 'connection_photo') = 0, 'a stranger is not told');

-- --- Blocking ----------------------------------------------------------------------

insert into public.user_blocks (blocker_id, blocked_id) values (:'bob', :'alice');
insert into public.post_comments (post_id, author_id, content) values (:'post1', :'alice', 'Blocked now');
select public.test_assert(public.test_notices(:'bob', 'post_comment') = 2, 'no notice from a student you blocked');

-- --- Reading -----------------------------------------------------------------------

set role authenticated;
select public.test_login(:'carol');
select public.test_assert((select count(*) from public.notifications) = public.test_notices(:'carol', 'connection_comment')
  + public.test_notices(:'carol', 'connection_accepted') + public.test_notices(:'carol', 'connection_request')
  + public.test_notices(:'carol', 'connection_photo') + public.test_notices(:'carol', 'post_comment'), 'carol reads only her own notices');
select public.test_assert(public.get_unread_notification_count() > 0, 'carol has unread notices');
select public.mark_notifications_read(null);
select public.test_assert(public.get_unread_notification_count() = 0, 'marking read clears the count');
select public.test_login(:'bob');
select public.test_assert(public.get_unread_notification_count() > 0, 'marking read touches only your own');

reset role;
delete from auth.users where id = :'alice';
select public.test_assert((select count(*) from public.notifications where actor_id = :'alice') = 0, 'a deleted account takes its notices with it');

\echo 'notifications integration: all assertions passed'
