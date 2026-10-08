\set ON_ERROR_STOP on

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end;
$$;

grant usage on schema public to anon, authenticated, service_role;
create table public.profiles (id uuid primary key);
create table public.posts (
  id uuid primary key,
  author_id uuid not null references public.profiles(id) on delete cascade
);
alter table public.posts enable row level security;
grant select on public.posts to authenticated;
create policy posts_authenticated_read on public.posts for select to authenticated using (true);

create function public.penguin_touch_post_record()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.penguin_touch_post_record() from public, anon, authenticated;

\ir ../supabase/migrations/20261008190000_post_comments_foundation.sql

-- Reproduce the deployed defect before installing the forward-only patch.
begin;
insert into public.profiles(id) values ('00000000-0000-4000-8000-000000000001');
insert into public.posts(id, author_id) values
  ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
do $$
begin
  perform public.create_post_comment_idempotent(
    '00000000-0000-4000-8000-000000000100',
    '00000000-0000-4000-8000-000000000010',
    'Reproduce ambiguous conflict target'
  );
  raise exception 'expected SQLSTATE 42702 was not raised';
exception when sqlstate '42702' then
  null;
end;
$$;
rollback;

\ir ../supabase/migrations/20261008233000_comment_rpc_conflict_target_fix.sql

create function public.test_assert(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;
grant execute on function public.test_assert(boolean, text) to authenticated;

select public.test_assert(
  not has_function_privilege('anon', 'public.create_post_comment_idempotent(uuid,uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.get_post_comment_counts(uuid[])', 'execute'),
  'anonymous callers must not execute comment RPCs'
);
select public.test_assert(
  not has_table_privilege('authenticated', 'public.post_comments', 'update'),
  'authenticated clients must not update comments'
);
select public.test_assert(
  has_column_privilege('authenticated', 'public.post_comments', 'content', 'insert')
  and not has_column_privilege('authenticated', 'public.post_comments', 'author_id', 'insert'),
  'authenticated inserts must not accept author identity'
);

begin;
insert into public.profiles(id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002');
insert into public.posts(id, author_id) values
  ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000020', '00000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select * from public.create_post_comment_idempotent(
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000010',
  'First comment'
);
select public.test_assert(
  (select idempotent_replay from public.create_post_comment_idempotent(
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000010',
    'First comment'
  )),
  'same comment UUID must replay without a duplicate row'
);
select public.test_assert((select count(*) = 1 from public.post_comments), 'retry must leave one comment');

do $$
begin
  perform public.create_post_comment_idempotent(
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000010',
    'Changed content'
  );
  raise exception 'conflicting retry unexpectedly succeeded';
exception when invalid_parameter_value then
  null;
end;
$$;

do $$
begin
  perform public.create_post_comment_idempotent(
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000010',
    E' \n\t '
  );
  raise exception 'whitespace comment unexpectedly succeeded';
exception when check_violation then null;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
do $$
begin
  perform public.create_post_comment_idempotent(
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000010',
    'First comment'
  );
  raise exception 'another user reused the comment UUID';
exception when invalid_parameter_value then
  null;
end;
$$;
delete from public.post_comments where id = '00000000-0000-4000-8000-000000000101';
select public.test_assert((select count(*) = 1 from public.post_comments), 'another user must not delete the comment');
select public.test_assert(
  (select comment_count = 1 from public.get_post_comment_counts(
    array['00000000-0000-4000-8000-000000000010'::uuid]
  )),
  'visible post count must include its comment without exposing author details'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
delete from public.post_comments where id = '00000000-0000-4000-8000-000000000101';
delete from public.post_comments where id = '00000000-0000-4000-8000-000000000101';
select public.test_assert((select count(*) = 0 from public.post_comments), 'owned repeated delete must be safe');

reset role;
drop policy posts_authenticated_read on public.posts;
create policy posts_owner_read on public.posts for select to authenticated
  using (author_id = (select auth.uid()));
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select public.test_assert(
  not exists (select 1 from public.get_post_comment_counts(
    array['00000000-0000-4000-8000-000000000020'::uuid]
  )),
  'count RPC must hide posts excluded by caller RLS'
);
rollback;
