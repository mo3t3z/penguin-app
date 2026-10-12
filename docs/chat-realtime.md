# Sprint 6B: live chat

Status on 2026-10-10: client code complete, and the migration
`supabase/migrations/20261011090000_chat_realtime.sql` is **applied to the hosted
project `utdwgmvdhghmephbvxvj`** (with `supabase db push`, after the local database
suite passed and an encrypted backup was taken: `penguin-utdwgmvdhghmephbvxvj-20261009T235319Z-*.sql.dpapi`). The header
comment inside the migration file still says "not applied"; the file is left exactly
as it was applied. Two-account device testing has not been done yet.

No dependency was added and nothing native changed.

## What the app does

| Feature | Before the migration | Now (migration applied) |
|---|---|---|
| New messages appear in an open conversation | On reopening or returning to the app | Live |
| Inbox preview, order and unread dot | When the Messages tab is opened or the app returns | Live |
| "Sent" on your newest message | Yes (the server stored it) | Yes |
| "Read" on your newest message | Never shown | Shown once the other student opened the conversation after it |
| "… is typing" | Never shown | Live |
| Online presence | Not built | Not built (see below) |

"Delivered" is never shown: nothing reports that a device received a message.
Numeric unread counts are not shown.

## Read receipts

The read cursor (`conversation_reads`) stays visible to its owner only, exactly as in
Sprint 6A. The other student's cursor and its timestamp are never sent to a device.

- `public.get_read_receipt(conversation_id)` returns the identifier of the caller's own
  newest message that the other participant has read, or null. It answers null for a
  conversation that does not exist or is not the caller's.
- A new column `conversation_reads.receipt_at`, which clients cannot select, is what
  that function compares against. A trigger keeps it equal to `last_read_at` while the
  two students can message each other and leaves it unchanged while either has blocked
  the other.
- So a block never turns "Read" back into "Sent", and opening the conversation during
  a block tells the other side nothing. The blocker's own cursor still moves, so their
  unread dot clears. After unblocking, receipts move again the next time the
  conversation is opened.
- The app keeps the receipt moving forward only: an older or missing answer never
  removes "Read" from a message that showed it.
- When a student reads something new, their device sends a "just read" signal on the
  private conversation topic. It carries no data and is not trusted: the other device
  only reacts by asking the function again.
- Existing cursors get no `receipt_at` when the migration is applied (no row is
  changed), so messages read before it show "Sent" until the conversation is next opened.

## Architecture

Logic that can be tested without a device is in `src/features/chat/realtime.ts` (no
Supabase import). `realtime-service.ts` hands it the app's Supabase client.

| Channel | Opened by | Carries | Closed |
|---|---|---|---|
| `inbox:<user>:<n>` | `use-conversations.ts` with `live: true` (Messages tab) | `conversations` changes, the student's own `conversation_reads` | Background, logout, account change, unmount |
| `conversation:<id>:<n>` | `use-chat.ts` once the conversation is loaded | `messages` inserts for that conversation | Background, leaving the screen, logout, account change |
| `chat:<id>` (private broadcast) | `use-typing.ts` while the composer is open and the screen is in view | Typing and "just read" signals, never stored | As above, and whenever messaging is unavailable |

- Channel names carry a counter, so two screens never share or double-subscribe one.
- Every time a row-change channel joins, including after a dropped connection, the
  hook reads the newest page (or the inbox) and the receipt again. That reload is what
  recovers missed messages; it is skipped if one ran in the last 5 seconds.
- If more than one page was missed, the held history is replaced by the new page
  rather than leaving a hole; older pages load again by scrolling.
- Reconnecting is left to the Realtime client. The app has no retry timer of its own.
  A private channel that is refused before it ever joins is closed for that visit.
- The Supabase client already sends the access token to Realtime and replaces it on
  refresh. `src/lib/supabase.ts` and the auth files were not changed.
- A message is identified by the id created on the device, so the Realtime copy of
  your own message, the send response and a reload all settle on one row.
- The read cursor moves only while the conversation screen is focused and the app is
  in the foreground.

## Security

- No Sprint 6A function, policy or grant is changed, and the 6A database tests pass
  unmodified. Clients gain no write access.
- Row changes: Realtime evaluates the existing row-level security and column grants
  for each subscriber. Received rows are validated again by the app.
- New functions are `security definer` with an empty search path, owned by `postgres`,
  and take the caller only from `auth.uid()`. `get_read_receipt` is the only one in
  the API. The others are in `penguin_chat_private`, a new schema the API does not
  expose. `penguin_private` (media cleanup) is untouched and stays closed to clients.
- The private topic `chat:<id>` admits only that conversation's two participants while
  both accounts exist and no block exists. Presence is not authorized.
