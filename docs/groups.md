# Sprint 7A: Groups foundation

Recorded on 2026-10-11. Branch `fix/auth-pkce-s256`, nothing committed.

Sprint 7B (roles, removal, bans, ownership transfer, editing, admin history) is
described in `docs/groups-roles.md`. It is implemented locally and not deployed.

## Status at a glance

| Stage | Status |
|---|---|
| Implemented locally | Yes: migration, app code, tests, documents |
| Tested automatically | Yes: see "Automated test results" |
| Database tests on a disposable local database | Yes: passed |
| Applied to hosted Supabase | **Yes**, on 2026-10-11, to project `utdwgmvdhghmephbvxvj` with `supabase db push` (see "Hosted deployment"). The header comment inside the migration file still says "not applied"; the file is left exactly as it was applied |
| Tested on Android | **Core acceptance passed.** The user tested on Android and reported all 12 core checks as passed (see "Android acceptance"). The detailed and edge cases listed there are still untested. iOS and browser: never run |
| Committed, pushed, built | No |

The working tree already held uncommitted work from earlier sprints. It was listed in
`docs/sprint-7a-baseline-inventory.txt` before any Sprint 7A edit, so anything not in
that list (or listed under "Files" below as modified) is Sprint 7A.

## What students can do

1. Open Groups from the Groups row at the top of Discover.
2. See "My groups" (most recently joined first) and "Discover groups" (active groups,
   newest first, no ranking or recommendation).
3. Search groups by words in the name or description.
4. Open a group: name, description, real member count, owner, and one action.
5. Create a group with a name and an optional description. They become its owner.
6. Join an active group, and leave a group they joined.
7. Open a group's member list and from it a member's profile.

Not in this sprint: group posts, group chat, notifications, group images, private or
invitation-only groups, editing or deleting a group, removing members, transferring
ownership, realtime updates.

## Product rules

| Rule | Where it is enforced |
|---|---|
| Only signed-in students who finished onboarding can create or join | Database functions |
| Name: 3 to 60 characters after trimming and collapsing whitespace | Database constraint and function; the form says so first |
| Names are unique ignoring letter case and spacing | Unique index on `lower(name)` of the normalised name |
| A name cannot contain control characters or invisible formatting characters (zero-width space, direction overrides and similar), so two names that look the same cannot differ by a hidden character. Zero-width joiners stay allowed for scripts and emoji that need them. Added in the pre-deployment review | Database constraint and function; the form says so first |
| Description: optional, up to 500 characters | Database constraint and function |
| At most 3 groups created per student in any 24 hours | Database function (provisional number) |
| At most 100 joined groups per student, owned groups included | Database function (provisional number) |
| The creator becomes the owner, in the same transaction as the group | Database function |
| Joining always gives the role `member` | Database function; there is no role parameter |
| The owner cannot leave | Database function; the screen shows an explanation and no Leave button |
| One owner per group, one membership per student per group | Unique indexes |
| Every group is public | Database constraint |

Both limits live in two small functions (`penguin_groups_private.creation_limit_per_day`
and `joined_groups_limit`). Changing a number means replacing that function in a later
migration. The app repeats the numbers only to word its messages
(`src/features/groups/groups.ts`).

### Ownership lifecycle

A group is `active` or `archived`.

- A group becomes archived when its owner membership is removed. In this sprint that
  happens only when the owner deletes their account, because the owner cannot leave.
- An archived group keeps its other members and stays readable. Nobody can join it.
  Members can still leave. It no longer appears in "Discover groups" or in search; it
  stays in "My groups" for its members, marked "Archived".
- Its name stays taken.
- Nothing makes a group active again, and ownership is never transferred
  automatically. Both wait for a future ownership-resolution workflow.
- When any other member deletes their account, their memberships are removed and the
  counts follow. Nothing is archived.

## Database

Migration: `supabase/migrations/20261012090000_groups_foundation.sql`, applied to the
hosted project on 2026-10-11. It only adds objects: it changes no existing
table, policy, function, grant or row, and adds nothing to the Realtime publication.

### Tables

`public.groups`

| Column | Notes |
|---|---|
| `id` | uuid, primary key |
| `name` | 3 to 60 characters, stored normalised; unique on `lower(name)` |
| `description` | null, or 1 to 500 characters, trimmed |
| `creator_id` | who made it; set to null if that account is deleted; **not readable by the app** |
| `client_request_id` | makes creation repeatable; unique per creator; **not readable by the app** |
| `visibility` | always `public` |
| `status` | `active` or `archived` |
| `member_count` | the stored total, kept exact by a trigger; never negative; **not readable by the app** (see "Member counts") |
| `created_at`, `updated_at` | set by the database |

`public.group_members`

