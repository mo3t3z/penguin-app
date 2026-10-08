-- Read-only post-deployment checks. Run in the correct project as an administrator.
-- Expected: missing_profiles = 0.
select count(*) as missing_profiles from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- Expected: three tables with row security enabled.
select relname, relrowsecurity from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('profiles', 'institutions', 'fields');

-- Expected: authenticated SELECT for each; own-profile UPDATE USING and WITH CHECK.
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public'
  and tablename in ('profiles', 'institutions', 'fields');

-- Expected: false, false, false, false, false, true.
select
  has_table_privilege('anon', 'public.profiles', 'SELECT') as anonymous_read,
  has_table_privilege('authenticated', 'public.profiles', 'INSERT') as client_insert,
  has_table_privilege('authenticated', 'public.profiles', 'DELETE') as client_delete,
  has_column_privilege('authenticated', 'public.profiles', 'id', 'UPDATE') as change_identity,
  has_table_privilege('authenticated', 'public.institutions', 'UPDATE') as edit_references,
  has_column_privilege('authenticated', 'public.profiles', 'username', 'UPDATE') as edit_username;

-- Expected: zero invalid completed rows.
select count(*) as invalid_completed_profiles from public.profiles
where onboarding_completed and (username is null or display_name is null
  or institution_id is null or field_id is null or study_level is null);
