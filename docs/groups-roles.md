# Sprint 7B: Group membership and roles

Recorded on 2026-10-12. Branch `fix/auth-pkce-s256`, nothing committed. Builds on
`docs/groups.md` (Sprint 7A), whose privacy rules are unchanged.

## Status at a glance

| Stage | Status |
|---|---|
| Implemented locally | Yes: one migration, app code, tests, documents |
| Tested automatically | Yes: see "Test results" |
| Applied to hosted Supabase | **No. Pending approval.** |
| Tested on Android | **No.** Nothing in this sprint has been run on a device |
| Committed, pushed, built | No |
| Open product decision | **Block immunity**: see "Outstanding approvals". Not implemented |

Until the migration is applied, the app runs against the hosted database as before and
offers no administration: it shows staff features only when the database reports that
it knows roles.

## What was built

- A third role, **admin**, between owner and member.
- The owner promotes members to admin and demotes admins.
- The owner and admins **remove** members, and **ban** them, within a strict hierarchy.
- **Bans** persist: a banned student cannot join again until the ban is lifted. Lifting
  a ban does not add them back.
- The owner **transfers ownership** to an existing admin, becomes an admin, and can then
  leave.
- The owner **edits** the group's name and description.
- A private **administration history**, and a **ban list**, for staff.
- Limits enforced in the database: 10 admins per group; 20 removals (bans included) per
  actor per hour.
- Archived groups reject every administrative change. Deleting an owner's account still
  archives the group; ownership is never transferred automatically.

## Permission matrix (as implemented and tested)

| Action | Owner | Admin | Member | Not in group |
|---|---|---|---|---|
| View visible members | Yes | Yes | Yes | Yes |
| Leave | After transferring ownership | Yes | Yes | n/a |
| Promote a member to admin | Yes | No | No | No |
| Demote an admin | Yes | No | No | No |
| Remove a member | Yes | Yes | No | No |
| Remove an admin | Yes | No | No | No |
| Ban a member | Yes | Yes | No | No |
| Ban an admin | Yes | No | No | No |
| Lift a ban | Any ban | Only a ban they placed on a member | No | No |
| Transfer ownership to an admin | Yes | No | No | No |
| Edit name and description | Yes | No | No | No |
| See the ban list | Yes | Yes | No | No |
| See the administration history | All of it | Removals, bans and unbans only | No | No |
| Act on the owner, or on yourself | Never | Never | Never | Never |
| Act on a student unavailable to you | Never | Never | Never | Never |
| Any change in an archived group | Never | Never | Leave only | No |

## Rules worth stating exactly

**Removal and ban are different.** Remove deletes the membership; the student may join
again at once. Ban deletes the membership and records a ban in the same transaction; the
student is refused by `join_group` until the ban is lifted.

**Who can be banned.** Only a current member the caller can see. A student who has
already left is answered exactly like any other non-member and is not banned; they can
be banned if they join again. There are no bans in advance.

**A join and a ban of the same student** are decided under the same lock, so they can
never both stand: either the ban comes first and the join is refused, or the join comes
first and the ban removes the new member.

**Ownership transfer.** Owner only, to a visible admin, in one transaction under the
group lock. The owner is demoted to admin first and the admin promoted second, so the
group never has two owners; both commit together, so it never has none. The app asks
for confirmation in words that say what the owner gives up.

**Removal limit.** 20 per actor in any sliding 60 minutes, counted across every group
that actor moderates, with a ban counting as a removal. It is counted from the
administration log, which clients cannot write, and always while the actor's own lock is
held, so parallel requests cannot pass it. It does not stop several admins acting
together (10 admins could remove 200 members an hour); the history shows who did it.

**Owner account deletion.** Unchanged: the group is archived and nobody is promoted.
Its admins stay admins of an archived group, where nothing can be changed.

**A removed or banned student is not told who did it.**

## Privacy and security guarantees

Kept from Sprint 7A and tested again with roles in place:

- The member count is the actual number of memberships and no block lowers it.
- A student who is unavailable to the caller (a block in either direction) is never
  identified: not in the member list, the ban list or the history.
- One grouped "Penguin User" entry stands for unavailable members. It has no menu.
- The Owner section is absent when the owner is unavailable. A hidden admin's role is
  not shown anywhere.