| Column | Notes |
|---|---|
| `group_id`, `user_id` | primary key together; both cascade on delete |
| `role` | `owner` or `member`; at most one owner per group |
| `joined_at` | set by the database |

A trigger on `group_members` adds or subtracts one from `member_count` for every
insert and delete, including deletes that cascade from a removed account, and archives
the group when the removed row was the owner's.

### Authorization model

Row-level security is on for both tables. Anonymous users have no access at all.
Signed-in users have **no insert, update or delete privilege** on either table.

What a signed-in student can read, and how:

| What | How | Limits |
|---|---|---|
| Groups (name, description, status, dates) | Directly from `groups` | Not the creator, the request identifier or the stored member count |
| Their **own** memberships | Directly from `group_members` | The read policy is `user_id = auth.uid()`. Filtering by another student returns nothing |
| The members of **one** group | `list_group_members(p_group_id, p_after_joined_at, p_after_user_id, p_limit)` | One group per call, at most 51 rows, presentation fields only (`username`, `display_name`, `avatar_url`, role, joined date). Only students who finished onboarding. Leaves out members hidden by a block |
| Member counts and their own role | `get_group_viewer_summaries(p_group_ids)` | At most 50 groups per call. The actual count plus a number of unavailable members (since `20261013090000`; before that, the count for this viewer). The role is the caller's own, nobody else's |

The only way to write is three functions:

| Function | Does |
|---|---|
| `create_group_idempotent(p_request_id, p_name, p_description)` | Stores the group and the owner membership together. Repeating the same request returns the same group |
| `join_group(p_group_id)` | Adds the caller as `member`. Repeating it returns the existing membership |
| `leave_group(p_group_id)` | Removes the caller's own membership. Returns false if there was none. Refuses the owner |

- All five functions are `SECURITY DEFINER` with an empty `search_path`, executable by
  signed-in users only, and take the caller only from `auth.uid()`. The write functions
  have no parameter for a user, creator or role. The read functions take groups, never
  a student; `p_after_user_id` is a page position and is refused unless its timestamp
  comes with it.
- Each write function takes a per-student advisory lock first, so one student's requests
  run one at a time and the limits cannot be passed by calling in parallel. Joining also
  locks the group row, so a join and the archiving of that group cannot interleave.
- Helper functions live in `penguin_groups_private`. The API does not expose that schema
  and no client role has any privilege on it.
- Neither policy reads its own table, so the policies cannot recurse.

Error codes: `42501` not signed in or profile incomplete; `22023` invalid argument or a
request identifier reused for a different group; `23514` name or description out of
range, or a name with an invisible character; `PG001` name taken; `PG002` daily
creation limit; `PG003` joined-groups limit; `PG004` group not found; `PG005` group
archived; `PG006` the owner cannot leave.

### Membership privacy

**What is prevented.** There is no request that returns the groups of a given student.
The membership table answers only about the caller, and neither read function accepts
a student to look up. This is enforced by the database, not by the screens: the same
holds for anyone calling the API directly with their own session.

**What is not prevented, and cannot be while member lists are public.** A member list
shows who is in a group. Someone willing to request the member list of every group, page
by page, can therefore work out which groups a particular student is in. The change
turns one request into a crawl of every group; it does not make the information secret.
Anyone who joins a public group should be understood to be visible as a member of it to
every signed-in student who looks at that group.

Stronger options, none of them built, each with a cost:

- Show member lists to members only. Stops the crawl for anyone who has not joined, but
  a student can no longer see who is in a group before joining it.
- Let each student hide their membership. Needs a setting, a default, and a rule for
  what the owner sees.
- Limit how many member lists one account can read per hour. Slows a crawl; does not
  stop a patient one, and needs storage for the counters.

### Member counts

**The policy was changed after the first deployment.** See "Member count policy
refinement" at the end of this document for the full account. In short:

| | First deployment (`20261012090000`) | Deployed since 2026-10-11 (`20261013090000`) |
|---|---|---|
| Number shown for a group | The members this viewer can see (the total minus members hidden from them) | The actual number of memberships, the same for everyone, never reduced by a block |
| Member list | Leaves hidden members out | Leaves them out, then accounts for them with one grouped "Penguin User" entry |
| What a viewer can tell from their own screen | Nothing about hidden members | How many members are unavailable to them |

The stored total is not readable directly by any client in either version; it is
returned by `get_group_viewer_summaries`.

### Blocks

A member is hidden from a viewer when either of the two has blocked the other. One rule
in the database (`penguin_groups_private.hidden_from`) is used for both the member list
and the count, and so also for the owner shown on the group screen. A student always
sees their own membership. Nothing about blocking was weakened: the block table, its
policies and the messaging rules are untouched.

