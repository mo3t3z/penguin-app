-- Sprint 7A: groups foundation.
--
-- NOT APPLIED to the hosted project. Apply only after approval.
--
-- Additive: creates new objects only. No existing table, policy, trigger, function
-- or grant is changed, and no existing row is touched.
--
-- What it adds:
--   1. Public student groups and their memberships.
--   2. Three functions that are the only way to write: create a group (with its
--      owner membership, in one transaction), join one, leave one.
--   3. Read access for signed-in students, shaped so that it cannot be used to
--      look a student up:
--        - groups are readable directly, without their member count;
--        - a student reads only their OWN membership rows directly;
--        - the members of ONE group are read through list_group_members, and
--          member counts through get_group_viewer_summaries. Both leave out
--          anyone the viewer has blocked or been blocked by, so the list and the
--          count a viewer sees always agree.
--      There is no request that returns the groups of another student.
--
-- Not included, on purpose: private or invitation-only groups, editing or deleting
-- a group, transferring ownership, removing other members, group posts, group chat.
begin;

-- Helpers live in a schema of their own that the API does not expose and that no
-- client role may use: they are reachable only from the definer functions below.
-- A plain "create schema" is used on purpose: if the name were ever taken, the
-- migration must fail, not reuse it.
create schema penguin_groups_private;
revoke all on schema penguin_groups_private from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- name is stored with outer whitespace removed and inner runs collapsed to one
-- space, and is unique ignoring letter case (groups_name_unique_idx). Control
-- characters and invisible formatting characters (zero-width space, direction
-- overrides and the like) are refused, so two names that look the same cannot
-- differ by a character nobody can see. Zero-width joiners stay allowed: some
-- scripts and emoji need them.
--
-- status: 'active' groups can be joined. A group becomes 'archived' when its owner
-- membership disappears, which in this sprint happens only when the owner deletes
-- their account. An archived group keeps its members and stays readable, accepts
-- no new member, and never becomes active again here: resolving ownership is a
-- later workflow.
--
-- creator_id records who made the group and is not readable by clients; the owner
-- is the member with role 'owner'.
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  creator_id uuid,
  client_request_id uuid not null,
  visibility text not null default 'public',
  status text not null default 'active',
  member_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint groups_creator_id_fkey foreign key (creator_id)
    references public.profiles(id) on delete set null,
  constraint groups_name_format check (
    char_length(name) between 3 and 60
    and name = btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g'))
    and name !~ '[[:cntrl:]]'
    and name !~ '[\u200B\u200E\u200F\u202A-\u202E\u2060-\u2069\uFEFF]'
  ),
  constraint groups_description_format check (
    description is null
    or (char_length(description) between 1 and 500 and description = btrim(description))
  ),
  constraint groups_visibility_values check (visibility = 'public'),
  constraint groups_status_values check (status in ('active', 'archived')),
  constraint groups_member_count_not_negative check (member_count >= 0),
  constraint groups_creator_request_unique unique (creator_id, client_request_id)
);

create unique index groups_name_unique_idx on public.groups (lower(name));
create index groups_discovery_idx on public.groups (created_at desc, id desc) where status = 'active';
create index groups_creator_recent_idx on public.groups (creator_id, created_at);
-- Name search uses ILIKE without a substring index, as student search does; add
-- one when the number of groups justifies it.

create table public.group_members (
  group_id uuid not null,
  user_id uuid not null,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id),
  constraint group_members_group_id_fkey foreign key (group_id)
    references public.groups(id) on delete cascade,
  constraint group_members_user_id_fkey foreign key (user_id)
    references public.profiles(id) on delete cascade,
  constraint group_members_role_values check (role in ('owner', 'member'))
);

-- At most one owner per group.
create unique index group_members_one_owner_idx on public.group_members (group_id) where role = 'owner';
create index group_members_user_recent_idx on public.group_members (user_id, joined_at desc, group_id desc);
create index group_members_group_joined_idx on public.group_members (group_id, joined_at, user_id);

-- ---------------------------------------------------------------------------
-- Member count and ownership lifecycle
-- ---------------------------------------------------------------------------

-- Keeps member_count exact for every way a membership can appear or disappear,
-- including the cascade from a deleted account, and archives a group whose owner
-- membership is removed. The row lock taken by the update orders concurrent
-- changes to one group.
create function penguin_groups_private.membership_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.groups g set member_count = g.member_count + 1 where g.id = new.group_id;
    return null;
  end if;
  update public.groups g
    set member_count = greatest(g.member_count - 1, 0),
        status = case when old.role = 'owner' then 'archived' else g.status end,
        updated_at = case when old.role = 'owner' then pg_catalog.clock_timestamp() else g.updated_at end
    where g.id = old.group_id;
  return null;
