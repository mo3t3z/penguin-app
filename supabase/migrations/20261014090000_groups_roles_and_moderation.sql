-- Sprint 7B: group roles and moderation.
--
-- NOT APPLIED to the hosted project. Apply only after approval.
--
-- Forward-only. The two deployed group migrations are not edited; this one changes
-- the objects they created where it has to, and says so below.
--
-- What it adds:
--   1. A third role, 'admin', between owner and member.
--   2. Persistent group bans, and a private log of administrative actions. Clients
--      can neither read nor write either table; both are reached through functions.
--   3. Seven administrative functions: promote, demote, remove, ban, unban,
--      transfer ownership, edit the name and description.
--   4. Two staff-only read functions: the ban list and the administration history.
--
-- What it changes in existing objects:
--   - group_members.role may now be 'admin' (the check constraint is replaced).
--   - join_group refuses a banned student (same signature and result).
--   - leave_group locks the group row before the membership row (same signature
--     and behaviour). Every function that changes a group's memberships now takes
--     its locks in one order: the caller, then the group, then the rows.
--   - list_group_members and get_group_viewer_summaries gain one column each,
--     group_role and my_group_role, holding the full role.
--
-- Compatibility with app code released before roles existed. That code knows only
-- 'owner' and 'member' and treats anything else as "not a member". So the existing
-- columns role and my_role keep reporting an admin as 'member', and the full role
-- is in the new columns only. An admin is therefore always seen as a member by old
-- code, whatever order app and database are updated in.
--
-- Privacy rule kept from the earlier migrations: a student who is unavailable to
-- the caller (a block in either direction) is never identified. In every function
-- here, an unavailable target is answered exactly like a student who is not in the
-- group, and unavailable students are left out of the ban list and the history.
--
-- Error codes added (see the foundation migration for PG001-PG006):
--   PG007  the caller is banned from this group and cannot join
--   PG008  the target is not a member of this group, or is unavailable to the caller
--   PG009  the action is not allowed on this target (role hierarchy, or yourself)
--   PG010  removal limit reached (members removed or banned in the last hour)
--   PG011  the group already has the maximum number of admins
--   PG012  ownership can only be transferred to an admin
--   42501  also: the caller is not staff of this group, or not its owner
begin;

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

alter table public.group_members drop constraint group_members_role_values;
alter table public.group_members
  add constraint group_members_role_values check (role in ('owner', 'admin', 'member'));

-- The one-owner index from the foundation migration is unchanged.
create index group_members_staff_idx on public.group_members (group_id) where role in ('owner', 'admin');

-- ---------------------------------------------------------------------------
-- Bans and the administration log
-- ---------------------------------------------------------------------------

-- A banned student cannot join the group. banned_role is what they were when they
-- were banned; it decides who may lift the ban. A ban does not outlive the group or
-- the banned account. Lifting a ban does not restore the membership.
create table public.group_bans (
  group_id uuid not null,
  user_id uuid not null,
  banned_by uuid,
  banned_role text not null,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id),
  constraint group_bans_group_id_fkey foreign key (group_id)
    references public.groups(id) on delete cascade,
  constraint group_bans_user_id_fkey foreign key (user_id)
    references public.profiles(id) on delete cascade,
  constraint group_bans_banned_by_fkey foreign key (banned_by)
    references public.profiles(id) on delete set null,
  constraint group_bans_banned_role_values check (banned_role in ('admin', 'member'))
);

create index group_bans_recent_idx on public.group_bans (group_id, created_at desc, user_id desc);
create index group_bans_user_idx on public.group_bans (user_id);
create index group_bans_banned_by_idx on public.group_bans (banned_by);

