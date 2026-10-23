# Penguin roadmap

The authoritative index of sprints. Details live in each sprint's document; device
results live in `docs/android-acceptance-checklist.md`. Update this file in the same
change as any sprint, deployment or acceptance result.

Last reconciled: 2026-10-17, from repository documents only.

## How to read the status columns

Each sprint has three separate statuses.

- **Implementation**: PLANNED, IN PROGRESS, IMPLEMENTED LOCALLY, OPTIONAL, UNDEFINED.
- **Hosted deployment** (project `utdwgmvdhghmephbvxvj`): NONE (no migration),
  NOT APPLIED, DOCUMENTED *date* (a document records it), VERIFIED *date* (read-only
  `supabase migration list --linked` output seen in that session). Everything below is
  verified on 2026-10-17 (see "Hosted verification").
- **Android acceptance**: counts from the checklist, as `PASS / FAIL / DEFERRED`.
  Only the user's device report makes an item PASS. Automated database runs are listed
  separately and never count as Android PASS. CORE ACCEPTED means the user accepted the
  sprint's core flows; FULLY ACCEPTED means no DEFERRED item remains.

## Status table

| Sprint | Name | Implementation | Hosted deployment | Android (PASS / FAIL / DEFERRED) | Document |
|---|---|---|---|---|---|
| 0 | Project foundation | IMPLEMENTED LOCALLY; report says INCOMPLETE (native acceptance pending) | NONE | No checklist section | `sprint-0-verification.md` |
| 1A | Authentication foundation | IMPLEMENTED LOCALLY | NONE (Supabase Auth settings, see doc) | See 1 below | `authentication.md` |
| 1B | Verification and password recovery | IMPLEMENTED LOCALLY | Dashboard settings documented in doc | "Sprint 1": 4 / 0 / 9 | `auth-email-flows.md` |
| 1 (fix) | PKCE S256 and lock removal | IMPLEMENTED LOCALLY | NONE | "Auth: PKCE S256": 5 / 0 / 3 | `auth-email-flows.md` |
| 2A | Student identity | IMPLEMENTED LOCALLY | VERIFIED 2026-10-17; applied 2026-10-09 (`20261005023355`) | No checklist section | `student-identity.md` |
| 2B | Onboarding | IMPLEMENTED LOCALLY | VERIFIED 2026-10-17; applied 2026-10-09 (`20261005172253`) | No checklist section | `onboarding.md` |
| 2C | Student profile and editing | IMPLEMENTED LOCALLY | NONE beyond 2A | No checklist section | `profile.md` |
| 3A | Posts and private images | IMPLEMENTED LOCALLY | VERIFIED 2026-10-17; applied 2026-10-09 (`20261005182705`, `20261005233227`) | "Home feed": 0 / 0 / 7 | `posts-media.md` |
| 3B | Create Post / Feed UI | Listed as "Deferred Sprint 3B" in `posts-media.md`; Create Post and feed now exist in code, but no 3B document records them | — | — | `posts-media.md` |
| 4 *(proposed)* | Social interactions: likes and comments | IMPLEMENTED LOCALLY (commit `8796c11`) | VERIFIED 2026-10-17; applied 2026-10-09 (`20261008*`, four migrations) | No checklist section | None. **Classification pending user approval** |
| 5A | Discover: student search | IMPLEMENTED LOCALLY | NONE (no migration) | 5 / 0 / 20 | `discover.md` |
| 5B | Discover: post search | IMPLEMENTED LOCALLY | NONE (no migration) | 0 / 0 / 23 | `discover.md` |
| 6A | Private chat foundation | IMPLEMENTED LOCALLY | VERIFIED 2026-10-17; applied 2026-10-09 (`20261010120000`, SQL editor, history repaired) | 0 / 0 / 25 | `chat.md` |
| 6B | Live chat | IMPLEMENTED LOCALLY | VERIFIED 2026-10-17; applied 2026-10-10 (`20261011090000`) | 0 / 0 / 17; automated DB run PASS 2026-10-10 | `chat-realtime.md` |
| 6C | Messaging enhancements | OPTIONAL / UNDEFINED | — | — | None |
| 7A | Groups foundation | IMPLEMENTED LOCALLY | VERIFIED 2026-10-17; applied 2026-10-11 (`20261012090000`, `20261013090000`) | 12 / 0 / 51 (+1 SUPERSEDED); **CORE ACCEPTED** | `groups.md` |
| 7B | Group roles and moderation | IMPLEMENTED LOCALLY | VERIFIED 2026-10-17; applied 2026-10-17 (`20261014090000`) | 0 / 0 / 40 (+1 SUPERSEDED); automated DB run PASS 2026-10-12 | `groups-roles.md` |
| 7C | Group feed | PLANNED / SCOPE NOT YET APPROVED | — | — | None |
| 7D | Group discovery and reports | PLANNED / SCOPE NOT YET APPROVED | — | — | None |
| 8A | Profile redesign and connections | IMPLEMENTED LOCALLY (branch `feat/design-system-v2`) | VERIFIED 2026-10-23; applied 2026-10-23 with user approval (`20261023090000`, `20261023100000`) | 0 / 0 / 0, no checklist section yet; automated DB run PASS 2026-10-23 | `profile-connections.md` |
| 8 | Notifications (in-app) | IMPLEMENTED LOCALLY (branch `feat/design-system-v2`); scope from the user 2026-10-24 | VERIFIED 2026-10-24; applied 2026-10-24 with user approval (`20261024090000`) | 0 / 0 / 0, no checklist section yet; automated DB run PASS 2026-10-24 | `notifications.md` |
| 9 | Settings and privacy | PLANNED / SCOPE NOT YET APPROVED | — | — | None |
| 10 | Testing, security and Android beta | PLANNED / SCOPE NOT YET APPROVED | — | — | None |

