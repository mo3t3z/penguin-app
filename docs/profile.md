# Sprint 2C — student profile and editing

The existing `/account` destination now shows the student's profile. `/edit-profile`
lives in the same protected route group, preserving onboarding and recovery priority.
AuthProvider, ProfileProvider, logout, schema, migrations and RLS are unchanged.
No dependencies were added.

## Presentation and data

`ProfileIdentity` and `ProfileStudies` accept profile/reference data without edit or
auth controls, so they can later be reused in a public profile screen. No public route,
fake social statistics, email, user IDs or auth metadata are presented. Current-user
controls live in the account route. Settings is deferred rather than adding an inert link.

Existing avatar primitives display the stored image URL, with the shared default
avatar (`assets/default-avatar.webp`) for missing/failed images. No fake URL, upload control or storage infrastructure is added.
Empty bio invites the owner to add one. Missing reference records get readable labels;
reference lookup failures show retry without hiding the profile identity.

`getProfileReferences` resolves current institution/field IDs with two parallel reads.
`useProfileReferences` loads on account/ID changes or explicit retry, discarding stale
responses. It does not refetch on every render. The edit form is unavailable until
initial reference loading succeeds, and only mounts with current profile data. Missing
records require a new valid selection before saving. Search is the existing bounded,
debounced selector, opened only when the user chooses to change a selection.

The Sprint 2B study-level label map now lives in `profile/study-levels.ts`, shared by
onboarding, presentation and editing. Values are unchanged. UsernameField accepts an
optional current username; unchanged canonical names skip both debounce and final
availability checks. Changed names use the existing normalization/debounce/stale-response
protection, then a final availability check. Unique constraint errors remain authoritative.

## Saving and failure behavior

Local form state contains only display name, username, bio and study selections.
Display name is required (1–80 characters after trimming); bio follows the database's
500-character maximum. Optional empty bio saves as null. Reference IDs and study-level
values must be selected from existing data/the shared mapping. User-editable fields are
explicitly passed to one `updateCurrentProfile` call, without onboarding state, avatar,
identity or timestamps. RLS remains the authorization boundary.

Successful save is followed by `ProfileProvider.refresh()` before returning to Profile.
If reload fails after a successful write, a distinct message explains that the write
succeeded and keeps the form mounted. Retry Save is safe. Other recoverable failures
retain edits and show friendly messages, never raw server errors. Duplicate submissions,
inputs and actions are disabled during saving; Android Back is blocked while in flight.
Cancel/back outside saving makes no database mutation. Session loss removes protected
routes through the existing guards. Logout uses the existing service and provider cleanup.

## Manual device QA — not executed by the agent

1. Open Profile with a completed user. Confirm existing name, username, institution,
   field and study level; no email/UUID/statistics. Confirm the default avatar and the empty-bio
   invitation when appropriate.
2. Open Edit Profile. Confirm current values are prefilled, including full institution
   and field names. Change display name and bio, leave username unchanged, and Save.
   Expect the updated Profile immediately, without an unavailable-name warning.
3. Edit again and enter another user's username. Wait for the availability result,
   then try Save. Expect rejection and preserved edits. A name claimed after a check
   must also be rejected by the database with a friendly message.
4. Choose another institution, field and study level, then Save. Confirm the new labels.
   Close/reopen Penguin and confirm changes persist and onboarding does not return.
5. Edit, change text, then Cancel/Back: confirm no database changes. Disconnect before
   Save: confirm a recoverable message and retained draft; reconnect and retry.
6. Log out and confirm the auth screen and cleared profile state.

Automated scope is TypeScript and lint only. No device/browser QA, database operations,
builds or authentication regression suite were run. Avatar uploads, public profiles,
settings and all social features remain deferred.
