# Sprint 3A: posts and private image foundation

Status: local code and migration only. No database SQL was executed, no Edge Function
was deployed, and no B2 credentials were requested/read/configured. Review before
deploying. Existing Auth, ProfileProvider, onboarding, navigation and screens are unchanged.

## Database contract

Migration: `supabase/migrations/20261005182705_posts_media_foundation.sql`.

`posts`: UUID `id`; `author_id -> profiles.id` (cascade); client-generated
`client_request_id`; `content`; UTC-capable
`created_at`/`updated_at`. A nonblank caption of 1–5,000 PostgreSQL characters is
required for MVP, including image posts. This bounds payloads while allowing useful
student announcements. Client validation counts Unicode code points, not UTF-16 units.
`(author_id, client_request_id)` is unique. The invoker-rights
`create_post_idempotent` RPC inserts once or returns the caller's existing matching
post after a lost response; using the same key for different content is rejected.
Image-only posts and draft/publish transactions are deferred; creating a post makes
its text visible immediately, and completed images become visible individually.

`post_media`: UUID `id`; cascading `post_id`; provider-neutral `storage_provider`,
`storage_key`, `storage_version`; `mime_type`, `size_bytes`, nullable `width`/`height`,
zero-based `position`, `created_at`, `updated_at`. Internal lifecycle fields are
`upload_key`, `upload_expires_at`, and `status` (`pending`, `finalizing`, `ready`).
This table reserves a slot before bytes are uploaded. Ready rows require dimensions
and an immutable object version. No blobs, Base64 or signed URLs are stored in SQL.
Storage adapters can change independently of `posts`; a future provider needs an
adapter and an immutable version/identity, not a posts-table redesign.

Constraints and indexes:

- `position between 0 and 3` plus unique `(post_id, position)` guarantees at most
  four images INCLUDING pending uploads, even with concurrent requests. Moving to
  an occupied position returns a conflict; atomic reorder is deferred.
- Provider/key and provider/upload-key uniqueness; staging and final keys differ.
- JPEG, PNG, WebP only; 1 byte–8 MiB; each dimension 1–8,192; <=32 megapixels.
- Feed index `(created_at desc, id desc)`; author index
  `(author_id, created_at desc, id desc)`; the slot index covers the media FK;
  partial expiry index for unfinished uploads; cleanup due-time index.
- Update triggers maintain timestamps. Clients cannot set identity or timestamps.

## RLS and privileges

All public tables have RLS. MVP reads follow the existing profile convention:
all authenticated users can read posts, but only `ready` media whose parent is
visible. This is not school-specific or follower-based visibility. Revisit the
post SELECT policy when those product rules are introduced; signed reads check
the caller's RLS before using server privileges.

Posts: authenticated INSERT is granted for `content` only, with `author_id`
defaulting to `auth.uid()` and an ownership/onboarding-complete INSERT policy.
UPDATE is granted only for `content`; UPDATE and DELETE require ownership.
No anonymous access. No auth metadata is used for ownership decisions.

Media: no authenticated INSERT grant or policy. Only the Edge Function creates
reservations and publishes verified metadata. Mobile SELECT grants exclude storage
keys/versions and upload internals. Only `position` can be updated directly, and
only the owner's ready media can be updated/deleted. Parent IDs and storage fields
cannot be changed. Owner cancellation of pending/finalizing uploads goes through
the function. The service-role client is instantiated only inside server code,
after Auth verification; every privileged mutation explicitly checks post ownership.

`penguin_private.media_cleanup_queue` has RLS, no client privileges and no exposed
RPC. A trigger-only SECURITY DEFINER function inserts deletion intent; it has a
fixed empty search path, checks its trigger context and has direct execution revoked.
This is required for authenticated deletes and auth-account cascades to enqueue
cleanup atomically without granting users access to the outbox. It does not perform
HTTP calls. Do not expose `penguin_private` through the Data API.

## TypeScript APIs and pagination

`src/features/posts/service.ts`: `createPost(content)`, `getPost(id)`,
`getFeed({cursor?, limit?})`, `updatePost(id, content)`, `deletePost(id)`.
The existing typed Supabase singleton is reused. Errors are thrown consistently
with the profile service; unauthorized/missing writes do not return fake success.

Feed pages default to 20, max 50, fetching `limit + 1` rows. Sort is descending
`(created_at, id)` with a matching strict keyset predicate. Cursors carry both values
and preserve Postgres microseconds; strict validation prevents PostgREST filter
injection. New posts and deletions do not shift offsets. No total-table download or
count query. Post cards include author `id`, `username`, `display_name`, `avatar_url`,
and sorted ready-media presentation fields, not complete profiles or auth internals.
Content edits do not change the feed ordering key.

