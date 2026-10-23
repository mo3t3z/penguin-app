-- Sprint 8A: profile details and connections. Additive; review and deploy manually.
-- Adds profile columns (cover, city, interests, verified badge) and a two-sided
-- connection request between students. No existing table, policy or function changes.
begin;

-- ---------------------------------------------------------------------------
-- Profile details
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column cover_url text,
  add column location text,
  add column interests text[] not null default '{}',
  -- Set by administrators only: no client grant covers this column.
  add column is_verified boolean not null default false,
  add constraint profiles_cover_url_format check (char_length(cover_url) <= 2048 and cover_url ~ '^https://[^[:space:]]+$'),
  add constraint profiles_location_length check (char_length(btrim(location)) between 1 and 80 and char_length(location) <= 80),
  add constraint profiles_interests_shape check (
    cardinality(interests) <= 8 and array_position(interests, null) is null
  );

-- Each interest is 1-32 characters; checked per item, which a CHECK cannot do.
create function public.penguin_profile_interests_valid(p_interests text[])
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(bool_and(char_length(btrim(item)) between 1 and 32 and char_length(item) <= 32), true)
  from unnest(p_interests) as item;
$$;
alter table public.profiles
  add constraint profiles_interests_items check (public.penguin_profile_interests_valid(interests));

grant update (cover_url, location, interests) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Connections
-- ---------------------------------------------------------------------------

-- One row per pair of students, in canonical order. requester_id is whoever sent
-- the current request. A declined request can be sent again, by either student.
create table public.connections (
  user_low uuid not null,
  user_high uuid not null,
  requester_id uuid not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (user_low, user_high),
  constraint connections_user_low_fkey foreign key (user_low)
    references public.profiles(id) on delete cascade,
  constraint connections_user_high_fkey foreign key (user_high)
    references public.profiles(id) on delete cascade,
  constraint connections_canonical_pair check (user_low < user_high),
  constraint connections_requester_in_pair check (requester_id in (user_low, user_high)),
  constraint connections_status_values check (status in ('pending', 'accepted', 'declined'))
);

create index connections_user_high_idx on public.connections (user_high, user_low);
create index connections_status_idx on public.connections (status, updated_at desc);

alter table public.connections enable row level security;
revoke all on public.connections from public, anon, authenticated;
-- Clients read their own rows; every write goes through the functions below.
grant select (user_low, user_high, requester_id, status, created_at, updated_at, responded_at)
  on public.connections to authenticated;
grant all on public.connections to service_role;

create policy connections_participant_read on public.connections
  for select to authenticated
  using ((select auth.uid()) in (user_low, user_high));

-- Sends a request, or accepts one the other student already sent. Returns the
-- pair's status afterwards: 'pending' or 'accepted'.
create function public.request_connection(p_target uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  low uuid; high uuid;
  current_row public.connections;
begin
  if me is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  if p_target is null or p_target = me then raise exception using errcode = '22023', message = 'Choose another student'; end if;
  if not exists (select 1 from public.profiles where id = p_target) then
    raise exception using errcode = 'P0002', message = 'Student not found';
  end if;
  if exists (select 1 from public.user_blocks b
    where (b.blocker_id = me and b.blocked_id = p_target) or (b.blocker_id = p_target and b.blocked_id = me)) then
    raise exception using errcode = '42501', message = 'You can''t connect with this student';
  end if;
  low := least(me, p_target); high := greatest(me, p_target);
  select * into current_row from public.connections where user_low = low and user_high = high for update;
  if not found then
    insert into public.connections (user_low, user_high, requester_id) values (low, high, me);
    return 'pending';
  end if;
  if current_row.status = 'accepted' then return 'accepted'; end if;
  if current_row.status = 'pending' and current_row.requester_id = me then return 'pending'; end if;
  if current_row.status = 'pending' then
    update public.connections set status = 'accepted', responded_at = now(), updated_at = now()
      where user_low = low and user_high = high;
    return 'accepted';
  end if;
  -- Declined: a new request starts over, from whoever sends it.
  update public.connections set status = 'pending', requester_id = me, responded_at = null, updated_at = now()
    where user_low = low and user_high = high;
  return 'pending';
end;
$$;

-- The receiver accepts or declines a pending request.
create function public.respond_connection(p_requester uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  next_status text := case when p_accept then 'accepted' else 'declined' end;
begin
  if me is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  if p_requester is null or p_accept is null then raise exception using errcode = '22023', message = 'Invalid response'; end if;
  update public.connections set status = next_status, responded_at = now(), updated_at = now()
    where user_low = least(me, p_requester) and user_high = greatest(me, p_requester)
      and requester_id = p_requester and status = 'pending';
  if not found then raise exception using errcode = 'P0002', message = 'Request not found'; end if;
  return next_status;
end;
$$;

-- Cancels your own pending request, or ends an accepted connection.
create function public.remove_connection(p_other uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  delete from public.connections
    where user_low = least(me, p_other) and user_high = greatest(me, p_other)
      and (status = 'accepted' or (status = 'pending' and requester_id = me));
end;
$$;

-- Public counts for a profile header: posts and accepted connections.
create function public.get_profile_stats(p_profile uuid)
returns table (post_count bigint, connection_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  return query select
    (select count(*) from public.posts p where p.author_id = p_profile),
    (select count(*) from public.connections c
      where c.status = 'accepted' and p_profile in (c.user_low, c.user_high));
end;
$$;

revoke all on function public.request_connection(uuid), public.respond_connection(uuid, boolean),
  public.remove_connection(uuid), public.get_profile_stats(uuid) from public, anon;
grant execute on function public.request_connection(uuid), public.respond_connection(uuid, boolean),
  public.remove_connection(uuid), public.get_profile_stats(uuid) to authenticated;

commit;
