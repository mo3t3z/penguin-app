-- Sprint 3A: additive, file-only migration. Review and deploy manually.
begin;

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posts_content_length check (char_length(content) between 1 and 5000 and content ~ '[^[:space:]]')
);
create index posts_feed_cursor_idx on public.posts (created_at desc, id desc);
create index posts_author_cursor_idx on public.posts (author_id, created_at desc, id desc);

create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  storage_provider text not null check (storage_provider ~ '^[a-z][a-z0-9_]{0,31}$'),
  storage_key text not null check (char_length(storage_key) between 1 and 1024),
  storage_version text,
  upload_key text not null check (char_length(upload_key) between 1 and 1024),
  upload_expires_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'finalizing', 'ready')),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 8388608),
  width integer check (width between 1 and 8192),
  height integer check (height between 1 and 8192),
  position smallint not null check (position between 0 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint post_media_four_slots unique (post_id, position),
  constraint post_media_storage_unique unique (storage_provider, storage_key),
  constraint post_media_upload_unique unique (storage_provider, upload_key),
  constraint post_media_separate_keys check (storage_key <> upload_key),
  constraint post_media_ready_metadata check (
    status <> 'ready' or (width is not null and height is not null and storage_version is not null)
  ),
  constraint post_media_pixel_budget check (width::bigint * height::bigint <= 32000000)
);
-- The unique (post_id, position) index also covers the FK/RLS lookup.
create index post_media_expired_uploads_idx on public.post_media (upload_expires_at)
  where status <> 'ready';

alter table public.posts enable row level security;
alter table public.post_media enable row level security;
revoke all on public.posts, public.post_media from public, anon, authenticated;
grant select, delete on public.posts to authenticated;
grant insert (content), update (content) on public.posts to authenticated;
-- No storage keys, upload state mutation, or arbitrary media insertion from mobile.
grant select (id, post_id, storage_provider, mime_type, size_bytes, width, height, position, status, created_at)
  on public.post_media to authenticated;
grant update (position), delete on public.post_media to authenticated;
grant all on public.posts, public.post_media to service_role;

-- MVP visibility: all signed-in users, matching current profile visibility.
create policy posts_authenticated_read on public.posts for select to authenticated using (true);
create policy posts_owner_insert on public.posts for insert to authenticated
  with check ((select auth.uid()) = author_id and exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.onboarding_completed
  ));
create policy posts_owner_update on public.posts for update to authenticated
  using ((select auth.uid()) = author_id) with check ((select auth.uid()) = author_id);
create policy posts_owner_delete on public.posts for delete to authenticated
  using ((select auth.uid()) = author_id);
create policy post_media_visible_read on public.post_media for select to authenticated
  using (status = 'ready' and exists (select 1 from public.posts p where p.id = post_id));
create policy post_media_owner_update on public.post_media for update to authenticated
  using (status = 'ready' and exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())))
  with check (status = 'ready' and exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())));
create policy post_media_owner_delete on public.post_media for delete to authenticated
  using (status = 'ready' and exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid())));

create function public.penguin_touch_post_record()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.penguin_touch_post_record() from public, anon, authenticated;
create trigger posts_before_update before update on public.posts
  for each row execute function public.penguin_touch_post_record();
create trigger post_media_before_update before update on public.post_media
  for each row execute function public.penguin_touch_post_record();

-- Durable deletion intent; no database HTTP calls, credentials, or scheduled jobs.
create schema penguin_private;
revoke all on schema penguin_private from public, anon, authenticated;
grant usage on schema penguin_private to service_role;
create table penguin_private.media_cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  storage_provider text not null,
  storage_key text not null,
  not_before timestamptz not null,
  created_at timestamptz not null default now(),
  unique (storage_provider, storage_key)
);
alter table penguin_private.media_cleanup_queue enable row level security;
revoke all on penguin_private.media_cleanup_queue from public, anon, authenticated;
grant all on penguin_private.media_cleanup_queue to service_role;
create index media_cleanup_due_idx on penguin_private.media_cleanup_queue (not_before, id);

-- Trigger-only definer: RLS has already authorized the row deletion/update.
-- It also covers administrative deletes and FK cascades after account deletion,
-- for which auth.uid() need not exist. No direct caller can execute this function.
create function penguin_private.enqueue_media_cleanup()
returns trigger language plpgsql security definer set search_path = '' as $$
declare due timestamptz;
begin
  if tg_relid <> 'public.post_media'::regclass or tg_op not in ('DELETE', 'UPDATE') then
    raise exception 'Trigger context required';
  end if;
  due := greatest(old.upload_expires_at, now()) + interval '1 hour';
  insert into penguin_private.media_cleanup_queue (storage_provider, storage_key, not_before)
    values (old.storage_provider, old.upload_key, due)
    on conflict (storage_provider, storage_key) do update
      set not_before = greatest(media_cleanup_queue.not_before, excluded.not_before);
  if tg_op = 'DELETE' then
    insert into penguin_private.media_cleanup_queue (storage_provider, storage_key, not_before)
      values (old.storage_provider, old.storage_key, due)
      on conflict (storage_provider, storage_key) do update
        set not_before = greatest(media_cleanup_queue.not_before, excluded.not_before);
    return old;
  end if;
  return new;
end;
$$;
revoke all on function penguin_private.enqueue_media_cleanup() from public, anon, authenticated, service_role;
create trigger post_media_deleted after delete on public.post_media
  for each row execute function penguin_private.enqueue_media_cleanup();
create trigger post_media_finalized after update on public.post_media
  for each row when (old.status <> 'ready' and new.status = 'ready')
  execute function penguin_private.enqueue_media_cleanup();

comment on table public.post_media is 'Four reserved slots per post; only server-validated ready media is readable by mobile.';
comment on table penguin_private.media_cleanup_queue is 'Outbox only. A trusted manual worker must delete all B2 versions of each exact key after not_before.';
commit;
