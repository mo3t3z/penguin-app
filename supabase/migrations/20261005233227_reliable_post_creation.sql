-- Sprint 3B.1b: idempotent text-post creation. Deploy manually.
begin;

-- The default keeps already-installed clients and existing rows valid. Current
-- clients still send their own UUID so retries retain one logical identity.
alter table public.posts
  add column client_request_id uuid not null default gen_random_uuid();

alter table public.posts
  add constraint posts_author_client_request_key unique (author_id, client_request_id);

grant insert (client_request_id) on public.posts to authenticated;

create function public.create_post_idempotent(p_content text, p_client_request_id uuid)
returns table (
  id uuid,
  author_id uuid,
  client_request_id uuid,
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
  existing public.posts%rowtype;
  replay boolean := false;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  insert into public.posts (content, client_request_id)
    values (p_content, p_client_request_id)
    on conflict on constraint posts_author_client_request_key do nothing
    returning * into existing;

  if existing.id is null then
    select p.* into existing
      from public.posts p
      where p.author_id = (select auth.uid())
        and p.client_request_id = p_client_request_id;

    if existing.id is null then
      raise exception using errcode = '40001', message = 'Unable to recover idempotent post creation';
    end if;
    if existing.content is distinct from p_content then
      raise exception using errcode = '22023', message = 'Request identifier belongs to different post content';
    end if;
    replay := true;
  end if;

  return query select existing.id, existing.author_id, existing.client_request_id,
    existing.content, existing.created_at, existing.updated_at, replay;
end;
$$;

revoke all on function public.create_post_idempotent(text, uuid) from public, anon;
grant execute on function public.create_post_idempotent(text, uuid) to authenticated;

comment on column public.posts.client_request_id is
  'Client-generated idempotency key; unique per author and retained across retries.';
comment on function public.create_post_idempotent(text, uuid) is
  'Creates one caller-owned post or safely returns the caller''s matching prior result.';

commit;
