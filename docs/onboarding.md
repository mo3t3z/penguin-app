# Sprint 2B — onboarding

## Architecture

`ProfileProvider` lives beneath the existing AuthProvider. It loads once per account
or recovery transition and exposes `state` and `refresh()`. Account-scoped snapshots
and request generations discard stale responses without remounting recovery routes. Token refresh renders do not refetch.
Profile loading errors/missing rows expose retry and logout, never grant main access.
No new dependencies, auth changes, schema changes or RLS changes were needed.

The root Stack allows the main `(protected)` group only with a matching completed
profile and no recovery session. `/onboarding` is available to incomplete authenticated
users, with loading/error handling. `index` uses the existing destination helper.
Expo Router protected guards remove onboarding history when completion is confirmed.
Callbacks, check-email, forgot/reset-password stay outside profile gates. Recovery has
priority and pauses profile loading; its existing auth state and session behavior remain.

The onboarding route contains six local steps: welcome, identity, institution, field,
study level, review. Existing semantic colors, typography, buttons, form fields, cards,
icons and skeletons are reused. Android Back moves to the preceding step, except while
saving; normal exit is allowed on Welcome. Inputs and actions remain in a scrollable
safe-area/keyboard-aware layout. Selected options include a check mark and selected
accessibility state. Drafts survive step changes and recoverable network failures;
they intentionally do not persist across logout, process termination or route removal.

Username checks debounce 500ms, ignore stale results, and are rechecked explicitly
before leaving Identity. Availability is advisory; a final unique-constraint conflict
is shown as a friendly error with the draft intact. Searches debounce 350ms, discard
obsolete responses, and use 20-row pages. Only real reference IDs can be selected.
Study-level labels exhaustively map Sprint 2A's canonical TypeScript union.

Final completion sends one update through the existing service, then reloads the
profile. Only that database-backed completed state unlocks main routes. A failed reload
keeps the draft; retrying the final update is safe. Raw server errors are never rendered.

## Reference data

The linked project was identified, but the connector denied the read-only count query.
Current table population is therefore **unknown**, not assumed empty. No data was deployed.
If choices are empty, an administrator can review and run
`supabase/seeds/onboarding-development.sql` against Penguin. It inserts two Tunisian
institutions and six broad fields; it is separate from structural migrations, skips
existing slugs, and does not overwrite rows. The source URLs are recorded in the file.
Reopen/retry the selector after seeding. Production data should be curated separately.

## Manual QA (not run by the agent)

1. Ensure real reference rows exist, optionally using the reviewed seed. Launch with an
   existing authenticated user whose profile has `onboarding_completed = false`.
   Expect a loading state followed by Welcome, never the account screen. Direct access
   to `/account` must also return to onboarding.
2. Continue to Identity. Enter a name and try an invalid username, then a taken one,
   then an available one. Type quickly/change the search value while a request is in
   flight; stale results must not overwrite the latest value. Continue after checking.
3. Search/select an institution and field. Confirm selection text/check mark, Back
   preservation, and reasonable behavior with the keyboard visible on a small screen.
   An unmatched search should show a clear empty state; Retry handles connectivity loss.
4. Choose a study level. Review, edit a detail, and return to review. Disconnect before
   saving: expect a readable failure and preserved draft. Reconnect and complete once.
5. Expect the existing account screen after the confirmed update/reload. Android Back
   must not reopen onboarding. Close/reopen the app: completed users go to account.
6. Collision race: with two different incomplete test accounts, check the same available
   username on both and reach Review. Complete account A, then submit account B. B must
   remain in onboarding with the friendly taken-name error and retain its other choices.
   Change B's username and complete successfully.
7. Sanity-check recovery on an incomplete account: a valid recovery link must still open
   Reset Password, with no onboarding redirect before recovery finishes. Log out during
   onboarding and sign in as another user: no prior user's draft/profile should appear.

TypeScript and lint are the automated checks for this sprint. Device UX and live final
submission still require this manual QA. Route guards are navigation controls; database
authorization continues to rely on RLS. No Sprint 2C profile UI or social features added.
