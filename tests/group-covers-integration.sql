-- Executable database checks for the group cover migration: only the owner of an
-- active group sets the cover, through set_group_cover. Run only against a
-- DISPOSABLE database (tests/group-covers-db-verify.sh), never the hosted project.
-- Ends by printing "group covers integration: all assertions passed".
\set ON_ERROR_STOP on

create function public.test_assert(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;
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
grant execute on function public.test_assert(boolean, text), public.test_fails(text, text), public.test_login(uuid) to authenticated;

\set alice '00000000-0000-4000-8000-0000000000a1'
\set bob   '00000000-0000-4000-8000-0000000000b2'
\set r1    '00000000-0000-4000-8000-000000002001'

insert into auth.users (id) values (:'alice'), (:'bob');
update public.profiles p set
    username = 'student_' || right(replace(p.id::text, '-', ''), 6),
    display_name = 'Student ' || right(p.id::text, 4),
    institution_id = (select id from public.institutions order by slug limit 1),
    field_id = (select id from public.fields order by slug limit 1),
    study_level = 'undergraduate',
    onboarding_completed = true;

select public.test_assert(not has_column_privilege('authenticated', 'public.groups', 'cover_url', 'update'), 'no direct cover update');
select public.test_assert(has_column_privilege('authenticated', 'public.groups', 'cover_url', 'select'), 'members read the cover');
select public.test_assert(not has_function_privilege('anon', 'public.set_group_cover(uuid,text)', 'execute'), 'anon cannot set a cover');

set role authenticated;
select public.test_login(:'alice');
select id as g1 from public.create_group_idempotent(:'r1', 'Cover Group', null) \gset
select public.test_assert(public.set_group_cover(:'g1', ' https://example.com/c.jpg ') = 'https://example.com/c.jpg', 'the owner sets a trimmed cover');
select public.test_assert((select cover_url from public.groups where id = :'g1') = 'https://example.com/c.jpg', 'the cover is stored');
select public.test_assert(public.test_fails(format('select public.set_group_cover(%L, %L)', :'g1', 'http://insecure'), '23514'), 'the cover must be https');

select public.test_login(:'bob');
select public.join_group(:'g1');
select public.test_assert(public.test_fails(format('select public.set_group_cover(%L, %L)', :'g1', 'https://example.com/b.jpg'), '42501'), 'a member cannot set the cover');

select public.test_login(:'alice');
select public.test_assert(public.set_group_cover(:'g1', null) is null, 'the owner clears the cover');
select public.test_assert((select cover_url from public.groups where id = :'g1') is null, 'the cover is cleared');

\echo 'group covers integration: all assertions passed'