No sprint is FULLY ACCEPTED. The checklist contains no FAIL items.

Cross-cutting checklist sections (not tied to one sprint), PASS / FAIL / DEFERRED:
Android APK 4 / 0 / 2 · Design system 0 / 0 / 30 · Brand 0 / 0 / 5 · Messages redesign
0 / 0 / 7 · Chat bubbles 0 / 0 / 8 · Chat composer 0 / 0 / 10 · UI/UX refinement pass
0 / 0 / 6.

## Mapping to the product roadmap

The product plan names Sprint 1 Authentication, 2 Student profiles, 3 Social feed and
4 Social interactions. Historical work maps as: 1 = 1A + 1B + PKCE fix; 2 = 2A + 2B + 2C;
3 = 3A (+ the undocumented 3B UI). Sprint 4 has no historical document; the likes and
comments work is *proposed* as Sprint 4 until the user approves it.

## Hosted verification

2026-10-17, with the user's approval: read-only `npx supabase migration list --linked`
against `utdwgmvdhghmephbvxvj`. All 13 local migrations, `20261005023355` through
`20261014090000`, appear in both the local and remote columns. No version is local-only
and none is remote-only. This proves the versions are recorded as applied in the
migration history; it does not inspect the schema itself.

## Known documentation discrepancies

- Migration `20261011090000_chat_realtime.sql` says "NOT APPLIED" in its header comment,
  and the 7A migration header is likewise outdated (`groups.md`). Migrations are
  forward-only, so the files stay as deployed; the docs are authoritative.
- The fifth tab is route `account`, labelled **"Profile"** on screen
  (`src/components/navigation/tab-bar.tsx`). CLAUDE.md calls it Account.
- The product roadmap omits Sprint 0, whose report is still INCOMPLETE.

## Open decisions and pending approvals

1. **Sprint 4 classification** of the likes and comments work.
2. **Sprint 7B block immunity**: not implemented; options in `groups-roles.md`.
3. **Sprint 7B inferred rules** (no bans in advance, admins lift only their own member
   bans, per-actor removal limit, admins see moderation events only): awaiting approval.
4. **Scopes for 6C, 7C, 7D, 9 and 10**: none written or approved.
5. ~~**Sprint 8A photos**~~: `20261023100000` applied 2026-10-23.
6. ~~**Hosted verification**~~: done on 2026-10-17; see "Hosted verification".

## Security risks on record

- Block immunity in groups (Sprint 7B): staff cannot act on a member who blocked them,
  so in a group with no other staff (an owner without admins) that member cannot be
  removed. See `groups-roles.md`, "Outstanding approvals".
- No reporting of posts or members exists yet (planned for 7D, scope not approved).
- Every security-sensitive flow (blocking, chat, group moderation) is DEFERRED on device.

## Recording rules

- New sprint: add a row as PLANNED with a one-paragraph scope, then get approval.
- Deployment: record the migration version, date and the user's approval; mark
  VERIFIED only with read-only CLI output.
- Android: copy counts from the checklist; never upgrade DEFERRED without a device report.
