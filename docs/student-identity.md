# Sprint 2A: student identity foundation

## Scope and deployment status

The repository previously had no Supabase migrations, profile data, or database types.
Auth uses React Context and a single Supabase client, with SecureStore on native.
No TanStack Query, Zustand, React Hook Form or Zod is installed. This sprint adds no
dependencies or UI; the profile service follows the existing feature/service pattern.

The migration is prepared locally, **not applied to the hosted project**. The connected
Supabase account did not list Penguin, so the remote schema could not be inspected.
TypeScript types are hand-maintained against this migration, not generated from a live DB.

## Model and invariants

- `profiles.id` is the Auth user ID (one-to-one, cascade when the Auth user is deleted).
  Future social tables should reference `profiles.id`.
- `institution_id` and `field_id` reference UUID primary keys. Reference deletion is
  restricted while profiles use the record. Fields represent global study areas;
  later an institution-specific programs table can reference both tables without
  changing their identities. No institution/program membership is implied today.
- Country uses uppercase two-letter ISO country codes; names/cities allow Unicode.
- Study level is nullable constrained text: `secondary`, `vocational`, `undergraduate`,
  `postgraduate`, `doctoral`, `other`. Add levels via a future CHECK migration.
- Usernames are nullable until onboarding, then required. Canonical lowercase ASCII,
  3–30 characters, letters/numbers/underscores, starting with a letter or number.
  Updates normalize whitespace/case in the DB, and the unique constraint prevents races.
  Administrative inserts must also use canonical lowercase. No reserved-name system yet.
- Completing onboarding requires username, nonblank display name, institution, field
  and study level. Display names are at most 80 characters; bio at most 500.
  Optional avatar URLs must be HTTPS and at most 2048 characters. No upload system added.
- All times are `timestamptz`. The client cannot update identity or timestamps.
  The update trigger maintains `updated_at`.

## Security and profile creation

Authenticated users can read all profile fields (including bio, school and onboarding
status), and all reference rows. Do not put private data in these social profile fields.
Anonymous users have no access. RLS and column grants permit only own-profile updates;
there are no client insert/delete grants or policies. Reference writes require an
administrative database context. No privileged credentials enter the app.

The Auth insert trigger creates only `id` plus database defaults. It never copies
untrusted optional metadata, so malformed signup metadata cannot violate profile
constraints. It is a trigger-only SECURITY DEFINER function with an empty search path
and revoked client execution. Unexpected database failures still fail the transaction
instead of silently creating an Auth user without a profile. Validate the migration
before deployment because an incorrectly deployed Auth trigger could block signup.

Backfill inserts Auth IDs with `ON CONFLICT (id) DO NOTHING`. It is safe to repeat and
does not overwrite existing profiles. The complete DDL migration is deliberately not
rerunnable: existing table/function/trigger names cause an error and transaction rollback,
requiring inspection instead of silently replacing an unknown schema.

## Deployment

1. In the correct Supabase account, inspect the target schema and migration history.
   If `profiles`, `institutions`, `fields` or these Penguin functions/triggers already
   exist, stop and reconcile with an additive migration. Do not drop existing objects.
2. Use the Supabase CLI with your own trusted login outside Expo. From this repository,
   initialize local CLI configuration if needed (`supabase init`), link the correct
   project (`supabase link --project-ref <penguin-project-ref>`), inspect
   `supabase migration list`, then review `supabase db push --dry-run`.
3. Apply `supabase db push` after confirming only the intended migration is pending.
   Do not use database reset. Do not push Auth/SMTP configuration. Local CLI config
   initialization is not a request to change the working hosted Auth settings.
4. Run `supabase/verification/student_identity.sql` in the SQL Editor as an administrator.
   It is read-only. Also verify with two authenticated test users that own updates succeed,
   cross-user updates cannot modify rows, anonymous reads fail, profile inserts and
   reference mutations are denied, and duplicate usernames fail. Live checks are pending.
5. Add a small reviewed set of real institutions and fields through an administrative
   workflow before Sprint 2B onboarding is used. No fabricated production seed is included.

Use the CLI version's `--help` if syntax changes. CLI tools are not application dependencies.
The migration is additive and transactional; no destructive down migration is provided.
After deployment, use forward fixes rather than dropping tables that may contain profiles.
Reference: https://supabase.com/docs/guides/auth/managing-user-data and
https://supabase.com/docs/guides/database/postgres/row-level-security.

## API

`src/features/profile/service.ts` exports:

- `getCurrentProfile()` → profile or null; requires a server-validated Auth user.
- `updateCurrentProfile(patch)` → saved profile; derives the ID from Auth, allows only
  editable columns, never upserts, propagates DB errors (including username conflicts).
- `checkUsernameAvailability(value)` → `{ username, valid, available }`. An unchanged
  own username is available. This is advisory; handle unique violation `23505` when saving.
- `listInstitutions({ search?, country?, offset?, limit? })` and
  `listFields({ search?, offset?, limit? })` → name substring search, stable ordering,
  default 25/max 100 rows. Wildcards are escaped. RLS requires authentication.

Errors and missing profiles must not be interpreted as completed onboarding. On a
missing profile, surface retry/support and investigate the migration/backfill; never
create arbitrary profile IDs in the client. No server-state cache was introduced.

## Sprint 2B routing connection

`ProfileState` and `getOnboardingDestination(userId, state)` distinguish auth, loading,
error, missing, onboarding and main destinations. This is a pure decision helper,
not a mounted provider or a navigation side effect. Current auth routing is unchanged.

In 2B, load the current profile under AuthProvider after session initialization; clear
profile state on account changes/signout and ignore obsolete fetch responses. Use a
single profile state owner consistent with React Context (or intentionally adopt the
planned query layer then). The helper also rejects profiles belonging to another user.
Refresh profile state after successful updates. Mount real onboarding routes, then
wire their guards and the existing index route to this decision. Recovery sessions
and `/auth/callback` must keep priority over onboarding, preserving password reset.
Handle profile loading/errors before redirecting; do not create placeholder routes.