end;
$$;
-- Trigger-only definer: unavailable as a client RPC.
revoke all on function penguin_groups_private.membership_changed() from public, anon, authenticated, service_role;
create trigger penguin_group_membership_changed
  after insert or delete on public.group_members
  for each row execute function penguin_groups_private.membership_changed();

-- ---------------------------------------------------------------------------
-- Privileges and row-level security
-- ---------------------------------------------------------------------------

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

revoke all on public.groups, public.group_members from public, anon, authenticated;

-- Clients read; every write goes through the functions below. No INSERT, UPDATE
-- or DELETE is granted, so identity, roles, limits, counts and status cannot be
-- set by calling the Data API directly.
--
-- Not readable directly: creator_id and client_request_id, and member_count. The
-- stored count includes members a viewer may not see; a viewer gets their own
-- count from get_group_viewer_summaries instead.
grant select (id, name, description, visibility, status, created_at, updated_at)
  on public.groups to authenticated;
grant select (group_id, user_id, role, joined_at)
  on public.group_members to authenticated;
grant all on public.groups, public.group_members to service_role;

-- Every group in this sprint is public.
create policy groups_authenticated_read on public.groups
  for select to authenticated
  using (true);

-- A student reads only their own memberships here. Filtering this table by another
-- student's id therefore returns nothing: there is no direct way to list the groups
-- someone else is in. Other members are read one group at a time through
-- list_group_members. Neither policy reads its own table, so there is no recursion.
create policy group_members_own_read on public.group_members
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Write path
-- ---------------------------------------------------------------------------
-- Error codes returned to the app:
--   42501  not signed in, or the profile is not complete
--   22023  invalid argument, or a request identifier reused for a different group
--   23514  name outside 3-60 characters or containing an invisible character, or
--          description over 500
--   PG001  a group with this name already exists
--   PG002  daily group-creation limit reached
--   PG003  joined-groups limit reached
--   PG004  the group does not exist
--   PG005  the group is archived and accepts no new member
--   PG006  the owner cannot leave their group
--
-- Ordering. Every function takes a transaction-level advisory lock on the caller
-- first, so one student's requests run one at a time and the limits cannot be
-- bypassed by calling in parallel. Joining also locks the group row, so a join
-- and the archiving of that group cannot interleave.

-- Limits are provisional. To change them, replace the two functions below with
-- new numbers in a later migration; nothing else refers to the values.
create function penguin_groups_private.creation_limit_per_day()
returns integer language sql immutable set search_path = '' as $$ select 3 $$;
create function penguin_groups_private.joined_groups_limit()
returns integer language sql immutable set search_path = '' as $$ select 100 $$;
create function penguin_groups_private.lock_user(p_user_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('penguin-groups-user:' || p_user_id::text, 0));
$$;
-- Internal helpers: only reachable from the definer functions below.
revoke all on function penguin_groups_private.creation_limit_per_day() from public, anon, authenticated, service_role;
revoke all on function penguin_groups_private.joined_groups_limit() from public, anon, authenticated, service_role;
revoke all on function penguin_groups_private.lock_user(uuid) from public, anon, authenticated, service_role;

