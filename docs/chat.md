# Sprint 6A: private chat foundation

Status: code and one migration in the repository. The migration has NOT been applied
to the hosted project. It has been applied to a disposable local database, where
`tests/chat-integration.sql` and `tests/chat-concurrency.sh` both passed (2026-10-09,
Supabase Postgres 17.11 image). No dependency was added. There is no live delivery yet; that is Sprint 6B.

## What is included

- One-to-one text conversations between students who finished onboarding.
- Messages entry on Home (mail button) and a Message button on other students' profiles.
- Conversation list with last-message preview; chat screen with the newest 30 messages,
  older pages by cursor, optimistic sending and Retry.
- Blocking, enforced in the database. Rate limits, enforced in the database.
- History that survives the other student's account deletion.

Not included: Realtime, push, typing, presence, attachments, groups, read receipts,
unread indicators, message deletion, local persistence.

## Schema

| Table | Purpose |
|---|---|
| `conversations` | One row per pair. `user_low < user_high`, unique pair. Summary columns (`last_message_at`, `last_message_sender_id`, `last_message_preview`) are written only by the send function. |
| `messages` | Client-generated `id`, `conversation_id`, `sender_id`, `content` (1–2,000 characters, not blank), server `created_at`. Never updated. |
| `conversation_reads` | One read cursor per participant. Prepared for Sprint 6B; not shown in the UI. |
| `user_blocks` | `(blocker_id, blocked_id)` primary key, no self-block. |

There is no participants table: a one-to-one conversation is fully described by its two
columns, and a second table would store the same fact twice.

## Account deletion

Existing behaviour is unchanged: deleting the auth user deletes the profile, which
cascades to posts, likes and comments. Chat adds only new foreign keys:

- `conversations.user_low`, `user_high`, `created_by`, `last_message_sender_id` and
  `messages.sender_id` reference `profiles` with `ON DELETE SET NULL`.
- `conversation_reads` and `user_blocks` rows of the deleted student are removed
  (`ON DELETE CASCADE`).

So when a student deletes their account:

- Nothing blocks or delays the deletion, and no profile row is kept for chat.
- The other participant still reads the conversation. The deleted side is `NULL`, so the
  app shows "Deleted Student" with no name, avatar, username or institution.
- The deleted student's messages keep their text but have no sender identity.
- New messages and new conversations are refused (`PC001`).
- When both participants have deleted their accounts the conversation and its messages
  are removed by a trigger.

Intentional exception: message text written by a deleted student remains readable by the
other participant. This is a deliberate product decision, not an oversight. Messages have
no automatic expiry.

## Security design

- Clients have `SELECT` only on `conversations`, `messages` and `conversation_reads`, and
  `SELECT`/`DELETE` on their own `user_blocks`. No direct insert or update exists, so
  blocking, limits, sender identity, timestamps and summaries cannot be bypassed.
- RLS: a conversation and its messages are visible only to its two participants; read
  cursors and blocks only to their owner.
- Writes go through five functions, all revoked from `public`/`anon` and granted to
  `authenticated`:
  - `get_or_create_conversation(other)` (definer)
  - `send_message_idempotent(message_id, conversation_id, content)` (definer)
  - `block_user(other)` (definer), `unblock_user(other)` (invoker)
  - `mark_conversation_read(conversation_id)` (definer)
- Definer functions use `search_path = ''`, schema-qualified objects, no dynamic SQL, and
  take the caller only from `auth.uid()`.
- Idempotency: the same message id with the same conversation and text returns the stored
  row; with anything different it is rejected (`22023`).
- Error codes: `42501` not allowed, `22023` invalid, `23514` bad text, `PC001` messaging
  unavailable (block either way or deleted account, deliberately indistinguishable),
  `PC002` rate limit.

### Ordering of blocks and sends

Creating a conversation, sending and blocking each take a transaction-level advisory lock
on the pair before checking anything, so for one pair they run one at a time. A send that
gets the lock first is stored before the block exists; a send that gets it after the block
commits is refused. Sending and creating also lock the sender first, so parallel requests
cannot slip past the limits.

### Rate limits

- 30 new messages per sender per minute.
- 20 new conversations per creator per day.

Retries of an already stored message are answered before the limit check and are not
counted. To change a limit, replace `penguin_chat_message_limit_per_minute()` or
`penguin_chat_conversation_limit_per_day()` in a later migration.

## Deployment (manual)

Nothing here was run for you.

1. Review `supabase/migrations/20261010120000_private_chat_foundation.sql`. It only
   creates new objects and runs in one transaction.
2. Run `bash tests/chat-db-verify.sh` (needs Docker and the Supabase Postgres image).
   It starts a throwaway local container with no published port, applies every
   migration in name order, runs `tests/chat-integration.sql` (72 assertions against
   the real schema, including real `auth.users` deletion) and
   `tests/chat-concurrency.sh` (18 multi-session checks), then removes the container.
   It must end with `chat concurrency: all checks passed`. It has no connection
   details for the hosted project and cannot reach it.
3. Apply the migration to the development project with your usual Supabase workflow. It
   must come after every existing migration (it references `public.profiles`).
4. Confirm in the dashboard that RLS is enabled on the four new tables.
5. Only then use the app build that contains Sprint 6A. Before the migration is applied
   the Messages screens show their error state.

Rollback, if ever needed, is dropping the four tables and eleven functions; no existing
object depends on them.

## App structure (`src/features/chat/`)

- `chat.ts`: pure rules (participants, previews, pagination, sending and retry state,
  date separators, error mapping, composer state).
- `service.ts`: reads and the five RPC calls.
- `use-conversations.ts`, `use-chat.ts`: account-scoped state.
- `conversations-screen.tsx`, `conversation-row.tsx`: the list.
- `chat-screen.tsx`, `message-bubble.tsx`, `composer.tsx`: the conversation.
- `message-student-button.tsx`: the profile action.

Routes: `/messages` and `/messages/[conversationId]`, both above the tabs.

## Known limits

- No live delivery: the list reloads when it comes back into view, and a conversation
  shows the other student's new messages when it is opened again.
- A block made by the other student is only discovered when a send is refused.
- The app has no screen to manage blocks outside a conversation.
- Unsent messages are held in memory only and are lost if the app is closed.