- A block does not stop either student from joining or leaving the same group, and
  does not hide the group. Blocks restrict messaging only, as before.
- A blocked student's profile is still reachable through Discover search, exactly as
  before this sprint. Messaging and Discover behaviour were not changed.

## App

### Navigation

The bottom bar is unchanged: Home, Discover, Create, Messages, Profile. Groups is
reached from a "Groups" row at the top of Discover (shown while the search field is
empty) and opens as screens above the tabs.

| Route | File | Screen |
|---|---|---|
| `/groups` | `src/app/(protected)/groups/index.tsx` | My groups, Discover groups, search, Create |
| `/groups/new` | `src/app/(protected)/groups/new.tsx` | Create a group |
| `/groups/[id]` | `src/app/(protected)/groups/[id]/index.tsx` | Group details |
| `/groups/[id]/members` | `src/app/(protected)/groups/[id]/members.tsx` | Member list |

The placeholder tab screen `src/app/(protected)/(tabs)/groups.tsx` ("Groups are coming
soon") was removed and is no longer registered in the tabs navigator.

### Files

New, in `src/features/groups/`:

| File | Role |
|---|---|
| `groups.ts` | Domain rules with no React or network: validation, cursors, pages, list state, wording of errors |
| `service.ts` | Supabase reads and the three function calls |
| `use-groups.ts` | Hooks: my groups, discovery and search, members, one group |
| `groups-screen.tsx`, `group-screen.tsx`, `create-group-screen.tsx`, `group-members-screen.tsx` | Screens |
| `group-row.tsx`, `group-avatar.tsx` | List row and the initials tile |

Modified existing files:

| File | Change |
|---|---|
| `src/features/discover/discover-screen.tsx` | The Groups row |
| `src/features/discover/search-query.ts` | `groupSearchFilters`, beside the student and post filters |
| `src/lib/database.types.ts` | Group types, the two tables, the five functions |
| `src/app/(protected)/_layout.tsx` | Back swipe off for `/groups/new` |
| `src/app/(protected)/(tabs)/_layout.tsx` | Placeholder screen no longer registered |
| `src/components/navigation/tab-bar.tsx` | One comment |
| `tests/discover-search.test.mjs` | One assertion: it pinned `groups` as a tab screen, which is no longer true by design. It now asserts the opposite. The five-destination assertion is unchanged |

No dependency was added. Authentication, PKCE and the Sprint 6 chat code, migrations
and policies were not touched.

### Behaviour worth knowing

- **Truthful counts.** The member count shown is always the stored one. After Join or
  Leave the button stays busy until the group has been read again, so the count and
  the action shown afterwards come from the server, not from a guess.
- **No realtime.** Lists reload when their screen comes back into view. A count can be
  stale while a screen stays open.
- **Create is repeatable.** The form keeps one request identifier while its content is
  unchanged, so retrying after a lost response opens the group already created.
- **Name taken** is shown under the name field and clears as soon as the name is edited.
- **Leaving the form** with something typed asks first (Cancel and the Android Back);
  nothing happens while the group is being created.
- **Visual.** A group is shown by its initials in a rounded square, to tell it apart
  from a student, who is always a circle. Only existing tokens and primitives are used.

## Automated test results

Run on 2026-10-11.

| Check | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npx expo lint` | Clean |
| `npm test` | 315 of 315 pass (258 before this sprint, 57 added in `tests/groups.test.mjs`) |
| `npx expo export --platform android` | Bundles |
| `bash tests/groups-db-verify.sh` | Passes on the final migration: all 12 migrations apply in order (the 10 earlier ones, the groups foundation, then the count policy); 137 assertions; 24 concurrency checks; rollback rehearsal (5 assertions), after which the migration applies again and a second application is refused |
| `bash tests/chat-db-verify.sh` (Sprint 6, with the final groups migration also applied) | Passes, unchanged: 72 + 44 assertions, 18 concurrency checks |
| Hosted migration history, read-only (`supabase migration list --linked`) | The 10 earlier versions are recorded as applied and match the local files; `20261012090000` is the only pending one |
| `supabase db push --dry-run --linked` (applies nothing) | "Would push these migrations: 20261012090000_groups_foundation.sql" and nothing else |
| Hosted API, anonymous read-only probes | `groups`, `group_members` and `join_group` do not exist yet (no name collision); `profiles`, `user_blocks` and `get_read_receipt` exist and refuse anonymous access |
| Device, emulator, browser | **Not done** |

The database tests run in a disposable local Docker container
(`public.ecr.aws/supabase/postgres:17.11.0.002`) that is removed afterwards. They have no
connection details for the hosted project.

What the database tests cover (`tests/groups-integration.sql`,
`tests/groups-concurrency.sh`):

- Grants: no write privilege for clients, nothing for anonymous users, hidden columns
  unreadable, helper functions not callable, definer functions pin their search path.
- Creation: normalisation, replay, a reused identifier for a different group, every
  validation limit, uniqueness across case and spacing, eligibility, atomicity (a
  forced failure of the owner membership leaves no group behind), the daily limit and
  its 24-hour window.
- Malicious direct requests: inserting a group, forging an owner membership, adding
  another student, changing a role, updating or deleting a group, removing another
  member, calling the functions with a role or another user.
- Join and leave: idempotency, counts, a missing group, the owner refused.
- Read isolation and blocks in both directions, including a blocked owner.
- Membership privacy: a direct read returns only the caller's own rows, filtering by
  another student returns nothing, the member list pages one group at a time, the read
  functions refuse bad input, half a cursor, students who have not finished onboarding
  and anonymous callers, and the blocks helper cannot be called.
- Counts: for every group and for viewers with and without hidden members, the count a
  viewer is told equals the length of their member list; the stored count is unreadable.
- The 100-group limit, and that leaving makes room.
- Ownership lifecycle: owner account deleted, group archived, members kept, joins
  refused, members can leave, the deleted identifier gets nothing.
- Concurrency: one request sent six times; six students creating one name; the
  creation and joined-group limits under parallel requests; 20 simultaneous joins;
  one student joining eight times at once; interleaved joins and leaves; a join racing
  the owner's account deletion, in both orders. Counts stay exact throughout.

What the unit tests cover (`tests/groups.test.mjs`): validation and request reuse,
identifier and cursor checks against injected filter syntax, pagination and
de-duplication, list state (loading, empty, error, failed reload, stale answers), search
filters, the single action per viewer, error wording, the security shape of the
migration, what the service sends and reads, navigation (five destinations, routes,
entry point, account keying), and screen rules (states present, owner never offered
Leave, double-submit guard, discard question, tokens only, labelled controls).

Not covered by any automated test: rendering, layout, keyboard behaviour, screen
readers, and the app talking to a real Supabase project.

## Manual Android acceptance

Listed in `docs/android-acceptance-checklist.md` under "Sprint 7A: Groups foundation".
The 12 core checks are PASS, as reported by the user. Every other item is DEFERRED. See
"Android acceptance" at the end of this document for the summary.

## Known limitations

- **Moderation is deferred.** Group names and descriptions are not moderated and there
  is no way to report a group. Two risks remain with names:
  - *Look-alikes.* Names are unique ignoring case and spacing, and invisible characters
    are refused, but an accented letter or a same-looking letter from another alphabet
    still makes a different name ("Chess Club" with a Cyrillic "С").
  - *Squatting.* There is no rename or delete, and each student can create 3 groups a
    day, so a name can be taken and held. Removing a group needs an administrator.
  Both need moderation tools (report, review, administrative rename or removal), not
  more validation. The validation and the creation limits stay as they are.
- An owner cannot leave, rename, edit or delete their group. A group created by
  mistake stays, and its name stays taken.
- An archived group cannot be recovered.
- Search matches whole words anywhere in the name or description, case-insensitively,
  with no ranking, and without a substring index (the same choice as student search).
  It is not accent-insensitive.
- "Discover groups" also lists groups the student is already in, marked "Joined" or
  "Owner".
- The member count is the actual one, so a student can see how many members are unavailable to them (see "Member count policy refinement").
- Public member lists can be crawled group by group (see "Membership privacy").
- No realtime: counts and lists refresh when a screen regains focus.
- The limits (3 a day, 100 joined) are provisional.
- The "Groups" row in Discover is hidden while a search is typed.
- iOS has never been run for this project.

## Deferred

- **7B (suggested):** edit a group, group image (needs a safe upload path), delete a
  group, ownership transfer and resolving archived groups, remove a member, report a
  group.
- **7C (suggested):** group posts.
- **7D (suggested):** group chat and notifications; private or invitation-only groups
  with their own authorization design.

These are suggestions for planning, not decisions.

## Deployment and rollback

The hosted project `utdwgmvdhghmephbvxvj` is on the Free plan: it has no automatic
backups and no point-in-time recovery, so the backup below is the only one.

**Deploy (only after approval).** The same procedure as Sprint 6B:

1. Docker running. `bash tests/groups-db-verify.sh` and `bash tests/chat-db-verify.sh`
   both pass on the file about to be deployed.
2. `bash scripts/backup-hosted-encrypted.sh` (schema and data; it only reads from the
   project), then `bash scripts/backup-hosted-encrypted.sh --verify <file>` for each of
   the two files it prints. Stop if either cannot be verified.
3. `npx supabase migration list --linked`: the only pending version must be
   `20261012090000`. `npx supabase db push --dry-run --linked` must name that one file
   and nothing else. Stop otherwise.
4. `npx supabase db push --linked`. The file wraps itself in one transaction: it applies
   completely or not at all, and fails, changing nothing, if any object it creates
   already exists (for example a `groups` table or the `penguin_groups_private` schema).
5. Read-only checks afterwards:
   - `npx supabase migration list --linked` shows `20261012090000` as applied. If the
     objects exist but the version is not recorded, record it with
     `npx supabase migration repair --status applied 20261012090000 --linked`; do not
     run the file again.
   - Anonymous requests to `groups`, `group_members` and the five functions are
     refused with "permission denied" (they exist and are closed), no longer "not found".
   - In the SQL editor: both tables have row-level security on; `authenticated` has no
     insert, update or delete privilege on them and cannot select
     `groups.member_count`; `group_members` has exactly one policy, `group_members_own_read`;
     `anon` can execute none of the five functions; row counts of `profiles`, `conversations` and `messages` are unchanged.
   - `penguin_groups_private` is not among the API's exposed schemas (Project Settings,
     Data API). It is not unless someone added it.
6. On the phone, with the development APK and the local development server: open
   Discover, then Groups, and run the Sprint 7A checklist. No new build is needed: the
   app change is JavaScript only.

Nothing in the migration rewrites or locks existing data. It creates two empty tables
with foreign keys to `profiles`, which takes a brief lock on `profiles` while the
constraint is added; with empty new tables this is momentary.

The app is safe to run before the migration is applied: Groups shows "Groups couldn't
load" with Try again, and nothing else is affected.

**Rollback.** Before any group exists, removing the objects is clean:

    begin;
    drop function public.create_group_idempotent(uuid, text, text);
    drop function public.join_group(uuid);
    drop function public.leave_group(uuid);
    drop function public.get_group_viewer_summaries(uuid[]);
    drop function public.list_group_members(uuid, timestamptz, uuid, integer);
    drop table public.group_members;
    drop table public.groups;
    drop schema penguin_groups_private cascade;
    commit;

Then mark the version as not applied, so a later push can apply it again:

    npx supabase migration repair --status reverted 20261012090000 --linked

This rollback is rehearsed by `tests/groups-rollback.sql` on the disposable database:
it removes every group object, removes nothing from earlier sprints, leaves the row
counts of profiles and chat tables unchanged, and the migration applies again afterwards.

After students have created groups, the same statements delete that data permanently,
so take a backup first and treat it as a product decision, not a routine rollback.
Nothing outside these objects is affected either way.

## Pre-deployment review (2026-10-11)

A second read of the migration before deployment, with the results of the checks above.

Changed as a result:

- Group names now refuse control and invisible formatting characters. Without this, a
  name with a zero-width space would have been a different name that looks identical,
  which defeats unique names.
- Two tests were added: the account deletion that removes memberships now runs as the
  role the hosted auth service uses (which has no privilege on the group tables), and
  the documented rollback is rehearsed.

Checked and left as designed:

- **Privilege escalation.** The three definer functions pin an empty search path,
  qualify what they call, take the caller only from the session and accept no user,
  creator or role. Clients hold no write privilege, so there is no other write path.
  Supabase grants new `public` tables and functions to `anon` and `authenticated` by
  default; the migration revokes that explicitly, and the tests assert the result.
- **Race conditions.** Covered by the concurrency suite. One case is left to the
  database: two accounts that share two or more groups being deleted at the same instant
  can update those groups' counts in opposite orders. PostgreSQL then cancels one of the
  two deletions with a deadlock error; nothing is corrupted and the deletion can be
  repeated.

Unresolved risks, for a decision rather than a fix (items 1 to 4 were then addressed or
documented in "Privacy hardening" below):

1. Membership was readable by student. *Addressed: see "Membership privacy".*
2. A hidden member could be inferred from the count. *Addressed: see "Member counts".*
3. Look-alike names. *Documented as deferred moderation work under "Known limitations".*
4. Name squatting. *Documented as deferred moderation work under "Known limitations".*
5. **The app has not been run against a real API with these tables.** The database is
   tested directly and the app's requests are checked by reading the code. The first
   real request happens after deployment, on the phone. If a screen fails there, the
   failure is visible ("Groups couldn't load") and nothing else in the app depends on it.
6. **`db push` records the version in a separate step** from the migration's own
   transaction. If that step failed, the objects would exist without a history row; the
   repair command in step 5 covers it.
7. **Backups are tied to this Windows account and computer** (see the backup script).
8. No device, emulator or browser run has been done for Groups.


## Privacy hardening (2026-10-11)

Made after the pre-deployment review and before any deployment. The migration file was
edited in place; it has never been applied anywhere but the disposable test database.

| Before | After |
|---|---|
| Any signed-in student could read every membership row, so one request listed all the groups of a chosen student | A student reads only their own membership rows. Other members are read one group at a time through `list_group_members` |
| The stored member count was readable and could exceed the visible member list | The stored count is not readable. `get_group_viewer_summaries` returns the count for the viewer, which always equals their member list |
| Blocks were applied by the read policy on `group_members` | Blocks are applied inside the two read functions by one shared rule. Enforcement is unchanged in effect and no longer depends on a policy helper that clients could execute |
| `authenticated` had usage on `penguin_groups_private` | No client role has any privilege on that schema |
| `create_group_idempotent` returned the stored member count | It no longer returns a count |

In the app, `src/features/groups/service.ts` now gets counts and the viewer's role from
`get_group_viewer_summaries` and members from `list_group_members`; the only direct
read of `group_members` is the caller's own groups. No screen changed its layout.

Unavoidable limitations that remain: public member lists can be crawled group by group;
two students comparing counts can notice a difference; look-alike names and name
squatting need moderation. Each is described in its section above.

## Hosted deployment (2026-10-11)

Done with explicit approval, following "Deployment and rollback" above.

| Step | Result |
|---|---|
| Docker | Responding (4 of 4 checks). Free memory was about 0.8 GB |
| File deployed | SHA-256 `950e3935231cc3127a0d70b38e58d916f174cf46fa77a70b15259500770598f7`, identical to the file the database suites passed on |
| Encrypted backups | `penguin-utdwgmvdhghmephbvxvj-20261011T013450Z-schema.sql.dpapi` (211,458 bytes before encryption) and `...-data.sql.dpapi` (56,209 bytes), in `%USERPROFILE%\PenguinBackups` |
| Backup verification | Both decrypted in memory; size and SHA-256 equal to what was written. The schema backup holds 46 tables and the data backup 44 table sections |
| History and dry run before | 10 versions applied, `20261012090000` the only pending one; the dry run named that file alone |
| `supabase db push --linked` | "Applying migration 20261012090000_groups_foundation.sql... Finished supabase db push." Exit 0 |
| History after | `20261012090000` recorded as applied; a new dry run reports "Remote database is up to date" |

Read-only checks after deployment:

| Check | Result |
|---|---|
| Schema compared with the backup, line by line (schemas `public`, `auth`, `storage`) | No earlier line is missing or changed. Every new line belongs to the groups objects: 2 tables, 2 policies, 5 public functions, 6 indexes, 1 trigger and their grants |
| Policies | `groups_authenticated_read` and `group_members_own_read` (`user_id = auth.uid()`), and no other policy on either table |
| Grants | `authenticated`: select on the listed columns only (not `member_count`, `creator_id` or `client_request_id`) and execute on the 5 functions. No write privilege. Nothing granted to `anon` |
| `penguin_groups_private` | 5 helper functions, each revoked from everyone, and no grant to any client role |
| Anonymous requests to `groups`, `group_members` and the 5 functions | All refused: 401, "permission denied" |
| Anonymous requests to `profiles`, `conversations`, `messages`, `user_blocks`, `posts` and three chat functions | All still refused, as before |
| Chat realtime policies | `penguin_chat_typing_receive` and `penguin_chat_typing_send` still present |
| Auth service | Responds; email sign-in on, email confirmation still required |
| Row counts before and after | Unchanged: `profiles` 10, `auth.users` 10, `conversations` 3, `messages` 18, `conversation_reads` 5, `user_blocks` 1, `posts` 24, `post_likes` 39, `post_comments` 9. `groups` 0, `group_members` 0 |

No test data was created or deleted in the hosted project. The probes of functions used
an identifier that matches nothing and were refused before doing anything.

Not checked, because it needs a signed-in student: any request as `authenticated`. The
first such requests are the Android acceptance run.

## Android acceptance (reported 2026-10-11)

**Sprint 7A: core Android acceptance passed.** The user tested on Android, against the
hosted project with the migration applied, and reported these 12 checks as passed. They
are recorded as reported; nothing here was observed by anyone else or by a tool.

| # | Core check | Result |
|---|---|---|
| 1 | Discover Groups entry point | PASS |
| 2 | Groups list loads without errors | PASS |
| 3 | Group creation | PASS |
| 4 | Correct owner and initial member count | PASS |
| 5 | My Groups listing | PASS |
| 6 | Discovery and joining from a second account | PASS |
| 7 | Member count increases to 2 | PASS |
| 8 | Leaving returns the count to 1 | PASS |
| 9 | Group search | PASS |
| 10 | Light and Dark Mode | PASS |
| 11 | Navigation and keyboard behavior | PASS |
| 12 | Bidirectional blocking visibility | PASS |

This also settles two risks listed in the pre-deployment review: the app has now talked
to the real API with these tables, and a device run has been done for the core flows.

### Still deferred (untested, not failed)

Tracked item by item in `docs/android-acceptance-checklist.md`.

- **Limits and validation messages:** an empty or too-short name; a name already taken in
  another case or spacing; the fourth group in a day; the 100-group limit; the
  description counter at 500.
- **Double submission:** tapping Create or Join twice quickly.
- **Leaving the form:** "Discard this group?" on Cancel and on Android back.
- **Confirmations and wording:** the "Leave this group?" dialog; the owner's "You own
  this group" explanation with no Leave button; "Joined" and "Owner" badges in both
  sections.
- **Paging:** more than 20 groups, more than 20 joined groups, more than 30 members.
- **Search details:** two words, letter case, the "at least 2" hint, "No groups match"
  and "Clear search".
- **Offline:** airplane mode on each screen, and recovery with "Try again".
- **Member list details:** owner first with the badge, "(you)" on your own row, opening
  a member's profile and returning.
- **Blocking details:** a third member still sees both students; each student's count
  equals the rows in their own list; a blocked owner is not shown as the owner;
  messaging between the two is unchanged.
- **Empty states:** no groups anywhere.
- **Ownership lifecycle:** an archived group after its owner's account is deleted. Needs
  a test account that can be deleted.
- **Account switching:** "My groups" and a search belong only to the new account.
- **Devices and accessibility:** small phones (320 to 360dp), font size 130% and 200%,
  gesture and three-button navigation, TalkBack.
- **iOS:** never run for this project.

Sprint 7A is therefore accepted for its core flows on Android. It is not accepted for
the cases above until they are run.

## Member count policy refinement (2026-10-11)

**Applied to the hosted project on 2026-10-11** (see "Hosted deployment of the count
policy" below). Not yet run on a device. The header comment inside the migration file
still says "not applied"; the file is left exactly as it was applied.

Migration: `supabase/migrations/20261013090000_groups_member_count_policy.sql`. The
deployed `20261012090000_groups_foundation.sql` is not edited (same SHA-256 as deployed).

### The new rules

1. The member count shown everywhere is the actual number of memberships. It is the
   same for every viewer and a block never lowers it.
2. A member who is unavailable to a viewer is never identified to that viewer.
3. Unavailable members are accounted for by **one grouped, non-interactive entry** after
   the last visible member: "Penguin User" for one, "N Penguin Users" for several, with
   the caption "Profile not available". It has a generic avatar and no username, link,
   message action or identifier. The interface never mentions blocking.
4. The Owner section is shown only when the owner is visible. Nothing stands in for an
   owner who is not.

### What changed

| Layer | Change |
|---|---|
| Database | One function replaced: `get_group_viewer_summaries` now returns `member_count` (the stored total), `unavailable_member_count` (a number) and `my_role`. Dropped and recreated in one transaction, with the same access |
| Database, unchanged | Tables, policies, grants, the count trigger, `hidden_from`, `list_group_members`, the three write functions, everything in messaging and Discover |
| Service | Counts come back unadjusted. The first page of a member list also fetches the number of unavailable members |
| Member list | One grouped entry as the list footer, shown only when every page is loaded |
| Group screen, list rows | No layout change; they show the actual count |

**API response.** `get_group_viewer_summaries(p_group_ids)` returns, per group:

    group_id                  uuid
    member_count              integer   actual memberships
    unavailable_member_count  integer   how many the caller cannot see
    my_role                   text      the caller's own role, or null

`list_group_members` is unchanged: it returns visible members only. For every viewer,
members listed + `unavailable_member_count` = `member_count`.

**Masking is done in the database.** Nothing about an unavailable member is sent to the
app: no identifier, name, role, join date or position. The app receives one number and
draws one entry from it. There are no placeholder rows and no synthetic identifiers.

**Paging.** The grouped entry is not a row of the list. It is drawn once, as the list
footer, and only when the first page has arrived, no further page exists, none is
loading and none has failed. Loading pages therefore cannot repeat it or show it early.
The number arrives with the first page and later pages do not change it.

### Privacy trade-off (accepted by the product owner)

Showing the real count means a student can subtract their visible list from it. The
grouped entry states that difference openly. Compared with the earlier design:

- A student can now see **how many** members are unavailable to them in a group.
- The only reason a member is unavailable today is a block, in one direction or the
  other. A student who has blocked nobody in a group can therefore conclude that someone
  in it has blocked them. The interface gives no reason, but the conclusion is available.
- In a small group, or by comparing with another student's list, they may work out who.
- An active group always has an owner, so a missing Owner section tells a viewer that
  the owner is unavailable to them. This was already true.
- A student may notice the count rise with no new visible member, and conclude that an
  unavailable student joined.

What stays protected: who the unavailable members are, their role, when they joined and
where they would sit in the list. Messaging and Discover blocking rules are unchanged.

### Test results

| Check | Result |
|---|---|
| `bash tests/groups-db-verify.sh` | Pass: 12 migrations in order; 137 assertions; 24 concurrency checks; rollback rehearsal; both groups migrations apply again afterwards |
| `bash tests/chat-db-verify.sh` (with both groups migrations applied) | Pass: 72 + 44 assertions, 18 concurrency checks |
| `npx tsc --noEmit` | 0 errors |
| `npx expo lint` | Clean |
| `npm test` | 315 of 315 (9 added for this change) |
| `npx expo export --platform android` | Bundles |
| Hosted history (read-only) | `20261013090000` is the only pending migration; the dry run names it alone |

The database tests cover: a block in each direction (count stays actual, one
unavailable, the other member not listed); a third member with nobody unavailable; two
unavailable members of whom one is the owner (no owner listed, nothing marks which);
groups with nobody unavailable; paging with an unavailable member; an archived group for
a viewer with and without an unavailable member; and that a summary has exactly four
columns, none identifying a member.

### Deployment and rollback

Deploy with the same procedure as before: database suites pass, encrypted backups taken
and verified, `20261013090000` the sole pending migration in the dry run, then
`npx supabase db push --linked`, then the read-only checks. The earlier app code keeps
working during and after the change, so the order of app and database does not matter.

Rollback restores the earlier function. No data is involved:

    begin;
    drop function public.get_group_viewer_summaries(uuid[]);
    -- then the "create function public.get_group_viewer_summaries" statement and its
    -- revoke and grant, copied unchanged from 20261012090000_groups_foundation.sql
    commit;
    npx supabase migration repair --status reverted 20261013090000 --linked

### Effect on the Android acceptance results

The 12 core checks were reported against the earlier behaviour. "Bidirectional blocking
visibility" still holds for identities. The count now behaves differently with a block
in place, so new device checks were added to the checklist as DEFERRED. The migration
is deployed, so they can now be run.

### Hosted deployment of the count policy (2026-10-11)

Done with explicit approval for this one migration.

| Step | Result |
|---|---|
| Docker | Responding (4 of 4 checks). Free memory was about 0.5 GB |
| File deployed | SHA-256 `ea5d788adc77276ea18eb0d0eeac517d9a408effe5c50a59a157969dabe1ec6f`, identical to the tested file |
| Encrypted backups | `penguin-utdwgmvdhghmephbvxvj-20261011T021303Z-schema.sql.dpapi` (228,895 bytes before encryption) and `...-data.sql.dpapi` (57,437 bytes), in `%USERPROFILE%\PenguinBackups` |
| Backup verification | Both decrypted in memory; size and SHA-256 equal to what was written |
| History and dry run before | 11 versions applied, `20261013090000` the only pending one; the dry run named that file alone |
| `supabase db push --linked` | "Applying migration 20261013090000_groups_member_count_policy.sql... Finished supabase db push." Exit 0 |
| History after | `20261013090000` recorded as applied; a new dry run reports "Remote database is up to date" |

Read-only checks after deployment:

| Check | Result |
|---|---|
| Live schema compared with the backup, line by line (`public`, `auth`, `storage`) | 3 lines removed and 5 added, all inside `get_group_viewer_summaries`: the new signature, the unadjusted count, and its comment. Nothing else differs |
| New signature | `(p_group_ids uuid[])` returning `group_id`, `member_count`, `unavailable_member_count`, `my_role` |
| Its permissions | Revoked from PUBLIC; execute for `authenticated` and `service_role`; nothing for `anon` |
| Object counts before and after | Tables 48, policies 24, functions 47, triggers 17, indexes 82 + 23, grants 232, revokes 26: all unchanged |
| Group tables, policies, write functions, `list_group_members` | Unchanged (no differing line) |
| `penguin_groups_private` | Still no grant to any client role |
| Anonymous requests to the 2 group tables, the 5 group functions, `profiles`, `conversations`, `messages`, `user_blocks` and two chat functions | All refused: 401, "permission denied" |
| Chat realtime policies | Both still present |
| Auth service | Email sign-in on, email confirmation still required |
| Row counts before and after | Unchanged: `profiles` 10, `auth.users` 10, `conversations` 3, `messages` 22, `conversation_reads` 5, `user_blocks` 1, `posts` 24, `post_likes` 39, `post_comments` 9, `groups` 1, `group_members` 2 |

No data was created, changed or deleted. Not checked, because it needs a signed-in
student: any request as `authenticated`. Those are the Android checks.
