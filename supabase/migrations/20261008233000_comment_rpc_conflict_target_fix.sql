-- Sprint 4B.2 hotfix: remove PL/pgSQL ambiguity from comment idempotency.
begin;

create or replace function public.create_post_comment_idempotent(
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
    on conflict on constraint post_comments_pkey do nothing
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

revoke all on function public.create_post_comment_idempotent(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_post_comment_idempotent(uuid, uuid, text)
  to authenticated;

comment on function public.create_post_comment_idempotent(uuid, uuid, text) is
  'Creates one caller-owned comment UUID or returns the caller matching retry result.';

commit;