-- Creates a group and its owner membership together. p_request_id is generated by
-- the client and makes the call safe to repeat: the same identifier with the same
-- name and description returns the stored group; with anything different it is
-- rejected. The creator and the role are never taken from the caller's input.
create function public.create_group_idempotent(
  p_request_id uuid,
  p_name text,
  p_description text
)
returns table (
  id uuid,
  name text,
  description text,
  status text,
  created_at timestamptz,
  idempotent_replay boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  clean_name text;
  clean_description text;
  stored public.groups%rowtype;
  violated text;
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_request_id is null or p_name is null then
    raise exception using errcode = '22023', message = 'Invalid group';
  end if;
  if not exists (select 1 from public.profiles p where p.id = caller and p.onboarding_completed) then
    raise exception using errcode = '42501', message = 'Complete your profile first';
  end if;

  clean_name := pg_catalog.btrim(pg_catalog.regexp_replace(p_name, '[[:space:]]+', ' ', 'g'));
  clean_description := nullif(pg_catalog.btrim(coalesce(p_description, '')), '');
  if pg_catalog.char_length(clean_name) not between 3 and 60 then
    raise exception using errcode = '23514', message = 'Group names need 3 to 60 characters';
  end if;
  if clean_name ~ '[[:cntrl:]]' or clean_name ~ '[\u200B\u200E\u200F\u202A-\u202E\u2060-\u2069\uFEFF]' then
    raise exception using errcode = '23514', message = 'Group names cannot contain invisible characters';
  end if;
  if pg_catalog.char_length(clean_description) > 500 then
    raise exception using errcode = '23514', message = 'Descriptions can have up to 500 characters';
  end if;

  perform penguin_groups_private.lock_user(caller);

  -- A repeated request is answered before any name or limit check, so a retry
  -- after a lost response never fails and never counts twice.
  select g.* into stored from public.groups g
    where g.creator_id = caller and g.client_request_id = p_request_id;
  if stored.id is not null then
    if stored.name is distinct from clean_name or stored.description is distinct from clean_description then
      raise exception using errcode = '22023', message = 'Request identifier belongs to a different group';
    end if;
    return query select stored.id, stored.name, stored.description, stored.status,
      stored.created_at, true;
    return;
  end if;

  if exists (select 1 from public.groups g where pg_catalog.lower(g.name) = pg_catalog.lower(clean_name)) then
    raise exception using errcode = 'PG001', message = 'Group name taken';
  end if;
  if (select count(*) from public.groups g
        where g.creator_id = caller and g.created_at > pg_catalog.clock_timestamp() - interval '1 day')
      >= penguin_groups_private.creation_limit_per_day() then
    raise exception using errcode = 'PG002', message = 'Group creation limit reached';
  end if;
  if (select count(*) from public.group_members m where m.user_id = caller)
      >= penguin_groups_private.joined_groups_limit() then
    raise exception using errcode = 'PG003', message = 'Joined groups limit reached';
  end if;

  begin
    insert into public.groups as g (name, description, creator_id, client_request_id, created_at, updated_at)
      values (clean_name, clean_description, caller, p_request_id, pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp())
      returning g.* into stored;
  exception when unique_violation then
    -- Another student took the name between the check above and this insert.
    get stacked diagnostics violated = constraint_name;
    if violated = 'groups_name_unique_idx' then
      raise exception using errcode = 'PG001', message = 'Group name taken';
    end if;
    raise;
  end;

  insert into public.group_members (group_id, user_id, role, joined_at)
    values (stored.id, caller, 'owner', stored.created_at);

  return query select stored.id, stored.name, stored.description, stored.status,
    stored.created_at, false;
end;
$$;

-- Adds the caller to an active group as a plain member. Repeating it is harmless:
-- an existing membership is returned unchanged, whatever its role.
create function public.join_group(p_group_id uuid)
returns table (
  group_id uuid,
  role text,
  joined_at timestamptz,
  already_member boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target public.groups%rowtype;
  membership public.group_members%rowtype;
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_group_id is null then
    raise exception using errcode = '22023', message = 'Choose a group';
  end if;
  if not exists (select 1 from public.profiles p where p.id = caller and p.onboarding_completed) then
    raise exception using errcode = '42501', message = 'Complete your profile first';
  end if;

  perform penguin_groups_private.lock_user(caller);

  select g.* into target from public.groups g where g.id = p_group_id for update;
  if target.id is null then
    raise exception using errcode = 'PG004', message = 'Group not found';
  end if;

  select m.* into membership from public.group_members m
    where m.group_id = p_group_id and m.user_id = caller;
  if membership.group_id is not null then
    return query select membership.group_id, membership.role, membership.joined_at, true;
    return;
  end if;

  if target.status <> 'active' then
    raise exception using errcode = 'PG005', message = 'Group is archived';
  end if;
  if (select count(*) from public.group_members m where m.user_id = caller)
      >= penguin_groups_private.joined_groups_limit() then
    raise exception using errcode = 'PG003', message = 'Joined groups limit reached';
  end if;

  insert into public.group_members as m (group_id, user_id, role, joined_at)
    values (p_group_id, caller, 'member', pg_catalog.clock_timestamp())
    returning m.* into membership;

  return query select membership.group_id, membership.role, membership.joined_at, false;
end;
$$;

-- Removes the caller's own membership. Returns false when there was none, so
-- repeating it is harmless. The owner is refused: ownership transfer and group
-- deletion do not exist yet.
create function public.leave_group(p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  member_role text;
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_group_id is null then
    raise exception using errcode = '22023', message = 'Choose a group';
  end if;

  perform penguin_groups_private.lock_user(caller);

  select m.role into member_role from public.group_members m
    where m.group_id = p_group_id and m.user_id = caller;
  if member_role is null then
    return false;
  end if;
  if member_role = 'owner' then
    raise exception using errcode = 'PG006', message = 'The owner cannot leave the group';
  end if;

  delete from public.group_members m where m.group_id = p_group_id and m.user_id = caller;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Read path for members and counts
-- ---------------------------------------------------------------------------
-- These two functions are the only way to read anything about OTHER members.
-- Each answers about groups the caller names, never about a student the caller
-- names: neither takes a user identifier.

-- The students hidden from this viewer: everyone with a block between them and
-- the viewer, in either direction. One definition, used for the list and the
-- count, so the two always agree.
create function penguin_groups_private.hidden_from(p_viewer_id uuid)
returns setof uuid language sql stable security invoker set search_path = '' as $$
  select b.blocked_id from public.user_blocks b where b.blocker_id = p_viewer_id
  union
  select b.blocker_id from public.user_blocks b where b.blocked_id = p_viewer_id;
$$;
revoke all on function penguin_groups_private.hidden_from(uuid) from public, anon, authenticated, service_role;

-- For up to 50 groups: the number of members this viewer can see, and the viewer's
-- own role (null when not a member). The count is the stored total minus the
-- members hidden from the viewer, so it equals the length of the list the viewer
-- gets from list_group_members. The stored total itself is not readable.
create function public.get_group_viewer_summaries(p_group_ids uuid[])
returns table (
  group_id uuid,
  member_count integer,
  my_role text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_group_ids is null or pg_catalog.cardinality(p_group_ids) > 50 then
    raise exception using errcode = '22023', message = 'Choose up to 50 groups';
  end if;
  return query
    select g.id,
      (g.member_count - (
        select count(*) from public.group_members m
        where m.group_id = g.id
          and m.user_id in (select hidden from penguin_groups_private.hidden_from(caller) hidden)
      ))::integer,
      (select m.role from public.group_members m where m.group_id = g.id and m.user_id = caller)
    from public.groups g
    where g.id = any (p_group_ids);
end;
$$;

-- One page of the members of ONE group, in the order they joined (the owner
-- first), with the presentation fields student search already shows. Members
-- hidden from the viewer are left out. The page continues after the given
-- (joined_at, user_id); p_limit is at most 51 so a caller can ask for one more
-- than it shows to learn whether another page exists.
create function public.list_group_members(
  p_group_id uuid,
  p_after_joined_at timestamptz default null,
  p_after_user_id uuid default null,
  p_limit integer default 31
)
returns table (
  user_id uuid,
  role text,
  joined_at timestamptz,
  username text,
  display_name text,
  avatar_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_group_id is null or p_limit is null or p_limit not between 1 and 51
     or (p_after_joined_at is null) <> (p_after_user_id is null) then
    raise exception using errcode = '22023', message = 'Invalid member page';
  end if;
  if not exists (select 1 from public.profiles p where p.id = caller and p.onboarding_completed) then
    raise exception using errcode = '42501', message = 'Complete your profile first';
  end if;
  return query
    select m.user_id, m.role, m.joined_at, p.username, p.display_name, p.avatar_url
    from public.group_members m
    join public.profiles p on p.id = m.user_id
    where m.group_id = p_group_id
      and (p_after_joined_at is null or (m.joined_at, m.user_id) > (p_after_joined_at, p_after_user_id))
      and m.user_id not in (select hidden from penguin_groups_private.hidden_from(caller) hidden)
    order by m.joined_at, m.user_id
    limit p_limit;
end;
$$;

revoke all on function public.get_group_viewer_summaries(uuid[]) from public, anon, authenticated;
revoke all on function public.list_group_members(uuid, timestamptz, uuid, integer) from public, anon, authenticated;
grant execute on function public.get_group_viewer_summaries(uuid[]) to authenticated;
grant execute on function public.list_group_members(uuid, timestamptz, uuid, integer) to authenticated;

revoke all on function public.create_group_idempotent(uuid, text, text) from public, anon, authenticated;
revoke all on function public.join_group(uuid) from public, anon, authenticated;
revoke all on function public.leave_group(uuid) from public, anon, authenticated;
grant execute on function public.create_group_idempotent(uuid, text, text) to authenticated;
grant execute on function public.join_group(uuid) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;

comment on table public.groups is
  'Public student groups. Written only by create_group_idempotent; archived when the owner membership is removed.';
comment on table public.group_members is
  'Group memberships. Written only by create_group_idempotent, join_group and leave_group. Clients read only their own rows; other members are read through list_group_members.';
comment on function public.create_group_idempotent(uuid, text, text) is
  'Definer write path: validates the caller, name and limits, then stores the group and its owner membership together.';

commit;
