# Sprint 8A: profile redesign and connections

Status: IMPLEMENTED LOCALLY on `feat/design-system-v2`. Both migrations applied to the
hosted project on 2026-10-23 with the user's approval. No Android acceptance yet.

## Scope (from the user, 2026-10-23)

- The profile matches the supplied mockup, in the Nabd design system.
- New profile data: cover image, verified badge, city, interests.
- Connections instead of followers: a student sends a request; it stays pending until
  the other accepts (connected) or declines. After a decline, either student can send
  a new request.
- Saved posts: not now.

## Database (`supabase/migrations/20261023090000_profile_connections.sql`)

- `profiles`: `cover_url` (https, at most 2048), `location` (1-80), `interests` (at most
  8 items, 1-32 characters each), `is_verified` (default false). Clients may update the
  first three; `is_verified` has no client grant and is set by administrators only.
- `connections`: one row per pair (`user_low < user_high`), `requester_id`, `status`
  pending / accepted / declined. Participants read their own rows; no direct writes.
- Functions (authenticated only):
  - `request_connection(target)`: sends a request; accepts when the other already asked;
    restarts a declined pair as a new request; refused when either side blocked the other.
  - `respond_connection(requester, accept)`: the receiver accepts or declines.
  - `remove_connection(other)`: cancels your own pending request or ends a connection.
  - `get_profile_stats(profile)`: post and accepted-connection counts.
- Blocking is unchanged. A block does not end an existing connection; a new request is
  refused while either block exists.

## Profile photos (`supabase/migrations/20261023100000_profile_photos.sql`)

- Public Storage bucket `profile-photos` (5 MB, JPEG/PNG/WebP). Students write only
  under their own `<user id>/` folder; anyone with the link can read, like the rest of
  a profile.
- The app crops on the phone (avatar 1:1, 512px; cover 3:1, 1500px), uploads a JPEG
  and sets `avatar_url` or `cover_url` to the public link.
- The migration body is skipped where the storage schema does not exist (a plain
  Postgres test container), so the database test does not cover the bucket policies.

## App

- Profile header: cover with Edit cover (own), 96px photo over it, Edit profile (own) or
  Message + Connect (others), name with the verified badge, @username and study level,
  bio, study line, city and join month, Posts and Connections counts, interests.
- Tabs: Posts, Media (photo grid), Liked (own profile only; likes are private).
- Bell on your own profile opens `/connections/requests` with Accept / Decline; its
  badge is the real number waiting.
- Tapping your own photo (or Edit cover) opens View / Change; tapping another
  student's photo opens it full screen.
- Edit profile: City, Interests (comma separated). The cover is changed with Edit cover on the cover itself (no link field).
- Not in the mockup's form: no Saved tab, no Photos/Videos/Albums filters (posts have
  photos only).

## Verification

- `npm test`: 340 pass, 0 fail (includes `tests/connections.test.mjs`).
- `npx tsc --noEmit`, `npx expo lint`: clean.
- `bash tests/connections-db-verify.sh`: PASS on 2026-10-23, 37 assertions, on a disposable
  container (the photo bucket part is skipped there: no storage schema).
- Android: DEFERRED. Web preview of the profile is not possible against the hosted
  database until the migration is applied.

## Deployment

- `20261023090000`: applied 2026-10-23 with the user's approval, by `supabase db push`
  with the photos migration set aside so only this version was sent (dry run listed it
  alone). Read-only `supabase migration list --linked` afterwards shows it in both
  columns.
- `20261023100000`: applied 2026-10-23 with the user's approval (dry run listed it
  alone); `migration list --linked` shows it in both columns. The public URL of a
  missing file in `profile-photos` answers "Object not found" (not "Bucket not
  found"), so the bucket exists. Its write policies are not tested automatically.
