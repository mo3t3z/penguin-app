-- Sprint 8: in-app notifications. Additive; review and deploy manually.
-- Rows are written only by triggers on comments, connections and post media, never
-- by clients. A student reads and marks read only their own.
begin;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null,
  actor_id uuid,
  type text not null,
  post_id uuid,
  comment_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint notifications_recipient_id_fkey foreign key (recipient_id)
    references public.profiles(id) on delete cascade,
  constraint notifications_actor_id_fkey foreign key (actor_id)
    references public.profiles(id) on delete cascade,
  constraint notifications_post_id_fkey foreign key (post_id)
    references public.posts(id) on delete cascade,
  constraint notifications_comment_id_fkey foreign key (comment_id)
    references public.post_comments(id) on delete cascade,
  constraint notifications_type_values check (type in (
    'post_comment',        -- someone commented on your post
    'connection_comment',  -- a connection commented on another connection's post
    'connection_request',  -- someone asked to connect
    'connection_accepted', -- your request was accepted
    'connection_photo'     -- a connection published a post with a photo
  )),
  constraint notifications_not_self check (actor_id is null or actor_id <> recipient_id)
);

create index notifications_recipient_recent_idx on public.notifications (recipient_id, created_at desc, id desc);
create index notifications_recipient_unread_idx on public.notifications (recipient_id) where read_at is null;
create index notifications_actor_idx on public.notifications (actor_id);
create index notifications_post_idx on public.notifications (post_id);
create index notifications_comment_idx on public.notifications (comment_id);
-- One photo notice per post and recipient, however many photos finish uploading.
create unique index notifications_one_photo_per_post on public.notifications (recipient_id, post_id)
  where type = 'connection_photo';

alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated;
grant select (id, recipient_id, actor_id, type, post_id, comment_id, created_at, read_at)
  on public.notifications to authenticated;
grant all on public.notifications to service_role;

create policy notifications_recipient_read on public.notifications
  for select to authenticated
  using (recipient_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- True when either student blocked the other: no notice crosses a block.
create function penguin_private.notifications_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

-- The accepted connections of one student.
create function penguin_private.notifications_connections_of(p_user uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select case when c.user_low = p_user then c.user_high else c.user_low end
  from public.connections c
  where c.status = 'accepted' and p_user in (c.user_low, c.user_high);
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- A new comment tells the post's author, and every student connected to both the
-- commenter and the post's author.
create function penguin_private.notify_post_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  post_author uuid;
begin
  select author_id into post_author from public.posts where id = new.post_id;
  if post_author is null then return new; end if;

  if post_author <> new.author_id and not penguin_private.notifications_blocked(post_author, new.author_id) then
    insert into public.notifications (recipient_id, actor_id, type, post_id, comment_id)
    values (post_author, new.author_id, 'post_comment', new.post_id, new.id);
  end if;

  if post_author <> new.author_id then
    insert into public.notifications (recipient_id, actor_id, type, post_id, comment_id)
    select friend, new.author_id, 'connection_comment', new.post_id, new.id
    from penguin_private.notifications_connections_of(new.author_id) as friend
    where friend <> post_author
      and friend in (select penguin_private.notifications_connections_of(post_author))
      and not penguin_private.notifications_blocked(friend, new.author_id)
      and not penguin_private.notifications_blocked(friend, post_author);
  end if;
  return new;
end;
$$;
create trigger penguin_notify_post_comment after insert on public.post_comments
  for each row execute function penguin_private.notify_post_comment();

-- A new or renewed request tells its receiver; an acceptance tells the requester.
create function penguin_private.notify_connection()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  receiver uuid := case when new.requester_id = new.user_low then new.user_high else new.user_low end;
begin
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from 'pending' or old.requester_id <> new.requester_id) then
    -- A renewed request replaces the receiver's earlier unread notice from the same student.
    delete from public.notifications
      where recipient_id = receiver and actor_id = new.requester_id and type = 'connection_request' and read_at is null;
    insert into public.notifications (recipient_id, actor_id, type) values (receiver, new.requester_id, 'connection_request');
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status = 'pending' then
    insert into public.notifications (recipient_id, actor_id, type) values (new.requester_id, receiver, 'connection_accepted');
  end if;
  return new;
end;
$$;
create trigger penguin_notify_connection after insert or update on public.connections
  for each row execute function penguin_private.notify_connection();

-- The first photo of a post to finish uploading tells the author's connections.
create function penguin_private.notify_connection_photo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  post_author uuid;
begin
  if new.status <> 'ready' or (tg_op = 'UPDATE' and old.status = 'ready') then return new; end if;
  select author_id into post_author from public.posts where id = new.post_id;
  if post_author is null then return new; end if;
  insert into public.notifications (recipient_id, actor_id, type, post_id)
  select friend, post_author, 'connection_photo', new.post_id
  from penguin_private.notifications_connections_of(post_author) as friend
  where not penguin_private.notifications_blocked(friend, post_author)
  on conflict (recipient_id, post_id) where type = 'connection_photo' do nothing;
  return new;
end;
$$;
create trigger penguin_notify_connection_photo after insert or update of status on public.post_media
  for each row execute function penguin_private.notify_connection_photo();

revoke all on function penguin_private.notifications_blocked(uuid, uuid),
  penguin_private.notifications_connections_of(uuid), penguin_private.notify_post_comment(),
  penguin_private.notify_connection(), penguin_private.notify_connection_photo()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Client functions
-- ---------------------------------------------------------------------------

-- Marks the caller's notifications read: all of them, or those up to a time.
create function public.mark_notifications_read(p_until timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  update public.notifications set read_at = now()
    where recipient_id = me and read_at is null and (p_until is null or created_at <= p_until);
end;
$$;

-- The caller's unread count, without blocked students.
create function public.get_unread_notification_count()
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  return (select count(*) from public.notifications n
    where n.recipient_id = me and n.read_at is null
      and (n.actor_id is null or not penguin_private.notifications_blocked(me, n.actor_id)));
end;
$$;

revoke all on function public.mark_notifications_read(timestamptz), public.get_unread_notification_count() from public, anon;
grant execute on function public.mark_notifications_read(timestamptz), public.get_unread_notification_count() to authenticated;

commit;