`media-service.ts` prepares `authorizePostImageUpload`, `finalizePostImageUpload`,
`cancelPostImageUpload`, `getPostUploadStatus`, `getPostImageReadUrl`, and
`deletePostImage`. It does not pick files, upload bytes or render UI.

Database types remain hand-maintained; after manual deployment, compare them with
generated types without overwriting the existing profile contract blindly.

## B2 server design

Function name: **`post-media`**. POST JSON actions: `authorize`, `status`, `finalize`,
`cancel`, `read`. Requests require a Supabase access token, validated with
`auth.getUser(token)` in addition to `verify_jwt = true`. Missing/expired tokens fail
closed. Request bodies are bounded to 4 KiB. CORS permits Expo web preflight without
cookies; CORS is not an authorization mechanism.

Required manually configured Edge Function secrets:

- `B2_BUCKET_NAME` = `penguin-media` (bucket stays PRIVATE)
- `B2_ENDPOINT` = the bucket's HTTPS S3 regional endpoint, without a bucket path
- `B2_KEY_ID`
- `B2_APPLICATION_KEY`

Also uses Supabase-provided `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`. No B2 env vars belong in `.env.example`, `EXPO_PUBLIC_*`,
app config or mobile code. Use a bucket-scoped B2 application key with the least
read/write permissions needed; a separate trusted cleanup operator needs list/delete
versions. Configure keys privately in the Dashboard or a private secret-file workflow.
Never paste credentials into commands, logs, screenshots or chat.

Server dependencies only: pinned `npm:aws4fetch@1.0.20` (small Web Crypto SigV4
signer) and `npm:@supabase/supabase-js@2.117.2` (same version as the mobile client).
Deno owns the server dependency lock. No new client dependencies or AWS SDK tree.
Expo TypeScript excludes `supabase/functions` because Deno owns its runtime/types;
lint still checks the function sources with Deno declared as a read-only global.

### Upload flow

1. Create a text post through RLS. Request `authorize` with post ID, slot 0–3,
   supported MIME and exact byte count <=8 MiB. No user ID/key/path is accepted.
2. Server verifies the user and post ownership, generates a UUID and reserves the
   unique slot. It signs a five-minute PUT to
   `uploads/posts/<user-id>/<post-id>/<generated-id>.<jpg|png|webp>`.
3. Client uploads bytes directly to B2 with the exact returned signed headers:
   `content-type`, `content-length`, `x-amz-meta-upload-id`. No multipart form,
   permanent key, public bucket, client-controlled path or arbitrary MIME.
   `allHeaders: true` binds the length/type/id. **Do not silently omit the signed
   Content-Length if a mobile transport cannot preserve it.** In 3B device-test
   the transport against B2; choose a bounded authenticated server upload fallback
   if the transport cannot comply. Do not ship an unsigned-size fallback.
4. Client requests `finalize` by reservation ID. Server rechecks ownership, claims
   `pending -> finalizing` conditionally, HEAD-checks size/type/id and records the
   B2 version. A version-pinned GET reads at most 64 KiB to inspect PNG/JPEG/WebP
   signature and dimensions. Client-supplied width/height is never trusted.
5. B2 performs a server-side, version-pinned copy to
   `posts/<user-id>/<post-id>/<generated-id>.<jpg|png|webp>`. The function checks the
   copy response and source/destination versions, then updates SQL to `ready`.
   The final key was never writable by the upload URL. Retrying/replaying that URL
   cannot mutate a published image. No full image payload flows through Supabase.
6. Ready media appears in subsequent post/feed reads. Successful finalization
   atomically queues the temporary key for cleanup. A lost response can be recovered
   with `status`; repeated finalize of ready media returns success.

Validation is a **header/metadata foundation**, not full decoding, virus scanning,
image sanitization or re-encoding. JPEG headers beyond 64 KiB, unsupported JPEG
encoding modes and animated WebP are rejected. A fake/corrupt file with a plausible
header may still fail in an image decoder; a decoder/sanitizer can be added later.
Before public rollout add request/user quotas and monitor B2 usage: short expiry,
signed size and four concurrent slots do not constitute comprehensive abuse controls.

### Private delivery

Request `read` with a media ID. The function first reads under the caller's RLS,
then returns a five-minute, version-pinned GET URL. SQL stores only durable object
identity. Keep URLs in memory, refresh near expiration/on a single expired-URL
failure, and clear them on logout. Do not persist/log them or add them to analytics.
They are bearer capabilities: anyone holding one can read until expiry. Deleting
a post stops new issuance but does not revoke existing URLs immediately. Copies
already downloaded cannot be revoked. B2 is never changed to public.