New in this sprint:

- **No membership test through administration.** For staff, an unavailable target gets
  exactly the answer a non-member gets (`PG008`), in every action, and that check comes
  before any role rule. For anyone who is not staff, every action is refused the same
  way whatever the target.
- **No role in any request.** No function accepts a role. The role each function gives
  is written in its body, so `owner` or `admin` cannot be passed in.
- **No client access to bans or the log.** Both tables have row-level security on, no
  policy, and no privilege for any client role. They are reached only through functions.
- **The ban list never says who placed a ban**, only whether this viewer may lift it.
- **The history returns names, never account identifiers**, and leaves out any entry
  whose actor or target is unavailable to the viewer.
- **One lock order everywhere**: the caller, then the group row, then the rows. Every
  decision about roles and membership is made while the group row is locked.
  `leave_group` was changed to follow it; before, a leave and an administrative action
  on the same member could deadlock.

## Database

Migration: `supabase/migrations/20261014090000_groups_roles_and_moderation.sql`.
Forward-only. The two deployed migrations are untouched (same SHA-256 as deployed).

| Object | Kind | Notes |
|---|---|---|
| `group_members.role` | constraint replaced | Now `owner`, `admin`, `member` |
| `group_members_staff_idx` | new index | Staff of a group |
| `group_bans` | new table | Group, student, who banned, role at the time, when. No client access |
| `group_admin_events` | new table | Group, actor, target, action, details, when. No client access |
| `promote_group_member(p_group_id, p_member_id)` | new function | Owner only. Idempotent |
| `demote_group_admin(p_group_id, p_member_id)` | new function | Owner only. Idempotent |
| `transfer_group_ownership(p_group_id, p_new_owner_id)` | new function | Owner only, to an admin |
| `remove_group_member(p_group_id, p_member_id)` | new function | Staff, by hierarchy, rate limited |
| `ban_group_member(p_group_id, p_member_id)` | new function | Staff, by hierarchy, rate limited |
| `unban_group_member(p_group_id, p_banned_id)` | new function | Owner any; admin own member bans |
| `update_group_details(p_group_id, p_name, p_description)` | new function | Owner only; creation rules apply |
| `list_group_bans(...)` | new function | Staff only, paged |
| `list_group_admin_events(...)` | new function | Staff only, paged |
| `join_group` | replaced in place | Refuses a banned student. Same signature and result |
| `leave_group` | replaced in place | Locks the group first. Same signature and behaviour |
| `get_group_viewer_summaries` | recreated | Adds `my_group_role` |
| `list_group_members` | recreated | Adds `group_role` |
| 6 helpers in `penguin_groups_private` | new | Limits, the shared start of every action, visibility, logging |

Unchanged: the tables' policies and grants, the count trigger, `hidden_from`,
`create_group_idempotent`, and everything in messaging, posts and profiles.

Error codes added: `PG007` banned from this group; `PG008` target not a member or
unavailable; `PG009` not allowed on this target; `PG010` removal limit; `PG011` admin
limit; `PG012` the new owner must be an admin. `42501` also means "not staff" or "not
the owner".

### Backward compatibility

App code written before roles knows only `owner` and `member` and treats anything else
as "not a member", which would have shown an admin a "Join group" button. This is
prevented in the database, not by rollout order:

- The existing columns `role` and `my_role` keep reporting an admin as `member`.
- The full role is in two new columns, `group_role` and `my_group_role`.

So earlier app code always sees an admin as a member (correctly able to leave), whatever
order app and database are updated in. The new app code reads the new columns, falls
back to the old ones, and offers administration only when the new columns are present.

One cosmetic gap: the direct read of a student's own memberships ("My groups") returns
the stored role, so earlier app code shows an admin's group there without a "Joined"
badge. The group is still listed and still opens correctly.

## App

No new tabs. Groups remain under Discover.

| Route | Screen |
|---|---|
| `/groups/[id]/members` | Role badges; a Manage button on members the viewer may act on; an action sheet; a confirmation for every action |
| `/groups/[id]/edit` | Owner only: name and description, with the creation rules and a discard question |
| `/groups/[id]/bans` | Staff: banned students, with "Lift ban" where allowed |
| `/groups/[id]/history` | Staff: the administration history, read-only |

