# Sprint 8: notifications

Status: IMPLEMENTED LOCALLY on `feat/design-system-v2`. Migration `20261024090000`
applied to the hosted project on 2026-10-24 with the user's approval. No Android
acceptance yet.

## Scope (from the user, 2026-10-24)

A student is told when:

- someone comments on their post (`post_comment`);
- one of their connections comments on a post by another of their connections
  (`connection_comment`);
- someone asks to connect (`connection_request`) or accepts their request
  (`connection_accepted`);
- one of their connections publishes a post with a photo (`connection_photo`).

Not in scope: push notifications to the phone, likes, group activity.

## Database (`supabase/migrations/20261024090000_notifications.sql`)

- `notifications`: recipient, actor, type, optional post and comment, `read_at`.
  Recipients read their own rows; clients write nothing directly.
- Triggers (security definer, in `penguin_private`):
  - after a comment: the post's author, then every student connected to both the
    commenter and the post's author;
  - after a connection insert or update: the receiver of a new or renewed request
    (an unread earlier notice from the same student is replaced), or the requester
    when it is accepted;
  - after a post photo becomes ready: the author's connections, once per post.
- No notice crosses a block in either direction, and nobody is told about their own
  action. Deleting an account, post or comment deletes its notices.
- `mark_notifications_read(until)` and `get_unread_notification_count()` for clients.

## App

- The bell in the Home header opens Notifications; its badge is the real unread count,
  refreshed when Home is shown, every minute while it is, and after reading.
- Notifications lists the newest 50, unread ones tinted with a dot, with a row to
  Connection requests at the top. Opening the screen marks them read. Tapping a
  comment or photo notice opens the post; a request opens Connection requests; an
  acceptance opens that student's profile.

## Verification

- `npm test`: 349 pass, 0 fail (includes `tests/notifications.test.mjs`).
- `npx tsc --noEmit`, `npx expo lint`: clean.
- `bash tests/notifications-db-verify.sh`: PASS on 2026-10-24, 23 assertions, on a
  disposable container. `bash tests/connections-db-verify.sh` re-run with the new
  triggers: PASS, 37 assertions.
- Not checked in the browser or on Android.

## Deployment

`20261024090000` applied 2026-10-24 with the user's approval by `supabase db push`
(the dry run listed it alone). Read-only `supabase migration list --linked` afterwards
shows it in both columns.