## Deletion, failures and orphan recovery

Post/profile deletion cascades through media rows. A transactional trigger writes
both exact staging/final keys to `penguin_private.media_cleanup_queue`; if enqueue
fails, the DB delete fails too. Intents have no FK back to deleted records and survive
account deletion. No database HTTP side effects are used.

- Upload fails/cancels: owner cancels its reservation; the trigger queues cleanup.
  The already-created text post remains; UI may explicitly offer deletion in 3B.
- Upload succeeds but finalization fails: media stays hidden. Retry `finalize` or
  cancel. A conditional state claim prevents simultaneous finalizers.
- Copy succeeds but DB write fails: final key is known before upload, so cancellation
  or expiration cleanup still queues it. `status` detects success after a lost DB
  response. Retry can leave older B2 versions; the cleanup routine must handle them.
- Process crashes while finalizing: inspect `status`; owner can cancel the abandoned
  slot. Do not blindly reset every in-flight finalizer or delete an active object.
- Post deleted during upload/copy: FK/conditional publication fails safely; delayed
  cleanup catches objects written shortly after the delete, including URL replay.

No worker or cron is deployed in this sprint. Before enabling uploads, establish a
small trusted manual cleanup routine (later schedulable):

1. In an administrative DB session, delete unfinished reservations only after
   `upload_expires_at + interval '1 hour'` and `updated_at + interval '15 minutes'`
   have both passed. Their triggers create cleanup intents; never delete ready rows
   just because their upload URL expired.
2. Read due cleanup intents in bounded batches, after `not_before` (at least an hour
   after URL expiry/deletion). Before deleting, recheck no active media row references
   that exact provider/key as a final key or a pending/finalizing staging key.
3. For B2, list **all versions and delete markers of that exact key**, paginating and
   filtering exact matches. Delete each version by version ID; a name-only S3 DELETE
   may leave billable older versions. Do not broadly delete a user/post prefix.
4. Confirm versions are gone, then acknowledge the intent in SQL. On failure leave
   it for retry; not-found is success. Repeated cleanup must be idempotent.
5. Optionally reconcile old unreferenced versions against SQL periodically. Never
   delete the version referenced by ready media. Temporary-prefix lifecycle policies
   can provide a backstop, but do not replace final-key cleanup or version checks.

## Manual deployment and verification

1. Review the migration against the hosted schema and existing profile migrations;
   test it on an isolated development database first. It intentionally aborts on
   conflicting object names rather than replacing existing objects. Keep the private
   schema unexposed. No push/reset/deploy was performed by this sprint.
2. Manually apply the reviewed migration using your chosen Supabase workflow.
   Run `supabase/verification/posts_media.sql` only on an isolated development DB.
   It creates temporary fixtures inside a transaction and rolls back.
3. Configure the four B2 secrets privately, confirm bucket permissions and CORS for
   approved web origins (PUT, content-type, content-length, x-amz-meta-upload-id).
   Native clients are not subject to browser CORS. Establish the cleanup routine.
4. Manually deploy **post-media** with the checked-in function config, after secrets
   are in place. Do not use `--no-verify-jwt` as a workaround for auth failures.
5. Use two real development users: valid upload/finalize/read; cross-owner post/media
   mutation denial; spoofed MIME/size; fifth slot and concurrent reservations;
   replayed PUT; expired JWT/URL; cancel; post/account deletion during upload;
   DB failure after copy; exact-version cleanup. Verify B2 rejects a mismatched
   signed length, and copied source/destination version headers match expectations.
6. Confirm latest Deno typecheck and app TypeScript/lint results. Actual B2/Supabase
   end-to-end behavior remains unverified until this manual deployment test.

Current references: [B2 S3 API](https://www.backblaze.com/docs/cloud-storage-s3-compatible-api),
[CopyObject](https://www.backblaze.com/apidocs/s3-copy-object),
[versioned GET](https://www.backblaze.com/apidocs/s3-get-object),
[aws4fetch](https://github.com/mhart/aws4fetch),
[Supabase function authentication](https://supabase.com/docs/guides/functions/auth).

## Deferred Sprint 3B

Create Post/Feed UI, image picking/compression/resizing, native upload transport,
upload progress/retry/cancellation UX, cache refresh and signed-image URL renewal.
No likes, comments, saves, follows, public-profile screens, notifications, chat,
groups, avatar upload, image-transformation service or background-job framework.