The group screen shows the viewer's role badge and, for staff, rows leading to the three
screens above. After any action the list and the viewer's own role are read again from
the server, so what is shown is what happened.

Files added: `member-actions-sheet.tsx`, `edit-group-screen.tsx`,
`group-bans-screen.tsx`, `group-history-screen.tsx`, three route files.
Files changed: `groups.ts`, `service.ts`, `use-groups.ts`, `group-screen.tsx`,
`group-members-screen.tsx`, `src/lib/database.types.ts`,
`src/app/(protected)/_layout.tsx` (back swipe off for the edit form).

No dependency was added. Authentication, PKCE and messaging were not touched.

## Test results

Run on 2026-10-12, on the final migration file
(SHA-256 `e728fdde38e1f01e0f885076ce28fc53791acbc08cc0220a4838552bb03e6620`).

| Check | Result |
|---|---|
| `bash tests/groups-db-verify.sh` | Pass. 13 migrations apply in order |
| Sprint 7A database assertions | 137 pass (one updated, see below) |
| Sprint 7B database assertions (`tests/groups-roles-integration.sql`) | 105 pass |
| Concurrency checks | 63 pass (24 from Sprint 7A, 39 new) |
| Roles rollback rehearsal | 6 assertions pass |
| Full rollback rehearsal, then all three group migrations applied again | Pass |
| `bash tests/chat-db-verify.sh` (Sprint 6, with all three group migrations) | Pass: 72 + 44 assertions, 18 concurrency checks |
| `npx tsc --noEmit` | 0 errors |
| `npx expo lint` | Clean |
| `npm test` | 334 of 334 (315 before this sprint, 19 added) |
| `npx expo export --platform android` | Bundles |
| Hosted history and dry run (read-only) | `20261014090000` is the only pending migration |
| Device, emulator, browser | **Not done** |

What the new database tests cover:

- The full permission matrix for owner, admin, member, a student outside the group, one
  who has not finished onboarding, no session, and the anonymous role.
- Escalation: self-promotion, naming a role in a request, writing a role directly,
  acting in another student's group, acting on the owner.
- Bans: ban and rejoin, a ban covering one group only, banning someone who left, who may
  lift which ban, lifting a ban not restoring membership, the ban list and its paging.
- Blocking in both directions: every action answers an unavailable member exactly as a
  non-member; a hidden owner and a hidden admin are not listed and their roles are not
  shown; hidden students are left out of the ban list and the history; counts stay
  actual throughout.
- Ownership transfer and its refusals; the previous owner losing every owner power and
  being able to leave.
- Editing, including a taken name, invalid names and a case-only change.
- The admin cap and the removal limit, including across groups and the sliding window.
- Archived groups, and the owner's account deletion promoting nobody.
- History authorization, paging and deleted accounts.
- Consistency at the end: counts equal memberships, one owner per active group, nobody
  both banned and a member, no group over ten admins.

Concurrency: two transfers at once; one transfer sent six times; a transfer racing the
demotion of its recipient; 15 parallel promotions (exactly 10 succeed); 30 parallel
removals (exactly 20 succeed); a join waiting on a ban and a ban waiting on a join;
removal racing the member leaving, with no deadlock; removal racing account deletion;
ownership transfer racing the owner's account deletion in both orders.

Existing tests changed, each because an approved behaviour changed:

- `tests/groups-integration.sql`: the "not a role" check used `admin`, which is now a
  role; it uses another value.
- `tests/groups-rollback.sql`: also drops the two new tables.
- `tests/groups.test.mjs`: the list of error kinds; the owner's "can't leave" wording;
  "Edit group" and "Transfer" removed from the list of things the app must not offer;
  two expectations that now include the roles-supported flag.

## Known limitations

- **Block immunity (open decision).** Staff cannot act on a member who is unavailable to
  them. A member can therefore avoid one staff member's moderation by blocking them, and
  can avoid it entirely by blocking the owner of a group with no admins. Other staff, if
  any, can still act. See "Outstanding approvals".
- **A student who left cannot be banned** until they join again.
- **An admin cannot lift another staff member's ban**, only their own on a member.
- **Renaming is not rate limited.** An owner can rename a group as often as they like;
  every rename is in the history.
