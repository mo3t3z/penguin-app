-- Sprint 4B.1: additive post-comments foundation. Review and deploy manually.
begin;

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint post_comments_content_length check (
    char_length(content) between 1 and 1000 and content ~ '[^[:space:]]'
  )
);

create index post_comments_post_cursor_idx
  on public.post_comments (post_id, created_at desc, id desc);
create index post_comments_author_idx
  on public.post_comments (author_id, id);

alter table public.post_comments enable row level security;
revoke all on public.post_comments from public, anon, authenticated;
grant select (id, post_id, author_id, content, created_at, updated_at), delete
  on public.post_comments to authenticated;
-- author_id is database-owned through auth.uid(); clients cannot assign it.
grant insert (id, post_id, content)
  on public.post_comments to authenticated;
grant all on public.post_comments to service_role;

create policy post_comments_visible_read on public.post_comments
  for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));

create policy post_comments_owner_insert on public.post_comments
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (select 1 from public.posts p where p.id = post_id)
  );

create policy post_comments_owner_delete on public.post_comments
  for delete to authenticated
  using (author_id = (select auth.uid()));

-- Keep the timestamp correct for trusted administrative updates and a future
-- editing policy. Authenticated clients receive neither UPDATE grant nor policy.
create trigger post_comments_before_update before update on public.post_comments
  for each row execute function public.penguin_touch_post_record();

create function public.create_post_comment_idempotent(
  p_comment_id uuid,
  p_post_id uuid,
  p_content text
)
returns table (
  id uuid,
  post_id uuid,
  author_id uuid,
  content text,
  created_at timestamptz,
  updated_at timestamptz,
  idempotent_replay boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing public.post_comments%rowtype;
  replay boolean := false;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  insert into public.post_comments as inserted_comment (id, post_id, content)
    values (p_comment_id, p_post_id, p_content)
    on conflict (id) do nothing
    returning inserted_comment.id, inserted_comment.post_id, inserted_comment.author_id,
      inserted_comment.content, inserted_comment.created_at, inserted_comment.updated_at into existing;

  if existing.id is null then
    select pc.* into existing
      from public.post_comments pc
      where pc.id = p_comment_id;

    if existing.id is null then
      raise exception using errcode = '40001', message = 'Unable to recover idempotent comment creation';
    end if;
    if existing.author_id is distinct from (select auth.uid())
      or existing.post_id is distinct from p_post_id
      or existing.content is distinct from p_content then
      raise exception using errcode = '22023', message = 'Request identifier belongs to a different comment';
    end if;
    replay := true;
  end if;

  return query select existing.id, existing.post_id, existing.author_id,
    existing.content, existing.created_at, existing.updated_at, replay;
end;
$$;

-- SECURITY INVOKER is deliberate: the caller's posts and post_comments RLS
-- filters both the requested posts and rows included in each aggregate.
create function public.get_post_comment_counts(p_post_ids uuid[])
returns table (post_id uuid, comment_count bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
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
    select p.id, count(pc.id)::bigint
      from requested r
      join public.posts p on p.id = r.requested_post_id
      left join public.post_comments pc on pc.post_id = p.id
      group by p.id;
end;
$$;

revoke all on function public.create_post_comment_idempotent(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.get_post_comment_counts(uuid[])
  from public, anon, authenticated;
grant execute on function public.create_post_comment_idempotent(uuid, uuid, text)
  to authenticated;
grant execute on function public.get_post_comment_counts(uuid[])
  to authenticated;

comment on table public.post_comments is
  'Flat comments on visible posts; a client-generated comment UUID makes creation retry-safe.';
comment on function public.create_post_comment_idempotent(uuid, uuid, text) is
  'Creates one caller-owned comment UUID or returns the caller matching retry result.';
comment on function public.get_post_comment_counts(uuid[]) is
  'Counts comments for up to 50 posts visible through the caller RLS policies.';

commit;
