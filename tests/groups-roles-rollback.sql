-- Rollback rehearsal for the Sprint 7B roles migration. DESTRUCTIVE: it removes
-- bans, demotes every admin and drops the administrative functions. Run only against
-- the DISPOSABLE test database, from tests/groups-db-verify.sh, never the hosted
-- project.
--
-- This is the "switch the feature off" rollback documented in docs/groups.md. It
-- keeps what earlier app code relies on: join_group, leave_group and the two read
-- functions stay as the roles migration left them (they answer earlier app code
-- exactly as before), and the two new tables stay, empty of bans, because
-- join_group reads group_bans. The administration log is kept as a record.
\set ON_ERROR_STOP on

create temporary table counts_before as
  select g.id, g.member_count, (select count(*) from public.group_members m where m.group_id = g.id) as members
  from public.groups g;

-- The rollback, exactly as documented.
begin;
drop function public.promote_group_member(uuid, uuid);
drop function public.demote_group_admin(uuid, uuid);
drop function public.transfer_group_ownership(uuid, uuid);
drop function public.remove_group_member(uuid, uuid);
drop function public.ban_group_member(uuid, uuid);
drop function public.unban_group_member(uuid, uuid);
drop function public.update_group_details(uuid, text, text);
drop function public.list_group_bans(uuid, timestamptz, uuid, integer);
drop function public.list_group_admin_events(uuid, timestamptz, uuid, integer);
delete from public.group_bans;
update public.group_members set role = 'member' where role = 'admin';
alter table public.group_members drop constraint group_members_role_values;
alter table public.group_members
  add constraint group_members_role_values check (role in ('owner', 'member'));
commit;

select public.test_assert(
  not exists (select 1 from pg_proc where proname in ('promote_group_member', 'demote_group_admin', 'transfer_group_ownership',
    'remove_group_member', 'ban_group_member', 'unban_group_member', 'update_group_details', 'list_group_bans', 'list_group_admin_events')),
  'the administrative functions are gone');
select public.test_assert(
  (select count(*) from public.group_members where role not in ('owner', 'member')) = 0
  and (select count(*) from public.group_bans) = 0
  and public.test_fails(format('insert into public.group_members (group_id, user_id, role) values (%L, %L, %L)',
        (select id from public.groups limit 1), '00000000-0000-4000-8000-000000050021', 'admin'), '23514'),
  'no admin and no ban is left, and the admin role is refused again');
select public.test_assert(
  not exists (select 1 from counts_before b join public.groups g on g.id = b.id
              where g.member_count <> b.member_count
                 or (select count(*) from public.group_members m where m.group_id = g.id) <> b.members),
  'no membership was lost and every count is unchanged');
-- Joining, leaving and reading still work for a signed-in student.
set role authenticated;
select public.test_login('00000000-0000-4000-8000-000000050021');
select id as other_group from public.groups where name = 'Other Group' \gset
-- One statement each: the read functions are STABLE and would not see a join made
-- earlier in the same statement.
select public.test_assert(public.test_state(format('select * from public.join_group(%L)', :'other_group')) = 'ok',
  'joining still works after the rollback');
select public.test_assert(
  (select my_role from public.get_group_viewer_summaries(array[:'other_group']::uuid[])) = 'member'
  and (select count(*) from public.list_group_members(:'other_group')) >= 2,
  'reading still works after the rollback');
select public.test_assert(public.leave_group(:'other_group') is true, 'leaving still works after the rollback');
reset role;

\echo 'groups roles rollback: all assertions passed'
