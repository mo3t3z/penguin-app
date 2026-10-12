-- Rollback rehearsal for the Sprint 7A groups migration. DESTRUCTIVE: it drops the
-- group tables and their data. Run only against the DISPOSABLE test database, from
-- tests/groups-db-verify.sh, never the hosted project.
--
-- It runs the rollback statements documented in docs/groups.md, checks that every
-- group object is gone and that nothing from earlier sprints was touched, and the
-- verify script then applies the migration again to prove it can be redeployed.
\set ON_ERROR_STOP on

-- Everything that exists outside the groups objects, before the rollback.
create temporary table before_rollback as
  select 'table ' || c.oid::regclass::text as object from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'penguin_private', 'penguin_chat_private') and c.relkind = 'r'
      and c.relname not in ('groups', 'group_members', 'group_bans', 'group_admin_events')
  union all
  select 'function ' || p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'penguin_private', 'penguin_chat_private')
      and p.proname not in ('create_group_idempotent', 'join_group', 'leave_group', 'get_group_viewer_summaries', 'list_group_members')
      and p.proname not like 'test\_%'
  union all
  select 'policy ' || tablename || '.' || policyname from pg_policies
    where schemaname in ('public', 'realtime', 'storage') and tablename not in ('groups', 'group_members', 'group_bans', 'group_admin_events')
  union all
  select 'trigger ' || tgrelid::regclass::text || '.' || tgname from pg_trigger
    where not tgisinternal and tgrelid::regclass::text not in ('groups', 'group_members', 'public.groups', 'public.group_members',
      'group_bans', 'group_admin_events', 'public.group_bans', 'public.group_admin_events');
create temporary table rows_before as
  select (select count(*) from public.profiles) as profiles, (select count(*) from public.user_blocks) as blocks,
         (select count(*) from public.conversations) as conversations, (select count(*) from public.messages) as messages;

-- The rollback, exactly as documented.
begin;
drop function public.create_group_idempotent(uuid, text, text);
drop function public.join_group(uuid);
drop function public.leave_group(uuid);
drop function public.get_group_viewer_summaries(uuid[]);
drop function public.list_group_members(uuid, timestamptz, uuid, integer);
drop table public.group_admin_events;
drop table public.group_bans;
drop table public.group_members;
drop table public.groups;
drop schema penguin_groups_private cascade;
commit;

select public.test_assert(
  to_regclass('public.groups') is null and to_regclass('public.group_members') is null
  and to_regclass('public.group_bans') is null and to_regclass('public.group_admin_events') is null
  and not exists (select 1 from pg_namespace where nspname = 'penguin_groups_private')
  and not exists (select 1 from pg_proc where proname in ('create_group_idempotent', 'join_group', 'leave_group', 'get_group_viewer_summaries', 'list_group_members', 'membership_changed', 'hidden_from'))
  and not exists (select 1 from pg_policies where tablename in ('groups', 'group_members')),
  'the rollback removes every group object');

create temporary table after_rollback as
  select 'table ' || c.oid::regclass::text as object from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'penguin_private', 'penguin_chat_private') and c.relkind = 'r'
  union all
  select 'function ' || p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'penguin_private', 'penguin_chat_private') and p.proname not like 'test\_%'
  union all
  select 'policy ' || tablename || '.' || policyname from pg_policies where schemaname in ('public', 'realtime', 'storage')
  union all
  select 'trigger ' || tgrelid::regclass::text || '.' || tgname from pg_trigger where not tgisinternal;

select public.test_assert(
  not exists (select object from before_rollback except select object from after_rollback),
  'no table, function, policy or trigger from earlier sprints was removed');
select public.test_assert(
  not exists (select object from after_rollback except select object from before_rollback),
  'and nothing was left behind');
select public.test_assert(
  (select (r.profiles, r.blocks, r.conversations, r.messages) = (
     (select count(*) from public.profiles), (select count(*) from public.user_blocks),
     (select count(*) from public.conversations), (select count(*) from public.messages)) from rows_before r),
  'row counts of profiles and chat tables are unchanged');
-- Accounts can still be deleted once the group tables are gone.
insert into auth.users (id) values ('00000000-0000-4000-8000-00000000aaaa');
delete from auth.users where id = '00000000-0000-4000-8000-00000000aaaa';
select public.test_assert(
  not exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-00000000aaaa'),
  'creating and deleting an account still works after the rollback');

\echo 'groups rollback: all assertions passed'
