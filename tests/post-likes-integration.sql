\set ON_ERROR_STOP on

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end;
$$;

-- The Supabase PostgreSQL image supplies auth.uid() and the auth schema.
grant usage on schema public to anon, authenticated, service_role;

create table public.profiles (id uuid primary key);
create table public.posts (
  id uuid primary key,
  author_id uuid not null references public.profiles(id) on delete cascade
);
alter table public.posts enable row level security;
grant select on public.posts to authenticated;
create policy posts_authenticated_read on public.posts for select to authenticated using (true);

\ir ../supabase/migrations/20261008120000_post_likes_foundation.sql
\ir ../supabase/migrations/20261008170000_post_likes_owner_read_patch.sql

create function public.test_assert(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;
grant execute on function public.test_assert(boolean, text) to authenticated;

select public.test_assert(
  not has_function_privilege('anon', 'public.get_post_like_summaries(uuid[])', 'execute'),
  'anonymous must not execute the summary RPC'
);
select public.test_assert(
  has_column_privilege('authenticated', 'public.post_likes', 'post_id', 'select')
  and not has_column_privilege('authenticated', 'public.post_likes', 'user_id', 'select'),
  'authenticated column grants must expose post_id but not user_id'
);
select public.test_assert(
  (select count(*) = 1 from pg_policies
    where schemaname = 'public' and tablename = 'post_likes'
      and policyname = 'post_likes_owner_read')
  and not exists (select 1 from pg_policies
    where schemaname = 'public' and tablename = 'post_likes'
      and policyname = 'post_likes_authenticated_read'),
  'the forward patch must replace the broad read policy'
);

begin;
insert into public.profiles(id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002');
insert into public.posts(id, author_id) values
  ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
insert into public.post_likes(post_id) values ('00000000-0000-4000-8000-000000000010');
do $$
begin
  insert into public.post_likes(post_id) values ('00000000-0000-4000-8000-000000000010');
  raise exception 'duplicate like unexpectedly succeeded';
exception when unique_violation then
  null;
end;
$$;
select public.test_assert((select count(*) = 1 from public.post_likes), 'duplicate like must remain one row');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
insert into public.post_likes(post_id) values ('00000000-0000-4000-8000-000000000010');
select public.test_assert((select count(*) = 1 from public.post_likes), 'direct reads must show only the caller row');
select public.test_assert(
  (select like_count = 2 and liked_by_me
    from public.get_post_like_summaries(array['00000000-0000-4000-8000-000000000010'::uuid])),
  'summary must count both likes and identify the caller state'
);
select public.test_assert(
  not exists (select 1 from public.get_post_like_summaries(
    array['00000000-0000-4000-8000-000000000099'::uuid
  ])),
  'missing or unauthorized post identifiers must not produce summaries'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
delete from public.post_likes where post_id = '00000000-0000-4000-8000-000000000010';
delete from public.post_likes where post_id = '00000000-0000-4000-8000-000000000010';
select public.test_assert(
  (select like_count = 1 and not liked_by_me
    from public.get_post_like_summaries(array['00000000-0000-4000-8000-000000000010'::uuid])),
  'repeated unlike must remove only the caller row'
);
rollback;
