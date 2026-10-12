-- Executable database checks for the Sprint 7A groups migration: grants, row-level
-- security, the three write functions, limits, blocking and the ownership lifecycle,
-- against the REAL schema.
--
-- Run only against a DISPOSABLE database (see tests/groups-db-verify.sh), never the
-- hosted project. Every file in supabase/migrations must be applied first.
--
-- The script creates test accounts in auth.users, leaves its data behind, and stops
-- at the first failed assertion. It ends by printing
-- "groups integration: all assertions passed".
--
-- Concurrency needs several sessions: see tests/groups-concurrency.sh.
\set ON_ERROR_STOP on

create function public.test_assert(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;
-- Runs a statement as the current role and reports whether it failed with the
-- expected SQLSTATE. Anything the statement did is rolled back.
create function public.test_fails(statement text, expected_state text)
returns boolean language plpgsql as $$
begin
  execute statement;
  return false;
exception when others then
  if sqlstate <> expected_state then
    raise notice 'expected % but got % (%)', expected_state, sqlstate, sqlerrm;
  end if;
  return sqlstate = expected_state;
end;
$$;
create function public.test_login(user_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', user_id::text, false);
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, false);
end;
$$;
create function public.test_logout()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '{}', false);
end;
$$;
-- Clients cannot read the stored member count or other students' memberships, so
-- the checks below read the stored truth through these definer helpers and the
-- viewer's own picture through the real functions.
create function public.test_raw_count(g uuid) returns integer language sql security definer set search_path = '' as
  $$ select member_count from public.groups where id = g $$;
create function public.test_members(g uuid) returns bigint language sql security definer set search_path = '' as
  $$ select count(*) from public.group_members where group_id = g $$;
create function public.test_has_member(g uuid, u uuid) returns bigint language sql security definer set search_path = '' as
  $$ select count(*) from public.group_members where group_id = g and user_id = u $$;
create function public.test_role(g uuid, u uuid) returns text language sql security definer set search_path = '' as
  $$ select role from public.group_members where group_id = g and user_id = u $$;
create function public.test_total_memberships() returns bigint language sql security definer set search_path = '' as
  $$ select count(*) from public.group_members $$;
-- What the current viewer is told: the count, how many members are unavailable to
-- them, and the length of the member list.
create function public.test_viewer_count(g uuid) returns integer language sql as
  $$ select member_count from public.get_group_viewer_summaries(array[g]) $$;
create function public.test_viewer_unavailable(g uuid) returns integer language sql as
  $$ select unavailable_member_count from public.get_group_viewer_summaries(array[g]) $$;
create function public.test_viewer_list(g uuid) returns bigint language sql as
  $$ select count(*) from public.list_group_members(g, null, null, 51) $$;
create function public.test_viewer_sees(g uuid, u uuid) returns bigint language sql as
  $$ select count(*) from public.list_group_members(g, null, null, 51) m where m.user_id = u $$;
grant execute on function public.test_assert(boolean, text), public.test_fails(text, text),
  public.test_login(uuid), public.test_logout(), public.test_raw_count(uuid), public.test_members(uuid),
  public.test_has_member(uuid, uuid), public.test_role(uuid, uuid), public.test_total_memberships(),
  public.test_viewer_count(uuid), public.test_viewer_unavailable(uuid), public.test_viewer_list(uuid),
  public.test_viewer_sees(uuid, uuid)
  to authenticated, anon;

\set alice '00000000-0000-4000-8000-0000000000a1'
\set bob   '00000000-0000-4000-8000-0000000000b2'
\set carol '00000000-0000-4000-8000-0000000000c3'
\set dave  '00000000-0000-4000-8000-0000000000d4'
\set erin  '00000000-0000-4000-8000-0000000000e5'
\set frank '00000000-0000-4000-8000-0000000000f6'
\set gina  '00000000-0000-4000-8000-000000000a07'
\set r1    '00000000-0000-4000-8000-000000002001'
\set r2    '00000000-0000-4000-8000-000000002002'
\set r3    '00000000-0000-4000-8000-000000002003'
\set r4    '00000000-0000-4000-8000-000000002004'
\set r5    '00000000-0000-4000-8000-000000002005'
\set r6    '00000000-0000-4000-8000-000000002006'
\set r7    '00000000-0000-4000-8000-000000002007'
\set nowhere '00000000-0000-4000-8000-00000000dead'

-- Accounts are created the real way: a row in auth.users, whose trigger creates the
-- profile. Onboarding is then completed for everyone except dave.
insert into auth.users (id) values (:'alice'), (:'bob'), (:'carol'), (:'dave'), (:'erin'), (:'frank'), (:'gina');
update public.profiles p set
    username = 'student_' || right(replace(p.id::text, '-', ''), 6),
    display_name = 'Student ' || right(p.id::text, 4),
    institution_id = (select id from public.institutions order by slug limit 1),
    field_id = (select id from public.fields order by slug limit 1),
    study_level = 'undergraduate',
    onboarding_completed = true
  where p.id <> :'dave';

-- --- Grants ------------------------------------------------------------------------

