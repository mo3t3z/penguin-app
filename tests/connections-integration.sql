-- Executable database checks for the Sprint 8A migration (profile details and
-- connections): grants, row-level security and the four functions, against the
-- REAL schema. Run only against a DISPOSABLE database (tests/connections-db-verify.sh),
-- never the hosted project. Every file in supabase/migrations must be applied first.
-- Ends by printing "connections integration: all assertions passed".
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
create function public.test_status(a uuid, b uuid) returns text language sql security definer set search_path = '' as
  $$ select status from public.connections where user_low = least(a, b) and user_high = greatest(a, b) $$;
create function public.test_requester(a uuid, b uuid) returns uuid language sql security definer set search_path = '' as
  $$ select requester_id from public.connections where user_low = least(a, b) and user_high = greatest(a, b) $$;
grant execute on function public.test_assert(boolean, text), public.test_fails(text, text), public.test_login(uuid),
  public.test_status(uuid, uuid), public.test_requester(uuid, uuid) to authenticated, anon;

\set alice '00000000-0000-4000-8000-0000000000a1'
\set bob   '00000000-0000-4000-8000-0000000000b2'
\set carol '00000000-0000-4000-8000-0000000000c3'
\set dave  '00000000-0000-4000-8000-0000000000d4'

insert into auth.users (id) values (:'alice'), (:'bob'), (:'carol'), (:'dave');

-- --- Grants ------------------------------------------------------------------------

select public.test_assert(not has_table_privilege('authenticated', 'public.connections', 'insert'), 'no direct insert');
select public.test_assert(not has_table_privilege('authenticated', 'public.connections', 'update'), 'no direct update');
select public.test_assert(not has_table_privilege('authenticated', 'public.connections', 'delete'), 'no direct delete');
select public.test_assert(not has_table_privilege('anon', 'public.connections', 'select'), 'anon cannot read connections');
select public.test_assert(not has_column_privilege('authenticated', 'public.profiles', 'is_verified', 'update'), 'verified badge is not client-writable');
select public.test_assert(has_column_privilege('authenticated', 'public.profiles', 'cover_url', 'update'), 'cover is client-writable');
select public.test_assert(not has_function_privilege('anon', 'public.request_connection(uuid)', 'execute'), 'anon cannot request');

set role authenticated;

-- --- Profile details ---------------------------------------------------------------

select public.test_login(:'alice');
update public.profiles set location = 'Sousse, Tunisia', interests = array['Gaming', 'Photography'],
  cover_url = 'https://example.com/cover.jpg' where id = :'alice';
select public.test_assert((select location from public.profiles where id = :'alice') = 'Sousse, Tunisia', 'owner sets city');
select public.test_assert(public.test_fails($$update public.profiles set is_verified = true where id = '00000000-0000-4000-8000-0000000000a1'$$, '42501'),
  'owner cannot verify themself');
select public.test_assert(public.test_fails($$update public.profiles set cover_url = 'http://insecure' where id = '00000000-0000-4000-8000-0000000000a1'$$, '23514'),
  'cover must be https');
select public.test_assert(public.test_fails($$update public.profiles set interests = array[repeat('x', 33)] where id = '00000000-0000-4000-8000-0000000000a1'$$, '23514'),
  'each interest is at most 32 characters');
select public.test_assert(public.test_fails($$update public.profiles set interests = array['1','2','3','4','5','6','7','8','9'] where id = '00000000-0000-4000-8000-0000000000a1'$$, '23514'),
  'at most eight interests');

-- --- Request, accept --------------------------------------------------------------

select public.test_assert(public.test_fails($$select public.request_connection('00000000-0000-4000-8000-0000000000a1')$$, '22023'), 'no request to yourself');
select public.test_assert(public.test_fails($$select public.request_connection('00000000-0000-4000-8000-00000000dead')$$, 'P0002'), 'no request to a missing student');
select public.test_assert(public.request_connection(:'bob') = 'pending', 'alice asks bob');
select public.test_assert(public.request_connection(:'bob') = 'pending', 'asking again changes nothing');
select public.test_assert((select count(*) from public.connections) = 1, 'alice sees her own request');

select public.test_login(:'carol');
select public.test_assert((select count(*) from public.connections) = 0, 'carol cannot see alice and bob');
select public.test_assert(public.test_fails($$select public.respond_connection('00000000-0000-4000-8000-0000000000a1', true)$$, 'P0002'),
  'carol cannot answer a request sent to bob');

select public.test_login(:'alice');
select public.test_assert(public.test_fails($$select public.respond_connection('00000000-0000-4000-8000-0000000000a1', true)$$, 'P0002'),
  'the sender cannot accept her own request');

select public.test_login(:'bob');
select public.test_assert(public.respond_connection(:'alice', true) = 'accepted', 'bob accepts');
select public.test_assert(public.test_status(:'alice', :'bob') = 'accepted', 'pair is connected');
select public.test_assert((select connection_count from public.get_profile_stats(:'alice')) = 1, 'alice has one connection');

-- --- Decline, send again -----------------------------------------------------------

select public.test_login(:'carol');
select public.test_assert(public.request_connection(:'dave') = 'pending', 'carol asks dave');
select public.test_login(:'dave');
select public.test_assert(public.respond_connection(:'carol', false) = 'declined', 'dave declines');
select public.test_assert(public.test_fails($$select public.respond_connection('00000000-0000-4000-8000-0000000000c3', true)$$, 'P0002'),
  'a declined request cannot be accepted later');
select public.test_login(:'carol');
select public.test_assert(public.request_connection(:'dave') = 'pending', 'carol can send again after a decline');
select public.test_assert(public.test_requester(:'carol', :'dave') = :'carol'::uuid, 'the new request is from carol');
select public.test_login(:'dave');
select public.test_assert(public.request_connection(:'carol') = 'accepted', 'asking back accepts the waiting request');

-- --- Cancel and remove --------------------------------------------------------------

select public.test_login(:'alice');
select public.test_assert(public.request_connection(:'carol') = 'pending', 'alice asks carol');
select public.test_login(:'carol');
select public.remove_connection(:'alice');
select public.test_assert(public.test_status(:'alice', :'carol') = 'pending', 'the receiver cannot delete a request; she declines it');
select public.test_login(:'alice');
select public.remove_connection(:'carol');
select public.test_assert(public.test_status(:'alice', :'carol') is null, 'the sender cancels her request');
select public.remove_connection(:'bob');
select public.test_assert(public.test_status(:'alice', :'bob') is null, 'either side ends a connection');
select public.test_assert((select connection_count from public.get_profile_stats(:'bob')) = 0, 'the count of bob follows');

-- --- Blocking ----------------------------------------------------------------------

reset role;
insert into public.user_blocks (blocker_id, blocked_id) values (:'bob', :'alice');
set role authenticated;
select public.test_login(:'alice');
select public.test_assert(public.test_fails($$select public.request_connection('00000000-0000-4000-8000-0000000000b2')$$, '42501'),
  'no request to a student who blocked you');
select public.test_login(:'bob');
select public.test_assert(public.test_fails($$select public.request_connection('00000000-0000-4000-8000-0000000000a1')$$, '42501'),
  'no request to a student you blocked');

reset role;
-- Account deletion removes the pair.
delete from auth.users where id = :'dave';
select public.test_assert(public.test_status(:'carol', :'dave') is null, 'a deleted account takes its connections with it');

\echo 'connections integration: all assertions passed'