- **The removal limit does not stop coordinated admins.**
- **The history has no retention limit** and keeps the old and new group names.
- **The history and ban list are incomplete for a viewer with blocks**: entries about
  students unavailable to them are left out, by design.
- **A deadlock is possible** when an account is deleted at the same instant as an
  administrative action on that member. PostgreSQL cancels one; nothing is corrupted and
  the action can be repeated.
- **No notifications**: a removed, banned or promoted student is not told.
- **Realtime**: none. Screens show changes after a reload on focus or after an action.

## Rollout and rollback

**Rollout (only after approval).** Same procedure as Sprint 7A: database suites pass on
the file to deploy, encrypted backups taken and verified, `20261014090000` the sole
pending migration in the dry run, `npx supabase db push --linked`, read-only checks.

- Order of app and database does not matter (see "Backward compatibility").
- The constraint change takes a brief lock on `group_members`, a small table.
- No existing row is changed: no admin, ban or log entry exists until someone acts.
- Do not promote anyone or insert test data in the hosted project as part of deployment.

**Rollback: switch the feature off.** Rehearsed by `tests/groups-roles-rollback.sql`:

    begin;
    drop function public.promote_group_member(uuid, uuid);
    drop function public.demote_group_admin(uuid, uuid);
    drop function public.transfer_group_ownership(uuid, uuid);
    drop function public.remove_group_member(uuid, uuid);
    drop function public.ban_group_member(uuid, uuid);
    drop function public.unban_group_member(uuid, uuid);
    drop function public.update_group_details(uuid, text, text);
    drop function public.list_group_bans(uuid, timestamptz, uuid, integer);
    drop function public.list_group_admin_events(uuid, timestamptz, uuid, integer);
    delete from public.group_bans;
    update public.group_members set role = 'member' where role = 'admin';
    alter table public.group_members drop constraint group_members_role_values;
    alter table public.group_members
      add constraint group_members_role_values check (role in ('owner', 'member'));
    commit;

It keeps `join_group`, `leave_group` and the two read functions as this migration left
them (they answer earlier app code exactly as before) and keeps the two tables, because
`join_group` reads `group_bans`. Leave the migration recorded as applied in that case.

Risks of rolling back after use: **every ban is lifted and every admin becomes a
member, permanently.** Take a backup first and treat it as a product decision. Ownership
transfers that already happened are not undone.

## Android acceptance

Listed in `docs/android-acceptance-checklist.md` under "Sprint 7B: Group membership and
roles". Every item is DEFERRED and BLOCKED until the migration is applied.

## Outstanding approvals

1. **Deployment** of `20261014090000_groups_roles_and_moderation.sql` to the hosted
   project.
2. **Block immunity.** Not implemented, because every way to close it changes either
   the blocking privacy policy or who may remove whom. Options:

   | Option | What it does | Cost |
   |---|---|---|
   | A. Leave as is | Other staff act; an owner with no admins cannot remove a member who blocked them | Immunity remains in single-staff groups |
   | B. Reports | Members report a member they can see. Staff who can see the reported member act normally. If no staff member can, the owner may remove "the reported member" without being shown who it is | A new moderation power over someone the owner cannot see. Needs a threshold (for example two reporters), limits on reporting, and logging, or it can be abused to have someone removed |
   | C. No membership across a block with the owner | A student with a block between them and the owner cannot join; a member who later blocks the owner is removed | Needs a hook on blocking, which is messaging code this sprint may not change; and joining would reveal the block |
   | D. Staff see every member of their group | Blocks would not hide members from the group's staff | Weakens the deployed blocking protection |

   Recommendation: A now, and B as its own small sprint if immunity proves to be a real
   problem. B is the only option that neither weakens blocking nor touches messaging,
   but it creates a new authority and needs its abuse protections designed with you.
3. **The inferred rules** listed under "Rules worth stating exactly" and "Known
   limitations": no bans in advance; admins lift only their own member bans; the removal
   limit is per actor across groups and counts bans; admins see moderation events only.
4. **Commit.** Sprint 7A and 7B, including the two deployed migrations, are still
   uncommitted.