select public.test_assert(
  not has_table_privilege('authenticated', 'public.groups', 'insert')
  and not has_table_privilege('authenticated', 'public.groups', 'update')
  and not has_table_privilege('authenticated', 'public.groups', 'delete')
  and not has_table_privilege('authenticated', 'public.groups', 'truncate')
  and not has_table_privilege('authenticated', 'public.group_members', 'insert')
  and not has_table_privilege('authenticated', 'public.group_members', 'update')
  and not has_table_privilege('authenticated', 'public.group_members', 'delete')
  and not has_table_privilege('authenticated', 'public.group_members', 'truncate'),
  'clients must have no direct write access to group tables');
select public.test_assert(
  not has_any_column_privilege('authenticated', 'public.groups', 'insert')
  and not has_any_column_privilege('authenticated', 'public.groups', 'update')
  and not has_any_column_privilege('authenticated', 'public.group_members', 'insert')
  and not has_any_column_privilege('authenticated', 'public.group_members', 'update'),
  'clients must have no column-level write access either');
select public.test_assert(
  not has_any_column_privilege('anon', 'public.groups', 'select')
  and not has_any_column_privilege('anon', 'public.group_members', 'select')
  and not has_function_privilege('anon', 'public.create_group_idempotent(uuid,text,text)', 'execute')
  and not has_function_privilege('anon', 'public.join_group(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.leave_group(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.get_group_viewer_summaries(uuid[])', 'execute')
  and not has_function_privilege('anon', 'public.list_group_members(uuid,timestamptz,uuid,integer)', 'execute')
  and not has_schema_privilege('anon', 'penguin_groups_private', 'usage'),
  'anonymous callers must have no group access');
select public.test_assert(
  not has_function_privilege('authenticated', 'penguin_groups_private.membership_changed()', 'execute')
  and not has_function_privilege('authenticated', 'penguin_groups_private.lock_user(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'penguin_groups_private.creation_limit_per_day()', 'execute')
  and not has_function_privilege('authenticated', 'penguin_groups_private.joined_groups_limit()', 'execute')
  and not has_function_privilege('authenticated', 'penguin_groups_private.hidden_from(uuid)', 'execute')
  and not has_schema_privilege('authenticated', 'penguin_groups_private', 'usage'),
  'internal helpers must not be callable by clients, and their schema is closed to them');
select public.test_assert(
  not has_column_privilege('authenticated', 'public.groups', 'creator_id', 'select')
  and not has_column_privilege('authenticated', 'public.groups', 'client_request_id', 'select')
  and not has_column_privilege('authenticated', 'public.groups', 'member_count', 'select'),
  'creator_id, the request identifier and the stored member count are not exposed to clients');
select public.test_assert(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'group_members') = 1
  and (select qual from pg_policies where schemaname = 'public' and tablename = 'group_members')
      ~ '^\(user_id = \( SELECT auth\.uid\(\) AS uid\)\)$',
  'the only read policy on memberships is "your own rows"');
select public.test_assert(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname = 'public' and p.proname in ('create_group_idempotent', 'join_group', 'leave_group',
             'get_group_viewer_summaries', 'list_group_members'))
       or (n.nspname = 'penguin_groups_private' and p.proname in ('membership_changed'))),
  'every definer function pins an empty search_path');