- `user_blocks` is not added to the publication.

### Remaining risks

- **A blocked student can still infer a block from sending**, which is refused as in
  6A, and at the API level from the private topic being refused. Receipts no longer add
  to this.
- **Timing by polling.** Someone calling `get_read_receipt` repeatedly learns roughly
  when their message was read. Any read receipt has this property.
- **Realtime checks the topic policy when a channel is joined.** A block made while
  both are in the conversation stops typing signals from the next join; the app closes
  its own channel as soon as it knows messaging is unavailable.
- **Not verifiable locally:** how the hosted Realtime service evaluates the topic
  policies and filters streamed rows. The policies were exercised against stand-in
  tables only. This needs the two-account checks after deployment.

## Presence: evaluated, not built

Supabase Presence could run on the same private topic, and the migration deliberately
does not authorize it. A truthful "online" needs product decisions (opt-out, what
counts as online). Nothing in the app infers presence from a session.

## Verification status

| Check | Result |
|---|---|
| `bash tests/chat-db-verify.sh` on a disposable database | Pass on 2026-10-10: 10 migrations, 72 Sprint 6A assertions (file unmodified), 44 Sprint 6B assertions, 18 concurrency checks |
| Topic policies against stand-in `realtime.messages` / `realtime.topic()` | Pass; stand-ins only |
| Hosted catalog (read-only) | Publication exists and is empty; `realtime.messages` has the columns used; the migration role may add policies to it; no `penguin_chat_private` schema yet |
| Applying twice | Fails at the first statement (`schema already exists`) before changing anything |
| Hosted catalog after deployment (read-only) | Pass: 10 versions recorded; publication lists the three chat tables and not `user_blocks`; four new definer functions with empty search path; `receipt_at` not selectable by clients; trigger enabled; chat policies unchanged; two topic policies on `realtime.messages`; row counts unchanged |
| Hosted anonymous probes | Pass: selects on the four chat tables, `receipt_at` and `get_read_receipt` refused (42501); helpers and `penguin_chat_private` not reachable through the API; private topic join refused as Unauthorized; row-change subscription accepted and delivers nothing |
| Hosted function logic, acting as each participant and as another student (read-only) | Pass: topic allowed for the two participants only; a malformed topic refused; receipt null or the caller's own message |
| Hosted Realtime with signed-in accounts (delivery, receipts, typing) | Not yet verified: needs the two-account device checks |

## Backup and rollback

The hosted project (Free plan) has no backups and no point-in-time recovery.

- `scripts/backup-hosted-encrypted.sh` pipes a dump from the Supabase CLI straight into
  Windows DPAPI encryption for the current Windows user. No unencrypted copy is
  written, no passphrase is used, and the files go to `%USERPROFILE%\PenguinBackups`
  with access for that user only. Tested on 2026-10-10 with a schema-only dump (no
  rows): the decrypted content matched the original byte for byte. A full backup has
  backup (schema and data) was taken and verified immediately before deployment.
  Restoring from it has not been rehearsed. It can only be opened by the same Windows account on the same
  computer.
- The migration changes no existing row, so undoing it loses only receipt state:

```sql
begin;
alter publication supabase_realtime drop table public.messages, public.conversations, public.conversation_reads;
drop policy if exists penguin_chat_typing_receive on realtime.messages;
drop policy if exists penguin_chat_typing_send on realtime.messages;
drop function if exists public.get_read_receipt(uuid);
drop trigger if exists penguin_read_receipt on public.conversation_reads;
alter table public.conversation_reads drop column if exists receipt_at;
drop function if exists penguin_chat_private.set_read_receipt();
drop function if exists penguin_chat_private.chat_topic_allowed(text);
drop function if exists penguin_chat_private.chat_peer_visible(uuid);
drop schema if exists penguin_chat_private;
commit;
```

```bash
supabase migration repair --status reverted 20261011090000 --linked
```

  The app needs no change afterwards: it falls back to Sprint 6A behaviour.

## How it was deployed

1. `bash tests/chat-db-verify.sh` passes.
2. `bash scripts/backup-hosted-encrypted.sh`, then `--verify` each file.
3. `supabase migration list --linked` shows `20261011090000` as the only pending version.
4. `supabase db push` (it applies only pending migrations and records the version).
5. Confirm in the dashboard that `supabase_realtime` lists the three chat tables.
6. Run the two-account checks in `docs/android-acceptance-checklist.md`.

## Limitations

- No unread badge on the tab icon and no push notification.
- Live updates stop in the background by design.
- Only your newest message shows a receipt.
- The "Unread" filter covers the conversations loaded so far.