-- One row per administrative action. Never updated. actor_id and target_id become
-- NULL when that account is deleted; the row stays. details holds only what the
-- action needs: the target's role at the time, or the old and new group name.
create table public.group_admin_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  actor_id uuid,
  target_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint group_admin_events_group_id_fkey foreign key (group_id)
    references public.groups(id) on delete cascade,
  constraint group_admin_events_actor_id_fkey foreign key (actor_id)
    references public.profiles(id) on delete set null,
  constraint group_admin_events_target_id_fkey foreign key (target_id)
    references public.profiles(id) on delete set null,
  constraint group_admin_events_action_values check (action in (
    'member_promoted', 'admin_demoted', 'member_removed', 'member_banned',
    'member_unbanned', 'ownership_transferred', 'details_updated'
  ))
);

create index group_admin_events_group_recent_idx on public.group_admin_events (group_id, created_at desc, id desc);
-- Serves the removal limit, which counts one actor's recent removals and bans.
create index group_admin_events_actor_recent_idx on public.group_admin_events (actor_id, created_at);
create index group_admin_events_target_idx on public.group_admin_events (target_id);

alter table public.group_bans enable row level security;
alter table public.group_admin_events enable row level security;

-- No policy and no privilege for any client role: these tables cannot be read or
-- written through the Data API at all.
revoke all on public.group_bans, public.group_admin_events from public, anon, authenticated;
grant all on public.group_bans, public.group_admin_events to service_role;

-- ---------------------------------------------------------------------------
-- Limits and internal helpers
-- ---------------------------------------------------------------------------

-- Limits are provisional. To change one, replace its function in a later migration.
create function penguin_groups_private.admin_limit()
returns integer language sql immutable set search_path = '' as $$ select 10 $$;
create function penguin_groups_private.removal_limit_per_hour()
returns integer language sql immutable set search_path = '' as $$ select 20 $$;

-- Members this actor has removed or banned in the last 60 minutes, in any group.
-- A sliding window read from the log, which clients cannot write or delete, and
-- always called while the actor's own lock is held, so parallel requests are
-- counted one after another.
create function penguin_groups_private.recent_removals(p_actor_id uuid)
returns bigint language sql stable security invoker set search_path = '' as $$
  select count(*) from public.group_admin_events e
  where e.actor_id = p_actor_id
    and e.action in ('member_removed', 'member_banned')
    and e.created_at > pg_catalog.clock_timestamp() - interval '1 hour';
$$;

-- The target's role in the group as this viewer may know it: NULL both when the
-- target is not a member and when the target is unavailable to the viewer. Callers
-- cannot tell the two apart.
create function penguin_groups_private.visible_role(p_group_id uuid, p_viewer_id uuid, p_target_id uuid)
returns text language sql stable security invoker set search_path = '' as $$
  select m.role from public.group_members m
  where m.group_id = p_group_id and m.user_id = p_target_id
    and m.user_id not in (select hidden from penguin_groups_private.hidden_from(p_viewer_id) hidden);
$$;

-- The start of every administrative action. Takes the locks in the one agreed
-- order (the caller, then the group row), then checks that the group exists, that
-- the caller is its staff (or its owner, when p_owner_only), and that it is not
-- archived. Returns the caller's role. Everything decided afterwards is decided
-- while the group row is locked, so actions on one group run one at a time.
create function penguin_groups_private.begin_staff_action(p_group_id uuid, p_caller_id uuid, p_owner_only boolean)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  target public.groups%rowtype;
  caller_role text;
begin
  perform penguin_groups_private.lock_user(p_caller_id);
  select g.* into target from public.groups g where g.id = p_group_id for update;
  if target.id is null then
    raise exception using errcode = 'PG004', message = 'Group not found';
  end if;
  select m.role into caller_role from public.group_members m
    where m.group_id = p_group_id and m.user_id = p_caller_id;
  if caller_role is null or caller_role = 'member' or (p_owner_only and caller_role <> 'owner') then
    raise exception using errcode = '42501', message = 'Not permitted';
  end if;
  if target.status <> 'active' then
    raise exception using errcode = 'PG005', message = 'Group is archived';
  end if;
  return caller_role;
end;
$$;