select public.test_assert(
  (select relrowsecurity from pg_class where oid = 'public.groups'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.group_members'::regclass),
  'row-level security is enabled on both tables');
select public.test_assert(
  (select count(*) from pg_publication_tables where schemaname = 'public' and tablename in ('groups', 'group_members')) = 0,
  'group tables are not streamed over Realtime');

-- --- Creating a group --------------------------------------------------------------

set role authenticated;
select public.test_login(:'alice');

select id as g1, name as g1_name, idempotent_replay as g1_replay, status as g1_status
  from public.create_group_idempotent(:'r1', E'  Study \t  Group  ', '  For revision sessions.  ') \gset
select public.test_assert(:'g1_name' = 'Study Group', 'the name is trimmed and inner whitespace is collapsed');
select public.test_assert(public.test_viewer_count(:'g1') = 1 and public.test_viewer_unavailable(:'g1') = 0
  and not :'g1_replay'::boolean and :'g1_status' = 'active',
  'a new group is active, has one member and is not a replay');
select public.test_assert(
  (select description from public.groups where id = :'g1') = 'For revision sessions.', 'the description is trimmed');
select public.test_assert(
  public.test_members(:'g1') = 1
  and public.test_role(:'g1', :'alice') = 'owner',
  'the creator is the only member and is the owner');
select public.test_assert(
  public.test_raw_count(:'g1') = 1, 'the stored member count is 1');

-- Idempotency.
select id as g1_again, idempotent_replay as g1_again_replay
  from public.create_group_idempotent(:'r1', 'Study Group', 'For revision sessions.') \gset
select public.test_assert(:'g1_again' = :'g1' and :'g1_again_replay'::boolean, 'repeating the request returns the same group as a replay');
select public.test_assert(
  (select count(*) from public.groups) = 1 and public.test_total_memberships() = 1,
  'the replay stored nothing new');
select public.test_assert(public.test_fails(format(
  'select * from public.create_group_idempotent(%L, %L, null)', :'r1', 'Another Name'), '22023'),
  'a request identifier cannot be reused for a different group');

-- Validation.
select public.test_assert(public.test_fails(format('select * from public.create_group_idempotent(%L, %L, null)', :'r2', 'ab'), '23514'),
  'a two-character name is refused');
select public.test_assert(public.test_fails(format('select * from public.create_group_idempotent(%L, %L, null)', :'r2', E' \n\t  '), '23514'),
  'a blank name is refused');
select public.test_assert(public.test_fails(format('select * from public.create_group_idempotent(%L, %L, null)', :'r2', E'a \n '), '23514'),
  'a name that is too short once whitespace is removed is refused');
select public.test_assert(public.test_fails(format('select * from public.create_group_idempotent(%L, %L, null)', :'r2', repeat('x', 61)), '23514'),
  'a 61-character name is refused');
-- Invisible characters would let a second group look exactly like "Study Group".
select public.test_assert(
  public.test_fails(format('select * from public.create_group_idempotent(%L, %L, null)', :'r2', E'Study\u200B Group'), '23514')
  and public.test_fails(format('select * from public.create_group_idempotent(%L, %L, null)', :'r2', E'Study Group\uFEFF'), '23514')
  and public.test_fails(format('select * from public.create_group_idempotent(%L, %L, null)', :'r2', E'\u202EStudy Group'), '23514')
  and public.test_fails(format('select * from public.create_group_idempotent(%L, %L, null)', :'r2', E'Study\u2060Group'), '23514')
  and public.test_fails(format('select * from public.create_group_idempotent(%L, %L, null)', :'r2', E'Study Group\x01'), '23514'),
  'a name with a zero-width, direction-override or control character is refused');
select public.test_assert(public.test_fails(format('select * from public.create_group_idempotent(%L, %L, %L)', :'r2', 'Valid Name', repeat('d', 501)), '23514'),
  'a 501-character description is refused');
select public.test_assert(public.test_fails(format('select * from public.create_group_idempotent(null, %L, null)', 'Valid Name'), '22023')
  and public.test_fails(format('select * from public.create_group_idempotent(%L, null, null)', :'r2'), '22023'),
  'missing arguments are refused');
select public.test_assert((select count(*) from public.groups) = 1, 'no refused request stored a group');

-- Names are unique ignoring case and spacing.
select public.test_login(:'bob');
select public.test_assert(public.test_fails(format('select * from public.create_group_idempotent(%L, %L, null)', :'r2', 'study group'), 'PG001'),
  'the same name in another letter case is taken');
select public.test_assert(public.test_fails(format('select * from public.create_group_idempotent(%L, %L, null)', :'r2', '  STUDY    GROUP '), 'PG001'),
  'the same name with different spacing is taken');
-- Request identifiers are scoped to the creator: bob may use alice's.
select id as g2, description is null as g2_no_description
  from public.create_group_idempotent(:'r1', 'Chess Club', '   ') \gset
select public.test_assert(:'g2' <> :'g1' and :'g2_no_description'::boolean,
  'another student can use the same request identifier, and a blank description is stored as none');

-- Eligibility.
select public.test_login(:'dave');
select public.test_assert(public.test_fails(format('select * from public.create_group_idempotent(%L, %L, null)', :'r3', 'Dave Group'), '42501'),
  'a student who has not finished onboarding cannot create a group');
select public.test_assert(public.test_fails(format('select * from public.join_group(%L)', :'g1'), '42501'),
  'a student who has not finished onboarding cannot join a group');
select public.test_logout();
select public.test_assert(public.test_fails(format('select * from public.create_group_idempotent(%L, %L, null)', :'r3', 'Nobody Group'), '42501')
  and public.test_fails(format('select * from public.join_group(%L)', :'g1'), '42501')
  and public.test_fails(format('select public.leave_group(%L)', :'g1'), '42501'),
  'a request with no signed-in user is refused by every function');
reset role;
set role anon;
select public.test_assert(public.test_fails(format('select * from public.create_group_idempotent(%L, %L, null)', :'r3', 'Anon Group'), '42501')
  and public.test_fails(format('select * from public.join_group(%L)', :'g1'), '42501')
  and public.test_fails('select count(*) from public.groups', '42501')
  and public.test_fails('select count(*) from public.group_members', '42501'),
  'the anonymous role can neither call the functions nor read the tables');
reset role;

-- Atomic creation: if the owner membership cannot be stored, no group is left behind.
create function public.test_reject_membership() returns trigger language plpgsql as $$
begin raise exception using errcode = 'P0001', message = 'membership rejected for the test'; end; $$;
create trigger test_reject_membership before insert on public.group_members
  for each row execute function public.test_reject_membership();
set role authenticated;
select public.test_login(:'carol');
select public.test_assert(public.test_fails(format('select * from public.create_group_idempotent(%L, %L, null)', :'r4', 'Half Made'), 'P0001'),
  'creation fails when the owner membership fails');
select public.test_assert((select count(*) from public.groups where name = 'Half Made') = 0,
  'and the group row is rolled back with it');
reset role;
drop trigger test_reject_membership on public.group_members;
drop function public.test_reject_membership();

-- --- Malicious direct writes -------------------------------------------------------

set role authenticated;
select public.test_login(:'bob');
select public.test_assert(public.test_fails(format(
  'insert into public.groups (name, creator_id, client_request_id) values (%L, %L, gen_random_uuid())', 'Forged', :'bob'), '42501'),
  'a group cannot be inserted directly');
select public.test_assert(public.test_fails(format(
  'insert into public.group_members (group_id, user_id, role) values (%L, %L, %L)', :'g1', :'bob', 'owner'), '42501'),
  'an owner membership cannot be forged');
select public.test_assert(public.test_fails(format(
  'insert into public.group_members (group_id, user_id) values (%L, %L)', :'g1', :'carol'), '42501'),
  'another student cannot be added to a group');
select public.test_assert(public.test_fails(format(
  'update public.group_members set role = %L where group_id = %L', 'owner', :'g2'), '42501'),
  'a role cannot be changed directly');
select public.test_assert(public.test_fails(format(
  'update public.groups set member_count = 999, name = %L where id = %L', 'Taken Over', :'g1'), '42501'),
  'a group cannot be updated directly');
select public.test_assert(public.test_fails(format('delete from public.groups where id = %L', :'g1'), '42501'),
  'a group cannot be deleted directly');
select public.test_assert(public.test_fails(format(
  'delete from public.group_members where group_id = %L and user_id = %L', :'g1', :'alice'), '42501'),
  'another member cannot be removed');
select public.test_assert(public.test_fails('select creator_id from public.groups', '42501')
  and public.test_fails('select client_request_id from public.groups', '42501')
  and public.test_fails('select member_count from public.groups', '42501')
  and public.test_fails('select * from public.groups', '42501'),
  'unexposed columns cannot be read');
select public.test_assert(public.test_fails(format('select public.join_group(%L, %L)', :'g1', 'owner'), '42883')
  and public.test_fails(format('select public.join_group(%L, %L::uuid)', :'g1', :'carol'), '42883')
  and public.test_fails(format('select public.leave_group(%L, %L::uuid)', :'g1', :'alice'), '42883'),
  'the functions accept no role and no other user');
select public.test_assert(public.test_fails('select penguin_groups_private.joined_groups_limit()', '42501')
  and public.test_fails(format('select penguin_groups_private.lock_user(%L)', :'bob'), '42501'),
  'internal helpers refuse a direct call');
select public.test_assert(
  (select count(*) from public.groups) = 2 and public.test_total_memberships() = 2
  and public.test_raw_count(:'g1') = 1,
  'nothing changed after the refused writes');

-- --- Joining and leaving -----------------------------------------------------------

select role as bob_role, already_member as bob_already from public.join_group(:'g1') \gset
select public.test_assert(:'bob_role' = 'member' and not :'bob_already'::boolean, 'joining stores a plain member');
select public.test_assert(public.test_raw_count(:'g1') = 2, 'the count follows the join');
select role as bob_role, already_member as bob_already from public.join_group(:'g1') \gset
select public.test_assert(:'bob_role' = 'member' and :'bob_already'::boolean, 'joining again reports the existing membership');
select public.test_assert(
  public.test_raw_count(:'g1') = 2
  and public.test_has_member(:'g1', :'bob') = 1,
  'a repeated join stores no duplicate and does not move the count');
select public.test_assert(public.test_fails(format('select * from public.join_group(%L)', :'nowhere'), 'PG004'),
  'joining a group that does not exist is refused');
select public.test_assert(public.test_fails('select * from public.join_group(null)', '22023')
  and public.test_fails('select public.leave_group(null)', '22023'), 'a missing group identifier is refused');

select public.test_assert(public.leave_group(:'g1') is true, 'leaving returns true');
select public.test_assert(
  public.test_raw_count(:'g1') = 1
  and public.test_has_member(:'g1', :'bob') = 0,
  'the membership is gone and the count follows');
select public.test_assert(public.leave_group(:'g1') is false, 'leaving again returns false');
select public.test_assert(public.leave_group(:'nowhere') is false, 'leaving a group that does not exist returns false');
select public.test_assert(public.test_raw_count(:'g1') = 1, 'a repeated leave does not move the count');

-- The owner.
select public.test_login(:'alice');
select public.test_assert(public.test_fails(format('select public.leave_group(%L)', :'g1'), 'PG006'), 'the owner cannot leave');
select public.test_assert(
  public.test_role(:'g1', :'alice') = 'owner'
  and (select status from public.groups where id = :'g1') = 'active',
  'the refused leave changed nothing');
select role as alice_role, already_member as alice_already from public.join_group(:'g1') \gset
select public.test_assert(:'alice_role' = 'owner' and :'alice_already'::boolean, 'the owner joining again stays the owner');

-- Daily creation limit: alice has made 1 group; 2 more are allowed.
select id as g3 from public.create_group_idempotent(:'r5', 'Robotics', null) \gset
select id as g4 from public.create_group_idempotent(:'r6', 'Debate Society', null) \gset
select public.test_assert(public.test_fails(format('select * from public.create_group_idempotent(%L, %L, null)', :'r7', 'One Too Many'), 'PG002'),
  'the fourth group in a day is refused');
select idempotent_replay as limit_replay from public.create_group_idempotent(:'r5', 'Robotics', null) \gset
select public.test_assert(:'limit_replay'::boolean, 'a replay still succeeds after the limit is reached');
select public.test_assert((select count(*) from public.groups g join public.group_members m on m.group_id = g.id
    where m.user_id = :'alice' and m.role = 'owner') = 3, 'alice owns exactly three groups');
reset role;
update public.groups set created_at = created_at - interval '25 hours' where id = :'g3';
set role authenticated;
select public.test_login(:'alice');
select id as g5 from public.create_group_idempotent(:'r7', 'Film Night', null) \gset
select public.test_assert(:'g5' is not null, 'the limit counts only the last 24 hours');

-- --- Reading: membership lists and blocks ------------------------------------------

select public.test_login(:'bob');   select count(*) as ignored from public.join_group(:'g1') \gset
select public.test_login(:'carol'); select count(*) as ignored from public.join_group(:'g1') \gset
select public.test_login(:'erin');  select count(*) as ignored from public.join_group(:'g1') \gset
select public.test_assert(public.test_viewer_list(:'g1') = 4,
  'with no blocks every member is listed');
select public.test_assert((select count(*) from public.groups) = 5, 'every signed-in student can read every public group');

-- erin blocks carol: each is hidden from the other, and from nobody else.
select public.block_user(:'carol');
select public.test_assert(
  public.test_viewer_list(:'g1') = 3
  and public.test_viewer_sees(:'g1', :'carol') = 0,
  'a student does not see a member they blocked');
select public.test_assert(public.test_raw_count(:'g1') = 4, 'the stored count is not changed by a block');
select public.test_assert(public.test_viewer_count(:'g1') = 4, 'blocking does not lower the count the blocker is told');
select public.test_assert(public.test_viewer_unavailable(:'g1') = 1 and public.test_viewer_list(:'g1') = 3,
  'the blocker is told one member is unavailable, and is listed the other three');
select public.test_login(:'carol');
select public.test_assert(
  public.test_viewer_list(:'g1') = 3
  and public.test_viewer_sees(:'g1', :'erin') = 0
  and public.test_viewer_sees(:'g1', :'carol') = 1,
  'a student does not see a member who blocked them, and always sees their own membership');
select public.test_assert(public.test_viewer_count(:'g1') = 4, 'being blocked does not lower the count either');
select public.test_assert(public.test_viewer_unavailable(:'g1') = 1 and public.test_viewer_list(:'g1') = 3,
  'the blocked student is told the same: one unavailable, three listed');
select public.test_login(:'bob');
select public.test_assert(public.test_viewer_list(:'g1') = 4,
  'a block between two other students hides nobody from a third');
select public.test_assert(public.test_viewer_count(:'g1') = 4 and public.test_viewer_unavailable(:'g1') = 0,
  'and the third student is told the same count with nobody unavailable');
-- carol blocks the owner: the owner's row, and so the owner's identity, is hidden from her.
select public.test_login(:'carol');
select public.block_user(:'alice');
select public.test_assert(
  (select count(*) from public.list_group_members(:'g1') m where m.role = 'owner') = 0,
  'a blocked owner is not shown as the owner');
select public.test_assert(public.test_viewer_count(:'g1') = 4 and public.test_viewer_unavailable(:'g1') = 2
  and public.test_viewer_list(:'g1') = 2,
  'with two unavailable members, one of them the owner, the count is still four: two listed, two unavailable');
select public.test_assert(
  (select count(*) from public.list_group_members(:'g1') m where m.user_id in (:'alice', :'erin')) = 0
  and (select count(*) from public.list_group_members(:'g1') m where m.role = 'owner') = 0,
  'neither unavailable member is listed, and nothing marks which of them is the owner');
select public.test_login(:'alice');
select public.test_assert(
  public.test_viewer_sees(:'g1', :'carol') = 0,
  'the owner does not see a member who blocked them');
select public.test_assert(public.test_fails(format(
  'delete from public.group_members where group_id = %L and user_id = %L', :'g1', :'bob'), '42501'),
  'the owner cannot remove a member in this sprint');
select public.test_login(:'carol');
select public.unblock_user(:'alice');
select public.test_assert(
  (select count(*) from public.list_group_members(:'g1') m where m.role = 'owner') = 1, 'unblocking shows the owner again');
-- Blocks do not stop membership changes: that is messaging behaviour only.
select public.test_assert(public.leave_group(:'g1') is true, 'a blocked pair can still leave');
select already_member as carol_back from public.join_group(:'g1') \gset
select public.test_assert(not :'carol_back'::boolean, 'and join again');

-- --- Membership privacy --------------------------------------------------------------
-- g1 now holds alice (owner), bob, erin and carol, in that order of joining. erin and
-- carol are hidden from each other.

select public.test_login(:'bob');
-- Direct reads return the caller's own memberships and nothing else.
select public.test_assert(
  (select count(*) from public.group_members where group_id = :'g1') = 1
  and (select count(*) from public.group_members where group_id = :'g1' and user_id = :'bob') = 1,
  'reading a group''s memberships directly returns only your own row');
select public.test_assert(
  (select count(*) from public.group_members where user_id = :'alice') = 0
  and (select count(*) from public.group_members where user_id = :'carol') = 0
  and (select count(*) from public.group_members where user_id <> :'bob') = 0,
  'filtering memberships by another student returns nothing: their groups cannot be listed');
select public.test_assert(
  (select count(*) from public.group_members) = public.test_has_member(:'g1', :'bob') + public.test_has_member(:'g2', :'bob'),
  'an unfiltered read returns exactly your own memberships');
select public.test_assert(
  (select count(*) from public.groups g join public.group_members m on m.group_id = g.id where m.user_id = :'alice') = 0,
  'joining groups to memberships does not reveal another student''s groups either');

-- The member list is per group and takes no student.
select public.test_assert(public.test_viewer_list(:'g1') = 4, 'a member list returns the members of that one group');
select public.test_assert(
  (select string_agg(m.role, ',' order by m.joined_at, m.user_id) from public.list_group_members(:'g1') m) = 'owner,member,member,member',
  'the owner is first, then members in the order they joined');
select public.test_assert(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('list_group_members', 'get_group_viewer_summaries')
      and (p.proargnames::text ~ 'p_user_id|p_member|p_student|p_profile')) = 0,
  'neither read function takes a student to look up');
