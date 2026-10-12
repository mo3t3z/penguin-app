-- Executable database checks for Sprint 7B: roles, removal, bans, ownership
-- transfer, editing, limits, the administration history and their privacy rules,
-- against the REAL schema.
--
-- Run only against the DISPOSABLE database, after tests/groups-integration.sql (it
-- reuses that script's helpers): see tests/groups-db-verify.sh. Never the hosted
-- project. It ends by printing "groups roles integration: all assertions passed".
--
-- Concurrency needs several sessions: see tests/groups-concurrency.sh.
\set ON_ERROR_STOP on

-- Stored truth, whatever the current role.
create function public.test_ban(g uuid, u uuid) returns bigint language sql security definer set search_path = '' as
  $$ select count(*) from public.group_bans where group_id = g and user_id = u $$;
create function public.test_events(g uuid, a text) returns bigint language sql security definer set search_path = '' as
  $$ select count(*) from public.group_admin_events where group_id = g and action = a $$;
create function public.test_owners(g uuid) returns bigint language sql security definer set search_path = '' as
  $$ select count(*) from public.group_members where group_id = g and role = 'owner' $$;
create function public.test_admins(g uuid) returns bigint language sql security definer set search_path = '' as
  $$ select count(*) from public.group_members where group_id = g and role = 'admin' $$;
-- The SQLSTATE a statement fails with, or 'ok'. Anything it did is rolled back on failure.
create function public.test_state(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return 'ok';
exception when others then
  return sqlstate;
end;
$$;
grant execute on function public.test_ban(uuid, uuid), public.test_events(uuid, text), public.test_owners(uuid),
  public.test_admins(uuid), public.test_state(text) to authenticated, anon;

\set owner  '00000000-0000-4000-8000-000000050001'
\set amy    '00000000-0000-4000-8000-000000050002'
\set ben    '00000000-0000-4000-8000-000000050003'
\set m1     '00000000-0000-4000-8000-000000050011'
\set m2     '00000000-0000-4000-8000-000000050012'
\set m3     '00000000-0000-4000-8000-000000050013'
\set m4     '00000000-0000-4000-8000-000000050014'
\set m5     '00000000-0000-4000-8000-000000050015'
\set m6     '00000000-0000-4000-8000-000000050016'
\set outsider '00000000-0000-4000-8000-000000050021'
\set newbie '00000000-0000-4000-8000-000000050022'
\set other  '00000000-0000-4000-8000-000000050031'
\set busy   '00000000-0000-4000-8000-000000050041'
\set nowhere '00000000-0000-4000-8000-00000000dead'

insert into auth.users (id) values (:'owner'), (:'amy'), (:'ben'), (:'m1'), (:'m2'), (:'m3'), (:'m4'), (:'m5'), (:'m6'),
  (:'outsider'), (:'newbie'), (:'other'), (:'busy');
-- Extra accounts: 5xx for the admin cap, 6xx and 7xx for the removal limit.
insert into auth.users (id)
  select ('00000000-0000-4000-8000-0000000505' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 12) n;
insert into auth.users (id)
  select ('00000000-0000-4000-8000-0000000506' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 30) n;
update public.profiles p set
    username = 'role_' || right(replace(p.id::text, '-', ''), 6),
    display_name = 'Role ' || right(p.id::text, 4),
    institution_id = (select id from public.institutions order by slug limit 1),
    field_id = (select id from public.fields order by slug limit 1),
    study_level = 'undergraduate',
    onboarding_completed = true
  where p.id::text like '00000000-0000-4000-8000-0000000500%' and p.id <> :'newbie'
     or p.id::text like '00000000-0000-4000-8000-0000000505%'
     or p.id::text like '00000000-0000-4000-8000-0000000506%';

-- --- Grants ------------------------------------------------------------------------

select public.test_assert(
  not has_any_column_privilege('authenticated', 'public.group_bans', 'select')
  and not has_any_column_privilege('authenticated', 'public.group_admin_events', 'select')
  and not has_table_privilege('authenticated', 'public.group_bans', 'insert')
  and not has_table_privilege('authenticated', 'public.group_bans', 'update')
  and not has_table_privilege('authenticated', 'public.group_bans', 'delete')
  and not has_table_privilege('authenticated', 'public.group_admin_events', 'insert')
  and not has_table_privilege('authenticated', 'public.group_admin_events', 'update')
  and not has_table_privilege('authenticated', 'public.group_admin_events', 'delete')
  and not has_any_column_privilege('anon', 'public.group_bans', 'select')
  and not has_any_column_privilege('anon', 'public.group_admin_events', 'select'),
  'clients can neither read nor write bans or the administration log');
select public.test_assert(
  (select relrowsecurity from pg_class where oid = 'public.group_bans'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.group_admin_events'::regclass)
  and (select count(*) from pg_policies where tablename in ('group_bans', 'group_admin_events')) = 0,
  'both tables have row-level security on and no policy at all');
select public.test_assert(
  (select bool_and(not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute')
                   and p.prosecdef and p.proconfig @> array['search_path=""'])
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('promote_group_member', 'demote_group_admin', 'transfer_group_ownership',
      'remove_group_member', 'ban_group_member', 'unban_group_member', 'update_group_details',
      'list_group_bans', 'list_group_admin_events', 'join_group', 'leave_group', 'list_group_members', 'get_group_viewer_summaries'))
  and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('promote_group_member', 'demote_group_admin', 'transfer_group_ownership',
      'remove_group_member', 'ban_group_member', 'unban_group_member', 'update_group_details',
      'list_group_bans', 'list_group_admin_events', 'join_group', 'leave_group', 'list_group_members', 'get_group_viewer_summaries')) = 13,
  'every group function is a definer with an empty search path, open to signed-in students and closed to anonymous ones');
select public.test_assert(
  (select bool_and(not has_function_privilege('authenticated', p.oid, 'execute'))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'penguin_groups_private')
  and not has_schema_privilege('authenticated', 'penguin_groups_private', 'usage'),
  'no internal helper is callable by clients');
select public.test_assert(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('promote_group_member', 'demote_group_admin', 'transfer_group_ownership',
      'remove_group_member', 'ban_group_member', 'unban_group_member', 'update_group_details')
      and p.proargnames::text ~ 'role') = 0,
  'no administrative function accepts a role');
select public.test_assert(
  (select count(*) from pg_publication_tables where schemaname = 'public' and tablename in ('group_bans', 'group_admin_events')) = 0,
  'the new tables are not streamed over Realtime');

-- --- Setup: one group with an owner and six members ---------------------------------

set role authenticated;
select public.test_login(:'owner');
select id as g from public.create_group_idempotent(gen_random_uuid(), 'Roles Group', 'For role tests.') \gset
select public.test_login(:'other');
select id as g2 from public.create_group_idempotent(gen_random_uuid(), 'Other Group', null) \gset
select public.test_login(:'amy'); select count(*) as ignored from public.join_group(:'g') \gset
select public.test_login(:'ben'); select count(*) as ignored from public.join_group(:'g') \gset
select public.test_login(:'m1');  select count(*) as ignored from public.join_group(:'g') \gset
select public.test_login(:'m2');  select count(*) as ignored from public.join_group(:'g') \gset
select public.test_login(:'m3');  select count(*) as ignored from public.join_group(:'g') \gset
select public.test_login(:'m4');  select count(*) as ignored from public.join_group(:'g') \gset
select public.test_login(:'m5');  select count(*) as ignored from public.join_group(:'g') \gset
select public.test_login(:'m6');  select count(*) as ignored from public.join_group(:'g') \gset
select public.test_assert(public.test_raw_count(:'g') = 9 and public.test_owners(:'g') = 1, 'the group starts with an owner and eight members');

-- --- Promotion: owner only -----------------------------------------------------------

select public.test_login(:'m1');
select public.test_assert(
  public.test_state(format('select public.promote_group_member(%L, %L)', :'g', :'m1')) = '42501'
  and public.test_state(format('select public.promote_group_member(%L, %L)', :'g', :'m2')) = '42501'
  and public.test_state(format('select public.demote_group_admin(%L, %L)', :'g', :'m2')) = '42501'
  and public.test_state(format('select public.remove_group_member(%L, %L)', :'g', :'m2')) = '42501'
  and public.test_state(format('select public.ban_group_member(%L, %L)', :'g', :'m2')) = '42501'
  and public.test_state(format('select public.unban_group_member(%L, %L)', :'g', :'m2')) = '42501'
  and public.test_state(format('select public.transfer_group_ownership(%L, %L)', :'g', :'m1')) = '42501'
  and public.test_state(format('select * from public.update_group_details(%L, %L, null)', :'g', 'Taken Over')) = '42501'
  and public.test_state(format('select * from public.list_group_bans(%L)', :'g')) = '42501'
  and public.test_state(format('select * from public.list_group_admin_events(%L)', :'g')) = '42501',
  'a member can perform no administrative action, on themselves or anyone else');
select public.test_login(:'outsider');
select public.test_assert(
  public.test_state(format('select public.promote_group_member(%L, %L)', :'g', :'outsider')) = '42501'
  and public.test_state(format('select public.remove_group_member(%L, %L)', :'g', :'m2')) = '42501'
  and public.test_state(format('select public.ban_group_member(%L, %L)', :'g', :'m2')) = '42501'
  and public.test_state(format('select public.transfer_group_ownership(%L, %L)', :'g', :'outsider')) = '42501'
  and public.test_state(format('select * from public.list_group_bans(%L)', :'g')) = '42501'
  and public.test_state(format('select * from public.list_group_admin_events(%L)', :'g')) = '42501',
  'a student who is not in the group can perform no administrative action');
-- The refusal is the same whether or not the target is a member: no membership test.
select public.test_assert(
  public.test_state(format('select public.remove_group_member(%L, %L)', :'g', :'m2'))
    = public.test_state(format('select public.remove_group_member(%L, %L)', :'g', :'nowhere')),
  'a caller who is not staff gets the same answer for a member and a non-member');
select public.test_login(:'newbie');
select public.test_assert(public.test_state(format('select public.promote_group_member(%L, %L)', :'g', :'m2')) = '42501',
  'a student who has not finished onboarding can perform no administrative action');
select public.test_logout();
select public.test_assert(
  public.test_state(format('select public.promote_group_member(%L, %L)', :'g', :'m2')) = '42501'
  and public.test_state(format('select public.remove_group_member(%L, %L)', :'g', :'m2')) = '42501'
  and public.test_state(format('select public.ban_group_member(%L, %L)', :'g', :'m2')) = '42501'
  and public.test_state(format('select public.unban_group_member(%L, %L)', :'g', :'m2')) = '42501'
  and public.test_state(format('select public.demote_group_admin(%L, %L)', :'g', :'m2')) = '42501'
  and public.test_state(format('select public.transfer_group_ownership(%L, %L)', :'g', :'m2')) = '42501'
  and public.test_state(format('select * from public.update_group_details(%L, %L, null)', :'g', 'No Session')) = '42501'
  and public.test_state(format('select * from public.list_group_bans(%L)', :'g')) = '42501'
  and public.test_state(format('select * from public.list_group_admin_events(%L)', :'g')) = '42501',
  'a request with no signed-in user is refused by every new function');
reset role;
set role anon;
select public.test_assert(
  public.test_state(format('select public.promote_group_member(%L, %L)', :'g', :'m2')) = '42501'
  and public.test_state(format('select public.remove_group_member(%L, %L)', :'g', :'m2')) = '42501'
  and public.test_state(format('select public.ban_group_member(%L, %L)', :'g', :'m2')) = '42501'
  and public.test_state(format('select * from public.list_group_bans(%L)', :'g')) = '42501'
  and public.test_state(format('select * from public.list_group_admin_events(%L)', :'g')) = '42501'
  and public.test_state('select count(*) from public.group_bans') = '42501'
  and public.test_state('select count(*) from public.group_admin_events') = '42501',
  'the anonymous role can call none of them and read neither table');
reset role;
select public.test_assert(public.test_role(:'g', :'m1') = 'member' and public.test_role(:'g', :'m2') = 'member'
  and public.test_raw_count(:'g') = 9 and (select count(*) from public.group_admin_events where group_id = :'g') = 0,
  'none of the refused requests changed anything or was logged as an action');

set role authenticated;
select public.test_login(:'owner');
select public.test_assert(public.promote_group_member(:'g', :'amy') = 'admin' and public.test_role(:'g', :'amy') = 'admin',
  'the owner makes a member an admin');
select public.test_assert(public.promote_group_member(:'g', :'amy') = 'admin' and public.test_events(:'g', 'member_promoted') = 1,
  'promoting an admin again changes nothing and is logged once');
select public.test_assert(
  public.test_state(format('select public.promote_group_member(%L, %L)', :'g', :'owner')) = 'PG009'
  and public.test_state(format('select public.demote_group_admin(%L, %L)', :'g', :'owner')) = 'PG009'
  and public.test_state(format('select public.remove_group_member(%L, %L)', :'g', :'owner')) = 'PG009'
  and public.test_state(format('select public.ban_group_member(%L, %L)', :'g', :'owner')) = 'PG009'
  and public.test_state(format('select public.transfer_group_ownership(%L, %L)', :'g', :'owner')) = 'PG009',
  'the owner cannot promote, demote, remove, ban or transfer to themselves');
select public.test_assert(
  public.test_state(format('select public.promote_group_member(%L, %L)', :'g', :'outsider')) = 'PG008'
  and public.test_state(format('select public.promote_group_member(%L, %L)', :'g', :'nowhere')) = 'PG008'
  and public.test_state(format('select public.promote_group_member(%L, %L)', :'nowhere', :'m1')) = 'PG004'
  and public.test_state(format('select public.promote_group_member(null, %L)', :'m1')) = '22023'
  and public.test_state(format('select public.promote_group_member(%L, null)', :'g')) = '22023'
  and public.test_state(format('select public.promote_group_member(%L, %L)', :'g2', :'other')) = '42501',
  'promotion refuses a non-member, a missing group, missing arguments and another student''s group');
select public.test_assert(
  public.test_state(format('select public.promote_group_member(%L, %L, %L)', :'g', :'m1', 'owner')) = '42883'
  and public.test_state(format('update public.group_members set role = %L where group_id = %L', 'owner', :'g')) = '42501'
  and public.test_state(format('insert into public.group_members (group_id, user_id, role) values (%L, %L, %L)', :'g', :'outsider', 'admin')) = '42501',
  'a role cannot be named in a request or written directly');

-- What old and new app code see for an admin.
select public.test_login(:'amy');
select public.test_assert(
  (select my_role from public.get_group_viewer_summaries(array[:'g']::uuid[])) = 'member'
  and (select my_group_role from public.get_group_viewer_summaries(array[:'g']::uuid[])) = 'admin',
  'an admin''s summary reports member in the earlier column and admin in the new one');
select public.test_assert(
  (select m.role from public.list_group_members(:'g') m where m.user_id = :'amy') = 'member'
  and (select m.group_role from public.list_group_members(:'g') m where m.user_id = :'amy') = 'admin'
  and (select m.role from public.list_group_members(:'g') m where m.user_id = :'owner') = 'owner'
  and (select m.group_role from public.list_group_members(:'g') m where m.user_id = :'owner') = 'owner'
  and (select count(*) from public.list_group_members(:'g') m where m.role not in ('owner', 'member')) = 0,
  'the member list does the same, so earlier app code never meets a role it does not know');
select already_member as amy_already, role as amy_join_role from public.join_group(:'g') \gset
select public.test_assert(:'amy_already'::boolean and public.test_role(:'g', :'amy') = 'admin', 'an admin joining again stays an admin');

-- An admin cannot do what only the owner may.
select public.test_assert(
  public.test_state(format('select public.promote_group_member(%L, %L)', :'g', :'m1')) = '42501'
  and public.test_state(format('select public.promote_group_member(%L, %L)', :'g', :'amy')) = '42501'
  and public.test_state(format('select public.demote_group_admin(%L, %L)', :'g', :'amy')) = '42501'
  and public.test_state(format('select public.transfer_group_ownership(%L, %L)', :'g', :'amy')) = '42501'
  and public.test_state(format('select * from public.update_group_details(%L, %L, null)', :'g', 'Admin Rename')) = '42501',
  'an admin cannot promote, demote, take ownership or edit the group');

-- Demotion.
select public.test_login(:'owner');
select public.test_assert(public.demote_group_admin(:'g', :'amy') = 'member' and public.test_role(:'g', :'amy') = 'member',
  'the owner makes an admin a member again');
select public.test_assert(public.demote_group_admin(:'g', :'amy') = 'member' and public.test_events(:'g', 'admin_demoted') = 1,
  'demoting a member changes nothing and is logged once');
select public.test_assert(public.test_raw_count(:'g') = 9 and public.test_members(:'g') = 9, 'role changes never move the member count');

-- --- Admin cap ------------------------------------------------------------------------

reset role;
insert into public.group_members (group_id, user_id)
  select :'g', ('00000000-0000-4000-8000-0000000505' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 12) n;
set role authenticated;
select public.test_login(:'owner');
select count(*) as ignored from (
  select public.promote_group_member(:'g', ('00000000-0000-4000-8000-0000000505' || lpad(n::text, 2, '0'))::uuid) from generate_series(1, 10) n
) promoted \gset
select public.test_assert(public.test_admins(:'g') = 10, 'a group can have ten admins');
select public.test_assert(
  public.test_state(format('select public.promote_group_member(%L, %L)', :'g', '00000000-0000-4000-8000-000000050511')) = 'PG011'
  and public.test_admins(:'g') = 10, 'the eleventh admin is refused');
select public.test_assert(public.promote_group_member(:'g', '00000000-0000-4000-8000-000000050501') = 'admin',
  'promoting an existing admin still succeeds at the limit');
select public.test_assert(public.demote_group_admin(:'g', '00000000-0000-4000-8000-000000050501') = 'member'
  and public.promote_group_member(:'g', '00000000-0000-4000-8000-000000050511') = 'admin' and public.test_admins(:'g') = 10,
  'demoting one admin makes room for another');
-- Back to a small staff: amy and ben are the admins from here on.
reset role;
delete from public.group_members where group_id = :'g' and user_id::text like '00000000-0000-4000-8000-0000000505%';
delete from public.group_admin_events where group_id = :'g';
set role authenticated;
select public.test_login(:'owner');
select public.test_assert(public.promote_group_member(:'g', :'amy') = 'admin' and public.promote_group_member(:'g', :'ben') = 'admin'
  and public.test_raw_count(:'g') = 9, 'two admins are in place');

-- --- Removal and the role hierarchy ----------------------------------------------------

select public.test_login(:'amy');
select public.test_assert(
  public.test_state(format('select public.remove_group_member(%L, %L)', :'g', :'ben')) = 'PG009'
  and public.test_state(format('select public.remove_group_member(%L, %L)', :'g', :'owner')) = 'PG009'
  and public.test_state(format('select public.remove_group_member(%L, %L)', :'g', :'amy')) = 'PG009'
  and public.test_state(format('select public.ban_group_member(%L, %L)', :'g', :'ben')) = 'PG009'
  and public.test_state(format('select public.ban_group_member(%L, %L)', :'g', :'owner')) = 'PG009'
  and public.test_state(format('select public.ban_group_member(%L, %L)', :'g', :'amy')) = 'PG009',
  'an admin cannot remove or ban the owner, another admin or themselves');
select public.test_assert(
  public.test_state(format('select public.remove_group_member(%L, %L)', :'g', :'outsider')) = 'PG008'
  and public.test_state(format('select public.ban_group_member(%L, %L)', :'g', :'outsider')) = 'PG008'
  and public.test_state(format('select public.remove_group_member(%L, %L)', :'g2', :'other')) = '42501'
  and public.test_state(format('select public.remove_group_member(%L, null)', :'g')) = '22023',
  'removal refuses a non-member, another group and a missing argument');
select public.test_assert(public.remove_group_member(:'g', :'m1') is true
  and public.test_has_member(:'g', :'m1') = 0 and public.test_raw_count(:'g') = 8 and public.test_members(:'g') = 8
  and public.test_events(:'g', 'member_removed') = 1 and public.test_ban(:'g', :'m1') = 0,
  'an admin removes a member: the membership is gone, the count follows, it is logged, and no ban is placed');
select public.test_assert(public.test_state(format('select public.remove_group_member(%L, %L)', :'g', :'m1')) = 'PG008',
  'removing them again finds nobody');
select public.test_login(:'m1');
select already_member as m1_back from public.join_group(:'g') \gset
select public.test_assert(not :'m1_back'::boolean and public.test_role(:'g', :'m1') = 'member' and public.test_raw_count(:'g') = 9,
  'a removed member may join again, as a plain member');
select public.test_login(:'owner');
select public.test_assert(public.remove_group_member(:'g', :'ben') is true and public.test_has_member(:'g', :'ben') = 0
  and public.test_raw_count(:'g') = 8, 'the owner removes an admin');
select public.test_login(:'ben');
select count(*) as ignored from public.join_group(:'g') \gset
select public.test_assert(public.test_role(:'g', :'ben') = 'member', 'a removed admin who joins again is a plain member');
select public.test_login(:'owner');
select public.test_assert(public.promote_group_member(:'g', :'ben') = 'admin', 'and can be promoted again');

-- --- Bans --------------------------------------------------------------------------

select public.test_login(:'amy');
select public.test_assert(public.ban_group_member(:'g', :'m2') is true
  and public.test_has_member(:'g', :'m2') = 0 and public.test_ban(:'g', :'m2') = 1
  and public.test_raw_count(:'g') = 8 and public.test_members(:'g') = 8 and public.test_events(:'g', 'member_banned') = 1,
  'banning a member removes them and records the ban together');
select public.test_login(:'m2');
select public.test_assert(public.test_state(format('select * from public.join_group(%L)', :'g')) = 'PG007'
  and public.test_has_member(:'g', :'m2') = 0 and public.test_raw_count(:'g') = 8,
  'a banned student cannot join again');
select public.test_assert(public.leave_group(:'g') is false, 'and has nothing to leave');
select already_member as m2_elsewhere from public.join_group(:'g2') \gset
select public.test_assert(not :'m2_elsewhere'::boolean, 'a ban covers one group only');
-- A student who already left cannot be banned.
select public.test_login(:'m5');
select public.test_assert(public.leave_group(:'g') is true, 'a member leaves');
select public.test_login(:'amy');
select public.test_assert(public.test_state(format('select public.ban_group_member(%L, %L)', :'g', :'m5')) = 'PG008'
  and public.test_ban(:'g', :'m5') = 0,
  'a student who has already left is answered like any non-member and is not banned');
select public.test_login(:'m5');
select count(*) as ignored from public.join_group(:'g') \gset
-- Owner bans: a member, and an admin.
select public.test_login(:'owner');
select public.test_assert(public.ban_group_member(:'g', :'m6') is true and public.ban_group_member(:'g', :'ben') is true
  and public.test_ban(:'g', :'ben') = 1 and public.test_has_member(:'g', :'ben') = 0,
  'the owner bans a member and an admin');
reset role;
select public.test_assert(
  (select banned_role from public.group_bans where group_id = :'g' and user_id = :'ben') = 'admin'
  and (select banned_role from public.group_bans where group_id = :'g' and user_id = :'m6') = 'member'
  and (select banned_by from public.group_bans where group_id = :'g' and user_id = :'m2') = :'amy',
  'a ban records the role held and who placed it');
select public.test_assert(public.test_state(format(
  'insert into public.group_bans (group_id, user_id, banned_role) values (%L, %L, %L)', :'g', :'outsider', 'owner')) = '23514',
  'an owner can never be recorded as banned');
set role authenticated;

-- The ban list.
select public.test_login(:'amy');
select public.test_assert(
  (select count(*) from public.list_group_bans(:'g')) = 3
  and (select can_unban from public.list_group_bans(:'g') b where b.banned_id = :'m2')
  and not (select can_unban from public.list_group_bans(:'g') b where b.banned_id = :'m6')
  and not (select can_unban from public.list_group_bans(:'g') b where b.banned_id = :'ben'),
  'an admin sees the bans and may lift only the one they placed on a member');
select public.test_assert(
  (select proargnames[5:10] from pg_proc where proname = 'list_group_bans')
    = array['banned_id', 'username', 'display_name', 'avatar_url', 'banned_at', 'can_unban'],
  'the ban list never says who placed a ban');
select banned_id as ban_last_id, banned_at as ban_last_at from public.list_group_bans(:'g', null, null, 2) offset 1 \gset
select public.test_assert(
  (select count(*) from public.list_group_bans(:'g', null, null, 2)) = 2
  and (select count(*) from public.list_group_bans(:'g', :'ban_last_at', :'ban_last_id', 51)) = 1
  and public.test_state(format('select * from public.list_group_bans(%L, null, null, 52)', :'g')) = '22023'
  and public.test_state(format('select * from public.list_group_bans(%L, now(), null, 10)', :'g')) = '22023',
  'the ban list pages without repeating anyone and refuses a bad page');
-- Unban.
select public.test_assert(
  public.test_state(format('select public.unban_group_member(%L, %L)', :'g', :'m6')) = 'PG009'
  and public.test_state(format('select public.unban_group_member(%L, %L)', :'g', :'ben')) = 'PG009'
  and public.test_state(format('select public.unban_group_member(%L, %L)', :'g', :'outsider')) = 'PG008'
  and public.test_ban(:'g', :'m6') = 1 and public.test_ban(:'g', :'ben') = 1,
  'an admin cannot lift the owner''s bans, and lifting a ban that does not exist finds nobody');
select public.test_assert(public.unban_group_member(:'g', :'m2') is true and public.test_ban(:'g', :'m2') = 0
  and public.test_has_member(:'g', :'m2') = 0 and public.test_raw_count(:'g') = 6 and public.test_events(:'g', 'member_unbanned') = 1,
  'lifting a ban removes the ban and does not restore the membership');
select public.test_login(:'m2');
select already_member as m2_back from public.join_group(:'g') \gset
select public.test_assert(not :'m2_back'::boolean and public.test_role(:'g', :'m2') = 'member', 'the student may then join again themselves');
select public.test_login(:'owner');
select public.test_assert(public.unban_group_member(:'g', :'ben') is true and public.unban_group_member(:'g', :'m6') is true,
  'the owner lifts any ban');
select public.test_login(:'ben'); select count(*) as ignored from public.join_group(:'g') \gset
select public.test_login(:'m6');  select count(*) as ignored from public.join_group(:'g') \gset
select public.test_login(:'owner');
select public.test_assert(public.promote_group_member(:'g', :'ben') = 'admin' and public.test_raw_count(:'g') = 9
  and public.test_members(:'g') = 9, 'the group is back to an owner, two admins and six members');

-- --- Blocking: an unavailable student is answered like a non-member ---------------------

-- m3 blocks the owner. Neither is listed to the other.
select public.test_login(:'m3');
select public.block_user(:'owner');
select public.test_login(:'owner');
select public.test_assert(
  public.test_state(format('select public.remove_group_member(%L, %L)', :'g', :'m3')) = 'PG008'
  and public.test_state(format('select public.ban_group_member(%L, %L)', :'g', :'m3')) = 'PG008'
  and public.test_state(format('select public.promote_group_member(%L, %L)', :'g', :'m3')) = 'PG008'
  and public.test_state(format('select public.demote_group_admin(%L, %L)', :'g', :'m3')) = 'PG008'
  and public.test_state(format('select public.transfer_group_ownership(%L, %L)', :'g', :'m3')) = 'PG008',
  'the owner gets "not found" for a member who blocked them, in every action');
select public.test_assert(
  public.test_state(format('select public.remove_group_member(%L, %L)', :'g', :'m3'))
    = public.test_state(format('select public.remove_group_member(%L, %L)', :'g', :'outsider'))
  and public.test_state(format('select public.ban_group_member(%L, %L)', :'g', :'m3'))
    = public.test_state(format('select public.ban_group_member(%L, %L)', :'g', :'outsider'))
  and public.test_state(format('select public.promote_group_member(%L, %L)', :'g', :'m3'))
    = public.test_state(format('select public.promote_group_member(%L, %L)', :'g', :'nowhere')),
  'which is exactly the answer for a student who is not in the group: membership cannot be tested');
select public.test_assert(public.test_has_member(:'g', :'m3') = 1 and public.test_role(:'g', :'m3') = 'member'
  and public.test_ban(:'g', :'m3') = 0 and public.test_viewer_count(:'g') = 9 and public.test_viewer_unavailable(:'g') = 1
  and public.test_viewer_sees(:'g', :'m3') = 0,
  'nothing happened to that member, the count is still actual, and they are still not listed');
-- The other direction: the owner blocks m4.
select public.block_user(:'m4');
select public.test_assert(
  public.test_state(format('select public.remove_group_member(%L, %L)', :'g', :'m4')) = 'PG008'
  and public.test_state(format('select public.ban_group_member(%L, %L)', :'g', :'m4')) = 'PG008'
  and public.test_state(format('select public.promote_group_member(%L, %L)', :'g', :'m4')) = 'PG008',
  'the same holds for a member the owner has blocked');
-- Another staff member, with no block, can still act.
select public.test_login(:'amy');
select public.test_assert(public.test_viewer_sees(:'g', :'m3') = 1 and public.remove_group_member(:'g', :'m3') is true
  and public.test_has_member(:'g', :'m3') = 0, 'an admin with no block can remove that member');
select public.test_login(:'m3');
select count(*) as ignored from public.join_group(:'g') \gset

-- A hidden admin. m4 blocks ben (an admin).
select public.test_login(:'m4');
select public.block_user(:'ben');
select public.test_assert(
  public.test_viewer_sees(:'g', :'ben') = 0
  and (select count(*) from public.list_group_members(:'g') m where m.group_role = 'admin') = 1
  and (select count(*) from public.list_group_members(:'g') m where m.user_id in (:'ben', :'owner')) = 0
  and (select count(*) from public.list_group_members(:'g') m where m.group_role = 'owner') = 0
  and public.test_viewer_count(:'g') = 9 and public.test_viewer_unavailable(:'g') = 2,
  'a hidden admin and a hidden owner are not listed and nothing shows their roles; the count stays actual');
select public.test_assert(
  (select my_group_role from public.get_group_viewer_summaries(array[:'g']::uuid[])) = 'member'
  and (select proargnames[2:6] from pg_proc where proname = 'get_group_viewer_summaries')
    = array['group_id', 'member_count', 'unavailable_member_count', 'my_role', 'my_group_role'],
  'a summary still carries only numbers and the caller''s own role');
select public.test_login(:'ben');
select public.test_assert(
  public.test_state(format('select public.remove_group_member(%L, %L)', :'g', :'m4')) = 'PG008'
  and public.test_state(format('select public.ban_group_member(%L, %L)', :'g', :'m4')) = 'PG008'
  and public.test_has_member(:'g', :'m4') = 1,
  'the hidden admin gets "not found" for the member who blocked them');

-- Bans and blocks. amy bans m5; m5 then blocks amy.
select public.test_login(:'amy');
select public.test_assert(public.ban_group_member(:'g', :'m5') is true, 'amy bans m5');
select public.test_login(:'m5');
select public.block_user(:'amy');
select public.test_login(:'amy');
select public.test_assert(
  (select count(*) from public.list_group_bans(:'g') b where b.banned_id = :'m5') = 0
  and public.test_state(format('select public.unban_group_member(%L, %L)', :'g', :'m5')) = 'PG008'
  and public.test_ban(:'g', :'m5') = 1,
  'a banned student who is unavailable to the caller is not listed and cannot be found to unban');
select public.test_assert(
  (select count(*) from public.list_group_admin_events(:'g') e where e.target_username = (select username from public.profiles where id = :'m5')) = 0,
  'and their entries are left out of the history the caller sees');
select public.test_login(:'owner');
select public.test_assert(
  (select count(*) from public.list_group_bans(:'g') b where b.banned_id = :'m5') = 1
  and (select can_unban from public.list_group_bans(:'g') b where b.banned_id = :'m5')
  and public.unban_group_member(:'g', :'m5') is true,
  'the owner, with no block, sees that ban and lifts it');
select public.test_login(:'m5');
select public.unblock_user(:'amy');
select count(*) as ignored from public.join_group(:'g') \gset
-- Clear the blocks used above.
select public.test_login(:'m3'); select public.unblock_user(:'owner');
select public.test_login(:'m4'); select public.unblock_user(:'ben');
select public.test_login(:'owner'); select public.unblock_user(:'m4');
select public.test_assert(public.test_viewer_unavailable(:'g') = 0 and public.test_viewer_count(:'g') = 9
  and public.test_viewer_list(:'g') = 9, 'with the blocks lifted everybody is listed again and the count never moved');

-- --- The administration history ------------------------------------------------------

select public.test_assert(
  (select count(distinct e.action) from public.list_group_admin_events(:'g', null, null, 51) e) >= 4
  and (select count(*) from public.list_group_admin_events(:'g', null, null, 51) e where e.action = 'member_promoted') >= 2,
  'the owner sees every kind of action');
select public.test_assert(
  (select proargnames[5:14] from pg_proc where proname = 'list_group_admin_events')
    = array['id', 'action', 'created_at', 'actor_username', 'actor_display_name', 'actor_missing',
            'target_username', 'target_display_name', 'target_missing', 'detail'],
  'the history returns names and never an account identifier');
select id as ev_last_id, created_at as ev_last_at from public.list_group_admin_events(:'g', null, null, 3) offset 2 \gset
select public.test_assert(
  (select count(*) from public.list_group_admin_events(:'g', null, null, 3)) = 3
  and not exists (
    select 1 from public.list_group_admin_events(:'g', null, null, 3) a
    join public.list_group_admin_events(:'g', :'ev_last_at', :'ev_last_id', 51) b on a.id = b.id)
  and (select count(*) from public.list_group_admin_events(:'g', null, null, 3))
      + (select count(*) from public.list_group_admin_events(:'g', :'ev_last_at', :'ev_last_id', 51))
      = (select count(*) from public.list_group_admin_events(:'g', null, null, 51))
  and public.test_state(format('select * from public.list_group_admin_events(%L, null, null, 0)', :'g')) = '22023'
  and public.test_state(format('select * from public.list_group_admin_events(%L, null, %L, 10)', :'g', :'nowhere')) = '22023',
  'the history pages without repeating or skipping an entry and refuses a bad page');
select public.test_login(:'amy');
select public.test_assert(
  (select count(*) from public.list_group_admin_events(:'g', null, null, 51)) > 0
  and (select count(*) from public.list_group_admin_events(:'g', null, null, 51) e
        where e.action not in ('member_removed', 'member_banned', 'member_unbanned')) = 0,
  'an admin sees removals, bans and unbans only');
select public.test_login(:'owner');
select public.test_assert(public.demote_group_admin(:'g', :'amy') = 'member', 'amy is demoted');
select public.test_login(:'amy');
select public.test_assert(
  public.test_state(format('select * from public.list_group_admin_events(%L)', :'g')) = '42501'
  and public.test_state(format('select * from public.list_group_bans(%L)', :'g')) = '42501'
  and public.test_state(format('select public.remove_group_member(%L, %L)', :'g', :'m1')) = '42501',
  'a former admin loses the history, the ban list and every action at once');
select public.test_login(:'owner');
select public.test_assert(public.promote_group_member(:'g', :'amy') = 'admin', 'amy is an admin again');

-- --- Group information ------------------------------------------------------------

select name as new_name, description as new_description from public.update_group_details(:'g', E'  Roles \t Group  Two ', '  Edited.  ') \gset
select public.test_assert(:'new_name' = 'Roles Group Two' and :'new_description' = 'Edited.'
  and public.test_events(:'g', 'details_updated') = 1, 'the owner edits the name and description, normalised as on creation');
select public.test_assert(
  (select e.detail from public.list_group_admin_events(:'g', null, null, 51) e where e.action = 'details_updated') = 'Roles Group Two',
  'the history shows the new name');
select count(*) as ignored from public.update_group_details(:'g', 'Roles Group Two', 'Edited.') \gset
select public.test_assert(public.test_events(:'g', 'details_updated') = 1, 'sending the same values changes and logs nothing');
select count(*) as ignored from public.update_group_details(:'g', 'ROLES group two', null) \gset
select public.test_assert((select name from public.groups where id = :'g') = 'ROLES group two'
  and (select description from public.groups where id = :'g') is null,
  'a group may change the letter case of its own name, and clear its description');
select public.test_assert(
  public.test_state(format('select * from public.update_group_details(%L, %L, null)', :'g', 'other GROUP')) = 'PG001'
  and public.test_state(format('select * from public.update_group_details(%L, %L, null)', :'g', 'ab')) = '23514'
  and public.test_state(format('select * from public.update_group_details(%L, %L, null)', :'g', E'Roles\u200BGroup')) = '23514'
  and public.test_state(format('select * from public.update_group_details(%L, %L, %L)', :'g', 'Valid Name', repeat('d', 501))) = '23514'
  and public.test_state(format('select * from public.update_group_details(%L, null, null)', :'g')) = '22023'
  and public.test_state(format('select * from public.update_group_details(%L, %L, null)', :'g2', 'Not Mine')) = '42501'
  and public.test_state(format('update public.groups set name = %L where id = %L', 'Direct Edit', :'g')) = '42501',
  'editing refuses a taken name, an invalid one, another group, and a direct table write');
select public.test_assert((select name from public.groups where id = :'g') = 'ROLES group two', 'the refused edits changed nothing');

-- --- Ownership transfer ---------------------------------------------------------------

select public.test_assert(
  public.test_state(format('select public.transfer_group_ownership(%L, %L)', :'g', :'m1')) = 'PG012'
  and public.test_state(format('select public.transfer_group_ownership(%L, %L)', :'g', :'outsider')) = 'PG008'
  and public.test_state(format('select public.transfer_group_ownership(%L, null)', :'g')) = '22023'
  and public.test_owners(:'g') = 1 and public.test_role(:'g', :'owner') = 'owner',
  'ownership goes only to an existing admin');
select public.test_assert(public.test_state(format('select public.leave_group(%L)', :'g')) = 'PG006', 'the owner still cannot leave');
select public.test_assert(public.transfer_group_ownership(:'g', :'amy') is true
  and public.test_role(:'g', :'amy') = 'owner' and public.test_role(:'g', :'owner') = 'admin'
  and public.test_owners(:'g') = 1 and public.test_admins(:'g') = 2 and public.test_raw_count(:'g') = 9
  and public.test_events(:'g', 'ownership_transferred') = 1 and (select status from public.groups where id = :'g') = 'active',
  'transfer makes the admin the owner and the owner an admin: exactly one owner, same members, group still active');
select public.test_assert(
  public.test_state(format('select public.transfer_group_ownership(%L, %L)', :'g', :'owner')) = '42501'
  and public.test_state(format('select public.promote_group_member(%L, %L)', :'g', :'m1')) = '42501'
  and public.test_state(format('select * from public.update_group_details(%L, %L, null)', :'g', 'Old Owner Edit')) = '42501',
  'the previous owner has no owner powers left');
select public.test_assert(public.leave_group(:'g') is true and public.test_has_member(:'g', :'owner') = 0
  and public.test_raw_count(:'g') = 8 and (select status from public.groups where id = :'g') = 'active',
  'the previous owner can now leave, and the group stays active');
select public.test_login(:'amy');
select public.test_assert(
  (select my_role from public.get_group_viewer_summaries(array[:'g']::uuid[])) = 'owner'
  and (select my_group_role from public.get_group_viewer_summaries(array[:'g']::uuid[])) = 'owner'
  and public.test_state(format('select public.leave_group(%L)', :'g')) = 'PG006'
  and public.promote_group_member(:'g', :'m1') = 'admin',
  'the new owner is the owner in every column, cannot leave, and can promote');
select public.test_login(:'ben');
select public.test_assert(public.leave_group(:'g') is true and public.test_raw_count(:'g') = 7, 'an admin leaves like any member');

-- --- Removal limit --------------------------------------------------------------------

select public.test_login(:'busy');
select id as g3 from public.create_group_idempotent(gen_random_uuid(), 'Busy Group', null) \gset
select id as g4 from public.create_group_idempotent(gen_random_uuid(), 'Busy Group Two', null) \gset
reset role;
insert into public.group_members (group_id, user_id)
  select :'g3', ('00000000-0000-4000-8000-0000000506' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 25) n;
insert into public.group_members (group_id, user_id)
  select :'g4', ('00000000-0000-4000-8000-0000000506' || lpad(n::text, 2, '0'))::uuid from generate_series(26, 30) n;
set role authenticated;
select public.test_login(:'busy');
select count(*) as ignored from (
  select public.remove_group_member(:'g3', ('00000000-0000-4000-8000-0000000506' || lpad(n::text, 2, '0'))::uuid) from generate_series(1, 12) n
) removed \gset
select count(*) as ignored from (
  select public.ban_group_member(:'g3', ('00000000-0000-4000-8000-0000000506' || lpad(n::text, 2, '0'))::uuid) from generate_series(13, 20) n
) banned \gset
select public.test_assert(public.test_raw_count(:'g3') = 6 and public.test_members(:'g3') = 6, 'twenty removals and bans in an hour are allowed');
select public.test_assert(
  public.test_state(format('select public.remove_group_member(%L, %L)', :'g3', '00000000-0000-4000-8000-000000050621')) = 'PG010'
  and public.test_state(format('select public.ban_group_member(%L, %L)', :'g3', '00000000-0000-4000-8000-000000050621')) = 'PG010'
  and public.test_state(format('select public.remove_group_member(%L, %L)', :'g4', '00000000-0000-4000-8000-000000050626')) = 'PG010'
  and public.test_raw_count(:'g3') = 6 and public.test_raw_count(:'g4') = 6 and public.test_ban(:'g3', '00000000-0000-4000-8000-000000050621') = 0,
  'the twenty-first is refused, as a removal or a ban, in this group or another of the same actor');
select public.test_assert(
  public.unban_group_member(:'g3', '00000000-0000-4000-8000-000000050613') is true
  and public.promote_group_member(:'g3', '00000000-0000-4000-8000-000000050621') = 'admin',
  'the limit covers removals only: lifting a ban and promoting still work');
reset role;
-- The window slides: once a removal is older than an hour it no longer counts.
update public.group_admin_events set created_at = created_at - interval '61 minutes'
  where actor_id = :'busy' and target_id = '00000000-0000-4000-8000-000000050601';
set role authenticated;
select public.test_login(:'busy');
select public.test_assert(public.remove_group_member(:'g3', '00000000-0000-4000-8000-000000050622') is true
  and public.test_state(format('select public.remove_group_member(%L, %L)', :'g3', '00000000-0000-4000-8000-000000050623')) = 'PG010',
  'one removal ages out of the hour and exactly one more is allowed');
-- Another actor has their own allowance.
select public.test_login('00000000-0000-4000-8000-000000050621');
select public.test_assert(public.remove_group_member(:'g3', '00000000-0000-4000-8000-000000050623') is true,
  'the limit is per actor: an admin of the same group can still remove');

-- --- Archived groups reject administration ---------------------------------------------

-- g3: busy (owner), an admin (…621), members. The owner deletes their account.
reset role;
delete from auth.users where id = :'busy';
select public.test_assert(
  (select status from public.groups where id = :'g3') = 'archived' and public.test_owners(:'g3') = 0
  and public.test_role(:'g3', '00000000-0000-4000-8000-000000050621') = 'admin'
  and (select count(*) from public.group_admin_events where group_id = :'g3' and action = 'ownership_transferred') = 0,
  'deleting the owner archives the group and promotes nobody: the admin stays an admin');
select public.test_assert(
  (select count(*) from public.group_admin_events where group_id = :'g3' and actor_id is null) > 0
  and (select count(*) from public.group_bans where group_id = :'g3' and banned_by is null) > 0,
  'the log and the bans survive, without the deleted account');
set role authenticated;
select public.test_login('00000000-0000-4000-8000-000000050621');
select public.test_assert(
  public.test_state(format('select public.remove_group_member(%L, %L)', :'g3', '00000000-0000-4000-8000-000000050624')) = 'PG005'
  and public.test_state(format('select public.ban_group_member(%L, %L)', :'g3', '00000000-0000-4000-8000-000000050624')) = 'PG005'
  and public.test_state(format('select public.unban_group_member(%L, %L)', :'g3', '00000000-0000-4000-8000-000000050614')) = 'PG005'
  and public.test_state(format('select public.promote_group_member(%L, %L)', :'g3', '00000000-0000-4000-8000-000000050624')) = '42501'
  and public.test_state(format('select public.transfer_group_ownership(%L, %L)', :'g3', '00000000-0000-4000-8000-000000050621')) = '42501'
  and public.test_state(format('select * from public.update_group_details(%L, %L, null)', :'g3', 'Revived')) = '42501',
  'an archived group rejects every administrative change, and nobody can make themselves its owner');
select public.test_assert(
  (select count(*) from public.list_group_bans(:'g3')) > 0
  and (select bool_and(not b.can_unban) from public.list_group_bans(:'g3') b)
  and (select count(*) from public.list_group_admin_events(:'g3', null, null, 51)) > 0
  and (select bool_or(e.actor_missing) from public.list_group_admin_events(:'g3', null, null, 51) e),
  'its staff can still read the ban list (nothing can be lifted) and the history, where the deleted owner shows as missing');
select public.test_assert(public.test_state(format('select * from public.join_group(%L)', :'g3')) = 'ok'
  and public.leave_group(:'g3') is true, 'an admin of an archived group is still a member and can leave');
select public.test_login('00000000-0000-4000-8000-000000050614');
select public.test_assert(public.test_state(format('select * from public.join_group(%L)', :'g3')) = 'PG005',
  'nobody joins an archived group, banned or not');

-- --- Consistency ----------------------------------------------------------------------

reset role;
select public.test_assert(
  (select bool_and(g.member_count = (select count(*) from public.group_members m where m.group_id = g.id)) from public.groups g),
  'every stored count equals the real number of members');
select public.test_assert(
  (select bool_and((select count(*) from public.group_members m where m.group_id = g.id and m.role = 'owner')
                   = case when g.status = 'active' then 1 else 0 end) from public.groups g
    where g.creator_id is not null or g.status = 'archived' or exists (select 1 from public.group_members m where m.group_id = g.id and m.role = 'owner')),
  'every active group made by a student has exactly one owner, and no archived group has one');
select public.test_assert(
  not exists (select 1 from public.group_bans b join public.group_members m on m.group_id = b.group_id and m.user_id = b.user_id),
  'nobody is both banned from and a member of the same group');
select public.test_assert(
  (select max(n) from (select count(*) as n from public.group_members where role = 'admin' group by group_id) admins) <= 10,
  'no group has more than ten admins');
select public.test_assert(public.test_fails(format(
  'insert into public.group_members (group_id, user_id, role) values (%L, %L, %L)', :'g2', :'outsider', 'moderator'), '23514'),
  'only owner, admin and member are roles');

\echo 'groups roles integration: all assertions passed'