create function penguin_groups_private.record_event(
  p_group_id uuid, p_actor_id uuid, p_target_id uuid, p_action text, p_details jsonb
)
returns void language sql security invoker set search_path = '' as $$
  insert into public.group_admin_events (group_id, actor_id, target_id, action, details, created_at)
    values (p_group_id, p_actor_id, p_target_id, p_action, coalesce(p_details, '{}'::jsonb), pg_catalog.clock_timestamp());
$$;

-- Internal helpers: only reachable from the definer functions below.
revoke all on function penguin_groups_private.admin_limit() from public, anon, authenticated, service_role;
revoke all on function penguin_groups_private.removal_limit_per_hour() from public, anon, authenticated, service_role;
revoke all on function penguin_groups_private.recent_removals(uuid) from public, anon, authenticated, service_role;
revoke all on function penguin_groups_private.visible_role(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function penguin_groups_private.begin_staff_action(uuid, uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function penguin_groups_private.record_event(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Roles: promote, demote, transfer ownership
-- ---------------------------------------------------------------------------
-- None of these takes a role. The role a function gives is fixed in its body, so
-- no request can name 'owner' or 'admin'.

-- Owner only: a member becomes an admin. Repeating it is harmless.
create function public.promote_group_member(p_group_id uuid, p_member_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target_role text;
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_group_id is null or p_member_id is null then
    raise exception using errcode = '22023', message = 'Choose a group and a member';
  end if;
  perform penguin_groups_private.begin_staff_action(p_group_id, caller, true);

  target_role := penguin_groups_private.visible_role(p_group_id, caller, p_member_id);
  if target_role is null then
    raise exception using errcode = 'PG008', message = 'Member not found';
  end if;
  if target_role = 'owner' then
    raise exception using errcode = 'PG009', message = 'Not allowed for this member';
  end if;
  if target_role = 'admin' then
    return 'admin';
  end if;
  if (select count(*) from public.group_members m where m.group_id = p_group_id and m.role = 'admin')
      >= penguin_groups_private.admin_limit() then
    raise exception using errcode = 'PG011', message = 'Admin limit reached';
  end if;

  update public.group_members m set role = 'admin'
    where m.group_id = p_group_id and m.user_id = p_member_id;
  perform penguin_groups_private.record_event(p_group_id, caller, p_member_id, 'member_promoted', null);
  return 'admin';
end;
$$;

-- Owner only: an admin becomes a member again. Repeating it is harmless.
create function public.demote_group_admin(p_group_id uuid, p_member_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target_role text;
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_group_id is null or p_member_id is null then
    raise exception using errcode = '22023', message = 'Choose a group and a member';
  end if;
  perform penguin_groups_private.begin_staff_action(p_group_id, caller, true);

  target_role := penguin_groups_private.visible_role(p_group_id, caller, p_member_id);
  if target_role is null then
    raise exception using errcode = 'PG008', message = 'Member not found';
  end if;
  if target_role = 'owner' then
    raise exception using errcode = 'PG009', message = 'Not allowed for this member';
  end if;
  if target_role = 'member' then
    return 'member';
  end if;

  update public.group_members m set role = 'member'
    where m.group_id = p_group_id and m.user_id = p_member_id;
  perform penguin_groups_private.record_event(p_group_id, caller, p_member_id, 'admin_demoted', null);
  return 'member';
end;
$$;

-- Owner only: an admin becomes the owner and the caller becomes an admin, in one
-- transaction and under the group lock. The caller is demoted first, so the
-- one-owner index is never violated and the group never has two owners; both
-- updates commit together, so it never has none. Nothing here deletes the owner
-- membership, so the archiving trigger is not involved.
create function public.transfer_group_ownership(p_group_id uuid, p_new_owner_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target_role text;
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_group_id is null or p_new_owner_id is null then
    raise exception using errcode = '22023', message = 'Choose a group and a member';
  end if;
  perform penguin_groups_private.begin_staff_action(p_group_id, caller, true);

  target_role := penguin_groups_private.visible_role(p_group_id, caller, p_new_owner_id);
  if target_role is null then
    raise exception using errcode = 'PG008', message = 'Member not found';
  end if;
  if p_new_owner_id = caller then
    raise exception using errcode = 'PG009', message = 'Not allowed for this member';
  end if;
  if target_role <> 'admin' then
    raise exception using errcode = 'PG012', message = 'The new owner must be an admin';
  end if;

  update public.group_members m set role = 'admin'
    where m.group_id = p_group_id and m.user_id = caller;
  update public.group_members m set role = 'owner'
    where m.group_id = p_group_id and m.user_id = p_new_owner_id;
  update public.groups g set updated_at = pg_catalog.clock_timestamp() where g.id = p_group_id;
  perform penguin_groups_private.record_event(p_group_id, caller, p_new_owner_id, 'ownership_transferred', null);
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Moderation: remove, ban, unban
-- ---------------------------------------------------------------------------
-- Hierarchy, the same for remove and ban: the owner may act on admins and members;
-- an admin may act on members only; nobody may act on the owner or on themselves.

-- Removes a member. They may join again; to prevent that, ban them instead.
create function public.remove_group_member(p_group_id uuid, p_member_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_role text;
  target_role text;
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_group_id is null or p_member_id is null then
    raise exception using errcode = '22023', message = 'Choose a group and a member';
  end if;
  caller_role := penguin_groups_private.begin_staff_action(p_group_id, caller, false);

  target_role := penguin_groups_private.visible_role(p_group_id, caller, p_member_id);
  if target_role is null then
    raise exception using errcode = 'PG008', message = 'Member not found';
  end if;
  if p_member_id = caller or target_role = 'owner' or (caller_role = 'admin' and target_role <> 'member') then
    raise exception using errcode = 'PG009', message = 'Not allowed for this member';
  end if;
  if penguin_groups_private.recent_removals(caller) >= penguin_groups_private.removal_limit_per_hour() then
    raise exception using errcode = 'PG010', message = 'Removal limit reached';
  end if;

  delete from public.group_members m where m.group_id = p_group_id and m.user_id = p_member_id;
  perform penguin_groups_private.record_event(p_group_id, caller, p_member_id, 'member_removed',
    pg_catalog.jsonb_build_object('role', target_role));
  return true;
end;
$$;

-- Removes a member and bans them, together. Only a current member can be banned:
-- a student who has already left is answered like any other non-member, so a ban
-- can never be placed on, or used to test for, someone the caller cannot see in
-- the group. The removal counts towards the removal limit.
create function public.ban_group_member(p_group_id uuid, p_member_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_role text;
  target_role text;
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_group_id is null or p_member_id is null then
    raise exception using errcode = '22023', message = 'Choose a group and a member';
  end if;
  caller_role := penguin_groups_private.begin_staff_action(p_group_id, caller, false);

  target_role := penguin_groups_private.visible_role(p_group_id, caller, p_member_id);
  if target_role is null then
    raise exception using errcode = 'PG008', message = 'Member not found';
  end if;
  if p_member_id = caller or target_role = 'owner' or (caller_role = 'admin' and target_role <> 'member') then
    raise exception using errcode = 'PG009', message = 'Not allowed for this member';
  end if;
  if penguin_groups_private.recent_removals(caller) >= penguin_groups_private.removal_limit_per_hour() then
    raise exception using errcode = 'PG010', message = 'Removal limit reached';
  end if;

  delete from public.group_members m where m.group_id = p_group_id and m.user_id = p_member_id;
  insert into public.group_bans (group_id, user_id, banned_by, banned_role, created_at)
    values (p_group_id, p_member_id, caller, target_role, pg_catalog.clock_timestamp())
    on conflict on constraint group_bans_pkey do nothing;
  perform penguin_groups_private.record_event(p_group_id, caller, p_member_id, 'member_banned',
    pg_catalog.jsonb_build_object('role', target_role));
  return true;
end;
$$;

-- Lifts a ban. The student is not added back; they may join again themselves. The
-- owner may lift any ban; an admin only a ban they placed on an ordinary member.
create function public.unban_group_member(p_group_id uuid, p_banned_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_role text;
  ban public.group_bans%rowtype;
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_group_id is null or p_banned_id is null then
    raise exception using errcode = '22023', message = 'Choose a group and a student';
  end if;
  caller_role := penguin_groups_private.begin_staff_action(p_group_id, caller, false);

  select b.* into ban from public.group_bans b
    where b.group_id = p_group_id and b.user_id = p_banned_id
      and b.user_id not in (select hidden from penguin_groups_private.hidden_from(caller) hidden);
  if ban.group_id is null then
    raise exception using errcode = 'PG008', message = 'Member not found';
  end if;
  if caller_role = 'admin' and (ban.banned_by is distinct from caller or ban.banned_role <> 'member') then
    raise exception using errcode = 'PG009', message = 'Not allowed for this member';
  end if;

  delete from public.group_bans b where b.group_id = p_group_id and b.user_id = p_banned_id;
  perform penguin_groups_private.record_event(p_group_id, caller, p_banned_id, 'member_unbanned', null);
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Group information
-- ---------------------------------------------------------------------------

-- Owner only: changes the name and description, under the rules a new group has
-- to meet. Sending the current values changes nothing and records nothing.
create function public.update_group_details(p_group_id uuid, p_name text, p_description text)
returns table (
  id uuid,
  name text,
  description text,
  updated_at timestamptz
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
  if p_group_id is null or p_name is null then
    raise exception using errcode = '22023', message = 'Invalid group';
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

  perform penguin_groups_private.begin_staff_action(p_group_id, caller, true);

  select g.* into stored from public.groups g where g.id = p_group_id;
  if stored.name = clean_name and stored.description is not distinct from clean_description then
    return query select stored.id, stored.name, stored.description, stored.updated_at;
    return;
  end if;
  if exists (select 1 from public.groups g
      where pg_catalog.lower(g.name) = pg_catalog.lower(clean_name) and g.id <> p_group_id) then
    raise exception using errcode = 'PG001', message = 'Group name taken';
  end if;

  perform penguin_groups_private.record_event(p_group_id, caller, null, 'details_updated', pg_catalog.jsonb_build_object(
    'name_changed', stored.name <> clean_name,
    'description_changed', stored.description is distinct from clean_description,
    'old_name', stored.name,
    'new_name', clean_name));
  begin
    update public.groups g
      set name = clean_name, description = clean_description, updated_at = pg_catalog.clock_timestamp()
      where g.id = p_group_id
      returning g.* into stored;
  exception when unique_violation then
    get stacked diagnostics violated = constraint_name;
    if violated = 'groups_name_unique_idx' then
      raise exception using errcode = 'PG001', message = 'Group name taken';
    end if;
    raise;
  end;

  return query select stored.id, stored.name, stored.description, stored.updated_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff-only reads
-- ---------------------------------------------------------------------------

-- The students banned from one group, newest ban first. Staff only. A banned
-- student who is unavailable to the caller is left out. can_unban says whether the
-- caller may lift that ban; nothing says who placed it.
create function public.list_group_bans(
  p_group_id uuid,
  p_before_banned_at timestamptz default null,
  p_before_banned_id uuid default null,
  p_limit integer default 31
)
returns table (
  banned_id uuid,
  username text,
  display_name text,
  avatar_url text,
  banned_at timestamptz,
  can_unban boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_role text;
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_group_id is null or p_limit is null or p_limit not between 1 and 51
     or (p_before_banned_at is null) <> (p_before_banned_id is null) then
    raise exception using errcode = '22023', message = 'Invalid page';
  end if;
  select m.role into caller_role from public.group_members m
    where m.group_id = p_group_id and m.user_id = caller;
  if caller_role is null or caller_role = 'member' then
    raise exception using errcode = '42501', message = 'Not permitted';
  end if;
  return query
    select b.user_id, p.username, p.display_name, p.avatar_url, b.created_at,
      (g.status = 'active'
        and (caller_role = 'owner' or (b.banned_by is not distinct from caller and b.banned_role = 'member')))
    from public.group_bans b
    join public.profiles p on p.id = b.user_id
    join public.groups g on g.id = b.group_id
    where b.group_id = p_group_id
      and (p_before_banned_at is null or (b.created_at, b.user_id) < (p_before_banned_at, p_before_banned_id))
      and b.user_id not in (select hidden from penguin_groups_private.hidden_from(caller) hidden)
    order by b.created_at desc, b.user_id desc
    limit p_limit;
end;
$$;

-- The administration history of one group, newest first. Staff only. The owner
-- sees every action; an admin sees removals, bans and unbans only. An entry whose
-- actor or target is unavailable to the caller is left out entirely, so the history
-- cannot reveal a hidden student or their role. Names are returned, identifiers
-- are not. actor_missing and target_missing mark an account that no longer exists.
create function public.list_group_admin_events(
  p_group_id uuid,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 31
)
returns table (
  id uuid,
  action text,
  created_at timestamptz,
  actor_username text,
  actor_display_name text,
  actor_missing boolean,
  target_username text,
  target_display_name text,
  target_missing boolean,
  detail text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  caller_role text;
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_group_id is null or p_limit is null or p_limit not between 1 and 51
     or (p_before_created_at is null) <> (p_before_id is null) then
    raise exception using errcode = '22023', message = 'Invalid page';
  end if;
  select m.role into caller_role from public.group_members m
    where m.group_id = p_group_id and m.user_id = caller;
  if caller_role is null or caller_role = 'member' then
    raise exception using errcode = '42501', message = 'Not permitted';
  end if;
  return query
    select e.id, e.action, e.created_at,
      a.username, a.display_name, e.actor_id is null,
      t.username, t.display_name, (e.target_id is null and e.action <> 'details_updated'),
      case when e.action = 'details_updated' and (e.details ->> 'name_changed')::boolean
        then e.details ->> 'new_name' end
    from public.group_admin_events e
    left join public.profiles a on a.id = e.actor_id
    left join public.profiles t on t.id = e.target_id
    where e.group_id = p_group_id
      and (caller_role = 'owner' or e.action in ('member_removed', 'member_banned', 'member_unbanned'))
      and (p_before_created_at is null or (e.created_at, e.id) < (p_before_created_at, p_before_id))
      and (e.actor_id is null or e.actor_id not in (select hidden from penguin_groups_private.hidden_from(caller) hidden))
      and (e.target_id is null or e.target_id not in (select hidden from penguin_groups_private.hidden_from(caller) hidden))
    order by e.created_at desc, e.id desc
    limit p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- Existing functions: join and leave
-- ---------------------------------------------------------------------------

-- As in the foundation migration, with one addition: a banned student is refused.
-- An existing member is answered first, as before. The ban is read while the group
-- row is locked, which is the same lock a ban is placed under, so a join and a ban
-- of the same student can never both succeed.
create or replace function public.join_group(p_group_id uuid)
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
  if exists (select 1 from public.group_bans b where b.group_id = p_group_id and b.user_id = caller) then
    raise exception using errcode = 'PG007', message = 'Cannot join this group';
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

-- As in the foundation migration, with one change: the group row is locked before
-- the membership is read. Before, a leave held the membership row and then waited
-- for the group row (through the count trigger), while an administrative action
-- holds the group row and then wants the membership row: the two could deadlock.
-- Now both take the group first. An admin leaves like any member; the owner is
-- still refused, and can leave after transferring ownership.
create or replace function public.leave_group(p_group_id uuid)
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
  perform 1 from public.groups g where g.id = p_group_id for update;

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
-- Existing functions: the two reads gain the full role
-- ---------------------------------------------------------------------------
-- A return type cannot be changed in place, so each is dropped and created again in
-- this transaction. Signatures, access and every existing column are unchanged.

drop function public.get_group_viewer_summaries(uuid[]);

-- As in the count-policy migration, plus my_group_role: the caller's full role.
-- my_role keeps the two values earlier app code knows, so an admin reads 'member'.
create function public.get_group_viewer_summaries(p_group_ids uuid[])
returns table (
  group_id uuid,
  member_count integer,
  unavailable_member_count integer,
  my_role text,
  my_group_role text
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
      g.member_count,
      (
        select count(*) from public.group_members m
        where m.group_id = g.id
          and m.user_id in (select hidden from penguin_groups_private.hidden_from(caller) hidden)
      )::integer,
      (select case when m.role = 'admin' then 'member' else m.role end
         from public.group_members m where m.group_id = g.id and m.user_id = caller),
      (select m.role from public.group_members m where m.group_id = g.id and m.user_id = caller)
    from public.groups g
    where g.id = any (p_group_ids);
end;
$$;

drop function public.list_group_members(uuid, timestamptz, uuid, integer);

-- As in the foundation migration, plus group_role: the member's full role. role
-- keeps the two values earlier app code knows, so an admin reads 'member'.
-- Unavailable members are still left out entirely, whatever their role.
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
  avatar_url text,
  group_role text
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
    select m.user_id, case when m.role = 'admin' then 'member' else m.role end,
      m.joined_at, p.username, p.display_name, p.avatar_url, m.role
    from public.group_members m
    join public.profiles p on p.id = m.user_id
    where m.group_id = p_group_id
      and (p_after_joined_at is null or (m.joined_at, m.user_id) > (p_after_joined_at, p_after_user_id))
      and m.user_id not in (select hidden from penguin_groups_private.hidden_from(caller) hidden)
    order by m.joined_at, m.user_id
    limit p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

revoke all on function public.promote_group_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.demote_group_admin(uuid, uuid) from public, anon, authenticated;
revoke all on function public.transfer_group_ownership(uuid, uuid) from public, anon, authenticated;
revoke all on function public.remove_group_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ban_group_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.unban_group_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.update_group_details(uuid, text, text) from public, anon, authenticated;
revoke all on function public.list_group_bans(uuid, timestamptz, uuid, integer) from public, anon, authenticated;
revoke all on function public.list_group_admin_events(uuid, timestamptz, uuid, integer) from public, anon, authenticated;
revoke all on function public.get_group_viewer_summaries(uuid[]) from public, anon, authenticated;
revoke all on function public.list_group_members(uuid, timestamptz, uuid, integer) from public, anon, authenticated;
-- join_group and leave_group were replaced in place and keep their existing access.

grant execute on function public.promote_group_member(uuid, uuid) to authenticated;
grant execute on function public.demote_group_admin(uuid, uuid) to authenticated;
grant execute on function public.transfer_group_ownership(uuid, uuid) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.ban_group_member(uuid, uuid) to authenticated;
grant execute on function public.unban_group_member(uuid, uuid) to authenticated;
grant execute on function public.update_group_details(uuid, text, text) to authenticated;
grant execute on function public.list_group_bans(uuid, timestamptz, uuid, integer) to authenticated;
grant execute on function public.list_group_admin_events(uuid, timestamptz, uuid, integer) to authenticated;
grant execute on function public.get_group_viewer_summaries(uuid[]) to authenticated;
grant execute on function public.list_group_members(uuid, timestamptz, uuid, integer) to authenticated;

comment on table public.group_bans is
  'Students banned from a group. Written only by ban_group_member and unban_group_member; no client access.';
comment on table public.group_admin_events is
  'Administrative actions in groups. Written only by the administrative functions; read through list_group_admin_events; no client access.';

commit;