select public.test_assert(
  (select array_agg(a.attname::text order by a.attnum) from pg_attribute a
    where a.attrelid = (select typrelid from pg_type where oid = (select prorettype from pg_proc where proname = 'list_group_members'))) is null
  and (select proargnames[5:10] from pg_proc where proname = 'list_group_members')
      = array['user_id', 'role', 'joined_at', 'username', 'display_name', 'avatar_url'],
  'a member is returned with presentation fields only');
-- Paging: two, then the rest, with no overlap.
select user_id as page_last_user, joined_at as page_last_at from public.list_group_members(:'g1', null, null, 2) offset 1 \gset
select public.test_assert(
  (select count(*) from public.list_group_members(:'g1', null, null, 2)) = 2
  and (select count(*) from public.list_group_members(:'g1', :'page_last_at', :'page_last_user', 51)) = 2
  and not exists (
    select 1 from public.list_group_members(:'g1', null, null, 2) a
    join public.list_group_members(:'g1', :'page_last_at', :'page_last_user', 51) b on a.user_id = b.user_id),
  'the member list pages without repeating or skipping anyone');
-- Invalid requests.
select public.test_assert(
  public.test_fails('select * from public.list_group_members(null)', '22023')
  and public.test_fails(format('select * from public.list_group_members(%L, null, null, 0)', :'g1'), '22023')
  and public.test_fails(format('select * from public.list_group_members(%L, null, null, 52)', :'g1'), '22023')
  and public.test_fails(format('select * from public.list_group_members(%L, null, null, null)', :'g1'), '22023')
  and public.test_fails(format('select * from public.list_group_members(%L, now(), null, 10)', :'g1'), '22023')
  and public.test_fails(format('select * from public.list_group_members(%L, null, %L, 10)', :'g1', :'alice'), '22023'),
  'a missing group, an out-of-range page size and half a cursor are refused');
