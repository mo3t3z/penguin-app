-- Sprint 7A refinement: the member count is the real one.
--
-- NOT APPLIED to the hosted project. Apply only after approval.
--
-- Changes one function and nothing else. get_group_viewer_summaries used to return,
-- as member_count, the number of members the caller could see. It now returns:
--   member_count              the actual number of memberships, the same for every
--                             viewer and never reduced by a block;
--   unavailable_member_count  how many of those members the caller cannot see.
--
-- Only that aggregate number is returned. Nothing about an unavailable member
-- leaves the database: no identifier, role, join date or position.
-- list_group_members is unchanged and still leaves those members out entirely, so
-- for every viewer: members listed + unavailable_member_count = member_count.
--
-- Not changed: the tables, their policies and grants, the stored count and its
-- trigger, hidden_from, list_group_members, the three write functions, and
-- everything in messaging and Discover.
--
-- The return type changes, so the function is dropped and created again. Both
-- happen in this one transaction, so there is no moment without it. The earlier
-- app code keeps working: it reads member_count and my_role, which keep their names.
begin;

drop function public.get_group_viewer_summaries(uuid[]);

-- For up to 50 groups: the actual number of members, how many of them are not
-- available to this viewer, and the viewer's own role (null when not a member).
create function public.get_group_viewer_summaries(p_group_ids uuid[])
returns table (
  group_id uuid,
  member_count integer,
  unavailable_member_count integer,
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
      g.member_count,
      (
        select count(*) from public.group_members m
        where m.group_id = g.id
          and m.user_id in (select hidden from penguin_groups_private.hidden_from(caller) hidden)
      )::integer,
      (select m.role from public.group_members m where m.group_id = g.id and m.user_id = caller)
    from public.groups g
    where g.id = any (p_group_ids);
end;
$$;

revoke all on function public.get_group_viewer_summaries(uuid[]) from public, anon, authenticated;
grant execute on function public.get_group_viewer_summaries(uuid[]) to authenticated;

comment on function public.get_group_viewer_summaries(uuid[]) is
  'Per group: the actual member count, how many members are unavailable to the caller (a number only), and the caller''s own role.';

commit;
