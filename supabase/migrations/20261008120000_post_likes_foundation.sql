-- Sprint 4A.1: additive post-like foundation. Review and deploy manually.
begin;

create table public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint post_likes_one_per_user primary key (post_id, user_id)
);

-- The primary key supports per-post counts and existence checks. This index
-- supports account deletion and queries for the current user's likes.
create index post_likes_user_id_idx on public.post_likes (user_id, post_id);

alter table public.post_likes enable row level security;
revoke all on public.post_likes from public, anon, authenticated;
-- Clients can observe which posts have likes, but never other users' identities.
grant select (post_id), delete on public.post_likes to authenticated;
-- user_id always comes from auth.uid(); clients cannot assign it directly.
grant insert (post_id) on public.post_likes to authenticated;
grant all on public.post_likes to service_role;

create policy post_likes_authenticated_read on public.post_likes
  for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

create policy post_likes_owner_insert on public.post_likes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.posts p where p.id = post_id)
  );

create policy post_likes_owner_delete on public.post_likes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Returns aggregate state for one feed page without exposing liker identities.
-- The function is deliberately capped to the feed's maximum page size.
create function public.get_post_like_summaries(p_post_ids uuid[])
returns table (post_id uuid, like_count bigint, liked_by_me boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if cardinality(p_post_ids) > 50 then
    raise exception using errcode = '22023', message = 'At most 50 post identifiers are allowed';
  end if;
  if array_position(p_post_ids, null) is not null then
    raise exception using errcode = '22023', message = 'Post identifiers cannot be null';
  end if;

  return query
    with requested(requested_post_id) as (
      select distinct unnest(coalesce(p_post_ids, '{}'::uuid[]))
    )
    select
      p.id,
      count(pl.user_id)::bigint,
      coalesce(bool_or(pl.user_id = caller_id), false)
    from requested r
    join public.posts p on p.id = r.requested_post_id
    left join public.post_likes pl on pl.post_id = p.id
    group by p.id;
end;
$$;

revoke all on function public.get_post_like_summaries(uuid[]) from public, anon, authenticated;
grant execute on function public.get_post_like_summaries(uuid[]) to authenticated;

comment on table public.post_likes is
  'One authenticated user like per post; liker identities are not exposed to mobile clients.';
comment on function public.get_post_like_summaries(uuid[]) is
  'Returns aggregate counts and caller-specific liked state for up to 50 visible feed posts.';

commit;