select public.test_assert(
  (select count(*) from public.list_group_members(:'nowhere')) = 0
  and (select count(*) from public.get_group_viewer_summaries(array[:'nowhere']::uuid[])) = 0,
  'a group that does not exist has no members and no summary');

-- Counts and the caller's own role.
select public.test_assert(
  (select my_role from public.get_group_viewer_summaries(array[:'g1']::uuid[])) = 'member'
  and (select my_role from public.get_group_viewer_summaries(array[:'g3']::uuid[])) is null
  and (select count(*) from public.get_group_viewer_summaries(array[:'g1', :'g2', :'g3']::uuid[])) = 3,
  'a summary carries the caller''s own role and nobody else''s');
select public.test_assert(
  public.test_fails('select * from public.get_group_viewer_summaries(null)', '22023')
  and public.test_fails('select * from public.get_group_viewer_summaries((select array_agg(gen_random_uuid()) from generate_series(1, 51)))', '22023'),
  'summaries need a list of at most 50 groups');
select public.test_assert(
  (select bool_and(s.member_count = public.test_raw_count(s.group_id)
                   and s.member_count = public.test_members(s.group_id)
                   and s.unavailable_member_count = 0
                   and s.member_count = public.test_viewer_list(s.group_id))
     from public.get_group_viewer_summaries(array[:'g1', :'g2', :'g3', :'g4', :'g5']::uuid[]) s),
  'with nobody unavailable, every count is the actual number of memberships and equals the member list');
select public.test_assert(
  (select proargnames[2:5] from pg_proc where proname = 'get_group_viewer_summaries')
    = array['group_id', 'member_count', 'unavailable_member_count', 'my_role'],
  'a summary holds two numbers and the caller''s own role, and nothing that identifies a member');
select public.test_login(:'erin');
select public.test_assert(
  (select bool_and(s.member_count = public.test_members(s.group_id)
                   and s.member_count - s.unavailable_member_count = public.test_viewer_list(s.group_id))
     from public.get_group_viewer_summaries(array[:'g1', :'g2', :'g3', :'g4', :'g5']::uuid[]) s)
  and public.test_viewer_count(:'g1') = 4 and public.test_viewer_unavailable(:'g1') = 1,
  'for a viewer with an unavailable member: the count is still actual, and listed plus unavailable equals it');
-- Paging with an unavailable member: three are listed over two pages, never four.
select user_id as erin_last_user, joined_at as erin_last_at from public.list_group_members(:'g1', null, null, 2) offset 1 \gset
select public.test_assert(
  (select count(*) from public.list_group_members(:'g1', null, null, 2)) = 2
  and (select count(*) from public.list_group_members(:'g1', :'erin_last_at', :'erin_last_user', 51)) = 1
  and (select count(*) from public.list_group_members(:'g1', :'erin_last_at', :'erin_last_user', 51) m where m.user_id = :'carol') = 0,
  'paging never returns the unavailable member, on any page');

-- Who may read.
select public.test_login(:'dave');
select public.test_assert(public.test_fails(format('select * from public.list_group_members(%L)', :'g1'), '42501'),
  'a student who has not finished onboarding cannot read member lists');
select public.test_logout();
select public.test_assert(
  public.test_fails(format('select * from public.list_group_members(%L)', :'g1'), '42501')
  and public.test_fails(format('select * from public.get_group_viewer_summaries(array[%L]::uuid[])', :'g1'), '42501'),
  'a request with no signed-in user reads no members and no counts');
reset role;
set role anon;
select public.test_assert(
  public.test_fails(format('select * from public.list_group_members(%L)', :'g1'), '42501')
  and public.test_fails(format('select * from public.get_group_viewer_summaries(array[%L]::uuid[])', :'g1'), '42501'),
  'the anonymous role can call neither read function');
reset role;
set role authenticated;
select public.test_login(:'bob');
select public.test_assert(public.test_fails(format('select * from penguin_groups_private.hidden_from(%L)', :'erin'), '42501'),
  'who a student has blocked cannot be read through the helper');

-- --- Joined-groups limit -----------------------------------------------------------

reset role;
insert into public.groups (name, client_request_id)
  select 'Bulk Group ' || lpad(n::text, 3, '0'), gen_random_uuid() from generate_series(1, 101) n;
set role authenticated;
select public.test_login(:'frank');
select count(*) as ignored from (
  select public.join_group(g.id) from public.groups g where g.name like 'Bulk Group %' and g.name <= 'Bulk Group 100'
) joined \gset
select public.test_assert((select count(*) from public.group_members where user_id = :'frank') = 100, 'a student can be in 100 groups');
select public.test_assert(public.test_fails(format('select * from public.join_group(%L)',
  (select id from public.groups where name = 'Bulk Group 101')), 'PG003'), 'the 101st group is refused');
select public.test_assert(public.test_fails(format('select * from public.create_group_idempotent(gen_random_uuid(), %L, null)', 'Frank Group'), 'PG003'),
  'creating a group is refused at the limit too, because the owner is a member');
select already_member as frank_again from public.join_group((select id from public.groups where name = 'Bulk Group 001')) \gset
select public.test_assert(:'frank_again'::boolean, 'a repeated join still succeeds at the limit');
select public.test_assert(public.leave_group((select id from public.groups where name = 'Bulk Group 001')) is true, 'leaving one group');
select already_member as frank_room from public.join_group((select id from public.groups where name = 'Bulk Group 101')) \gset
select public.test_assert(not :'frank_room'::boolean, 'makes room for another');

-- --- Database constraints (as an administrator) -------------------------------------

reset role;
select public.test_assert(public.test_fails(format(
  'insert into public.group_members (group_id, user_id, role) values (%L, %L, %L)', :'g1', :'gina', 'owner'), '23505'),
  'a group cannot have two owners');
select public.test_assert(public.test_fails(format(
  'insert into public.group_members (group_id, user_id, role) values (%L, %L, %L)', :'g1', :'gina', 'superadmin'), '23514'),
  'a value that is not a role is refused (admin became a role in Sprint 7B)');
select public.test_assert(public.test_fails(format(
  'insert into public.group_members (group_id, user_id) values (%L, %L)', :'g1', :'bob'), '23505'),
  'a duplicate membership is impossible');
select public.test_assert(public.test_fails(
  'insert into public.groups (name, client_request_id, visibility) values (''Secret Club'', gen_random_uuid(), ''private'')', '23514'),
  'only public groups can exist');
select public.test_assert(public.test_fails(
  'insert into public.groups (name, client_request_id) values (''  Padded  '', gen_random_uuid())', '23514')
  and public.test_fails('insert into public.groups (name, client_request_id) values (''Two  Spaces'', gen_random_uuid())', '23514'),
  'the table itself refuses a name that is not normalised');
select public.test_assert(public.test_fails(
  'insert into public.groups (name, client_request_id) values (E''Chess\u200BClub'', gen_random_uuid())', '23514')
  and public.test_fails('insert into public.groups (name, client_request_id) values (E''Chess Club\x07'', gen_random_uuid())', '23514'),
  'the table itself refuses invisible and control characters in a name');
select public.test_assert(public.test_fails(
  'insert into public.groups (name, client_request_id) values (''CHESS CLUB'', gen_random_uuid())', '23505'),
  'the table itself refuses a name that differs only by case');
select public.test_assert(
  (select bool_and(g.member_count = (select count(*) from public.group_members m where m.group_id = g.id)) from public.groups g),
  'every stored count equals the real number of members');

-- --- Ownership lifecycle: the owner deletes their account ---------------------------

-- g1: alice (owner), bob, carol, erin. gina is not a member.
delete from auth.users where id = :'alice';
select public.test_assert(
  (select status from public.groups where id = :'g1') = 'archived'
  and (select count(*) from public.groups where id in (:'g1', :'g3', :'g4', :'g5') and status = 'archived') = 4,
  'every group the deleted student owned is archived');
select public.test_assert((select creator_id from public.groups where id = :'g1') is null, 'the creator reference is cleared');
select public.test_assert(
  (select count(*) from public.group_members where group_id = :'g1') = 3
  and public.test_raw_count(:'g1') = 3
  and (select count(*) from public.group_members where group_id = :'g1' and role = 'owner') = 0,
  'the other members are kept, the count follows, and there is no owner');
select public.test_assert((select status from public.groups where id = :'g2') = 'active', 'groups owned by other students are untouched');

set role authenticated;
select public.test_login(:'gina');
select public.test_assert((select status from public.groups where id = :'g1') = 'archived', 'an archived group stays readable');
select public.test_assert(public.test_fails(format('select * from public.join_group(%L)', :'g1'), 'PG005'),
  'nobody can join an archived group');
select public.test_assert(public.test_raw_count(:'g1') = 3, 'the refused join left the count alone');
select public.test_assert(
  public.test_viewer_list(:'g1') = public.test_viewer_count(:'g1') and public.test_viewer_unavailable(:'g1') = 0
  and public.test_viewer_count(:'g1') = public.test_members(:'g1')
  and (select count(*) from public.list_group_members(:'g1') m where m.role = 'owner') = 0
  and (select my_role from public.get_group_viewer_summaries(array[:'g1']::uuid[])) is null,
  'an archived group still lists its members, has no owner, and shows its actual count');
select public.test_login(:'carol');
select public.test_assert(
  public.test_viewer_count(:'g1') = 3 and public.test_viewer_unavailable(:'g1') = 1 and public.test_viewer_list(:'g1') = 2
  and public.test_viewer_sees(:'g1', :'erin') = 0,
  'in an archived group a member with an unavailable member sees the actual count, one unavailable, and not who');
select public.test_login(:'gina');
select public.test_login(:'bob');
select already_member as bob_archived from public.join_group(:'g1') \gset
select public.test_assert(:'bob_archived'::boolean, 'an existing member of an archived group is still reported as a member');
select public.test_assert(public.leave_group(:'g1') is true, 'a member can leave an archived group');
select public.test_assert(public.test_fails(format('select * from public.join_group(%L)', :'g1'), 'PG005'),
  'and cannot come back');
-- The archived name stays taken: the group still exists.
select public.test_assert(public.test_fails(format('select * from public.create_group_idempotent(gen_random_uuid(), %L, null)', 'Study Group'), 'PG001'),
  'the name of an archived group is still taken');
-- The deleted account's old identifier gives no access.
select public.test_login(:'alice');
select public.test_assert(public.test_fails(format('select * from public.create_group_idempotent(gen_random_uuid(), %L, null)', 'Ghost Group'), '42501')
  and public.test_fails(format('select * from public.join_group(%L)', :'g2'), '42501'),
  'the deleted identifier can neither create nor join');
select public.test_assert(public.leave_group(:'g1') is false, 'and has no membership to leave');

-- A plain member deleting their account archives nothing. The delete runs as the
-- role the hosted auth service uses, which has no privilege on the group tables or
-- on penguin_groups_private: the cascade and the trigger must work regardless.
reset role;
select exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') as has_auth_admin \gset
\if :has_auth_admin
select public.test_assert(
  not has_schema_privilege('supabase_auth_admin', 'penguin_groups_private', 'usage')
  and not has_table_privilege('supabase_auth_admin', 'public.group_members', 'delete'),
  'the auth service role has no direct access to groups');
-- Only a superuser may become that role, so this one statement runs from a
-- superuser connection.
\connect - supabase_admin
set role supabase_auth_admin;
\endif
delete from auth.users where id = :'erin';
\if :has_auth_admin
\connect - postgres
\endif
select public.test_assert(
  public.test_raw_count(:'g1') = 1
  and (select count(*) from public.group_members where user_id = :'erin') = 0,
  'a deleted member is removed from their groups and the count follows');
select public.test_assert((select status from public.groups where id = :'g2') = 'active', 'which archives nothing');

-- Administrative removal of a group takes its memberships with it.
delete from public.groups where id = :'g1';
select public.test_assert((select count(*) from public.group_members where group_id = :'g1') = 0, 'removing a group removes its memberships');
select public.test_assert(
  (select bool_and(g.member_count = (select count(*) from public.group_members m where m.group_id = g.id)) from public.groups g),
  'every stored count still equals the real number of members');

\echo 'groups integration: all assertions passed'
