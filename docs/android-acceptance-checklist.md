# Android acceptance checklist

Device testing is deferred to the final testing sprint. This file tracks every
scenario that still has to be run on a real Android device. A scenario is marked
PASS only when the user has confirmed it on a device; everything else is DEFERRED,
which means untested, not accepted.

## Sprint 5A: Discover (student search)

Confirmed on device (2026-10-09):

- [x] PASS: Live Supabase student search returns correct results.
- [x] PASS: Opening a student profile from a result works.
- [x] PASS: Returning to Discover preserves the search results.
- [x] PASS: The no-results state appears for a query with no matches.
- [x] PASS: Fast typing shows results for the latest query only.

Deferred:

- [ ] DEFERRED: Search by username, with and without `@`.
- [ ] DEFERRED: Two-word name in reverse order still matches.
- [ ] DEFERRED: Accented and Arabic names match.
- [ ] DEFERRED: An account that has not finished onboarding never appears.
- [ ] DEFERRED: One character shows the "at least 2" hint and sends no request.
- [ ] DEFERRED: Result row shows the right avatar, name, username, institution and field.
- [ ] DEFERRED: Tapping your own result opens the Profile tab.
- [ ] DEFERRED: More than 20 matches load further pages with no duplicates.
- [ ] DEFERRED: "Clear search" on the no-results state empties the field.
- [ ] DEFERRED: Scroll position (not only results) is kept after returning from a profile.
- [ ] DEFERRED: Home scroll position and images are unchanged after visiting Discover.
- [ ] DEFERRED: Switching Discover → Profile → Discover keeps the search.
- [ ] DEFERRED: Airplane mode shows "Search couldn’t load"; "Try again" recovers.
- [ ] DEFERRED: Offline at the end of a page shows "Retry loading more", which recovers.
- [ ] DEFERRED: Log out and log in as another account; Discover is empty.
- [ ] DEFERRED: Keyboard search key and dragging the list dismiss the keyboard.
- [ ] DEFERRED: The clear (X) button empties the field in one tap.
- [ ] DEFERRED: Android back from Discover goes to Home; nothing sits under the gesture bar.
- [ ] DEFERRED: Light and dark mode are both legible.
- [ ] DEFERRED: TalkBack announces the field, clear button, rows and state changes.

## Sprint 5B: Discover (post search)

Nothing in this sprint has been run on a device yet.

- [ ] DEFERRED: Students and Posts tabs appear under the search field; Students is selected first.
- [ ] DEFERRED: Posts scope with no text shows the "Find posts" invitation and loads nothing.
- [ ] DEFERRED: Live post search returns posts containing the word, in any letter case.
- [ ] DEFERRED: Two words match posts containing both, in either order; a post with only one does not appear.
- [ ] DEFERRED: Accented and Arabic words match.
- [ ] DEFERRED: One character shows the "at least 2" hint and sends no request.
- [ ] DEFERRED: Results are newest first and more than 20 matches load further pages with no duplicates.
- [ ] DEFERRED: Image posts in results show their images.
- [ ] DEFERRED: Liking a result updates its count, and the same post on Home shows the change.
- [ ] DEFERRED: Opening comments from a result works; adding a comment updates the count on return.
- [ ] DEFERRED: Tapping an author opens their profile; tapping your own post opens the Profile tab.
- [ ] DEFERRED: Returning from comments or a profile keeps the post results and scroll position.
- [ ] DEFERRED: A query with no matching posts shows "No matches just yet"; "Clear search" empties the field.
- [ ] DEFERRED: Airplane mode shows "Posts couldn’t load"; "Try again" recovers.
- [ ] DEFERRED: Fast typing on Posts shows results for the latest query only.
- [ ] DEFERRED: Students → Posts → Students with the same text restores student results and scroll without reloading.
- [ ] DEFERRED: Posts → Students → Posts with the same text restores post results and scroll without reloading.
- [ ] DEFERRED: Changing the text on one scope, then switching, loads the other scope for the new text.
- [ ] DEFERRED: Publishing a post while a post search is open does not refresh or scroll the search; Home and My profile still show the new post at the top.
- [ ] DEFERRED: Home scroll position and images are unchanged after scrolling post results.
- [ ] DEFERRED: Log out and log in as another account; both scopes are empty.
- [ ] DEFERRED: Dragging post results dismisses the keyboard; nothing sits under the gesture bar.
- [ ] DEFERRED: Light and dark mode are both legible; TalkBack announces the tabs and their selected state.

## Sprint 6A: private chat foundation

Nothing in this sprint has been run on a device, and the chat migration must be applied
to the development project before any of it can be.

- [ ] DEFERRED: The mail button on Home opens Messages above the tabs; back returns to Home with its scroll position.
- [ ] DEFERRED: With no conversations, Messages shows "No messages yet" and "Find students" opens Discover.
- [ ] DEFERRED: Another student's profile shows Message; your own profile does not.
- [ ] DEFERRED: Tapping Message opens the conversation; tapping it twice quickly opens it once.
- [ ] DEFERRED: Tapping Message again later opens the same conversation with its history.
- [ ] DEFERRED: A new conversation shows "No messages yet" and the composer.
- [ ] DEFERRED: A sent message appears at once as "Sending…" and then shows its time.
- [ ] DEFERRED: After reopening the conversation on the other account, the message is there on the left.
- [ ] DEFERRED: Incoming and outgoing bubbles, times and "Today"/"Yesterday" separators look right in light and dark mode.
- [ ] DEFERRED: With more than 30 messages, scrolling up loads earlier messages with no duplicates or jumps.
- [ ] DEFERRED: In airplane mode a message shows "Not sent" with Retry; Retry after reconnecting sends it once.
- [ ] DEFERRED: A blank message cannot be sent; text stops at 2,000 characters.
- [ ] DEFERRED: Sending more than 30 messages in a minute shows the "sending quickly" notice and the extra message can be retried later.
- [ ] DEFERRED: The Messages list shows the other student, the last message ("You: …" for your own) and its time, newest conversation first.
- [ ] DEFERRED: Returning from a conversation to Messages shows the updated preview; pull to refresh works.
- [ ] DEFERRED: Blocking from the conversation asks for confirmation, then replaces the composer with the Unblock notice.
- [ ] DEFERRED: While blocked, the other account's send fails with the neutral notice and history stays readable on both sides.
- [ ] DEFERRED: Unblock restores the composer and sends nothing; both accounts can send again.
- [ ] DEFERRED: A blocked student tapping Message on the blocker's profile (with no existing conversation) sees "You can't message this student right now."
- [ ] DEFERRED: After the other account is deleted, the conversation shows "Deleted Student", keeps its messages and has no composer.
- [ ] DEFERRED: A third account sees none of these conversations.
- [ ] DEFERRED: Log out and log in as another account; Messages shows only that account's conversations.
- [ ] DEFERRED: The keyboard does not cover the composer; the list stays at the newest message while typing.
- [ ] DEFERRED: Android back from a conversation returns to where it was opened (Messages or the profile).
- [ ] DEFERRED: TalkBack announces bubbles with author and status, the send button, Retry and the block control.

## Sprint 1: email confirmation, password recovery and deep links

Confirmed by the user on the installed Android development APK on 2026-10-09. Only the
scenarios the user reported are marked PASS; the rest are still untested.

Email delivery:

- [x] PASS: Sign up with a new address; a confirmation email arrives.
- [x] PASS: "Send reset link" for an existing account sends a recovery email.
- [ ] DEFERRED: "Resend verification email" sends a second email.
- [ ] DEFERRED: Supabase Authentication → Logs show no mail error for sign-up, resend and reset requests.

Android deep links:

- [x] PASS: Tapping the confirmation link opens Penguin and the account is confirmed.
- [x] PASS: Tapping the recovery link opens Penguin on "Choose a new password."; the password is updated and the new password works at log in.
- [ ] DEFERRED: After "Email confirmed.", Continue leads to onboarding.
- [ ] DEFERRED: Both links work with the app closed (cold start) and with it in the background.
- [ ] DEFERRED: Tapping a link a second time shows "This link has expired or was already used."
- [ ] DEFERRED: After Resend, the older email's link shows the "most recent email" guidance and Log in works.
- [ ] DEFERRED: A recovery link for account B opened while signed in as A ends signed in as B on the reset screen, with none of A's data visible.
- [ ] DEFERRED: Cancelling on the reset screen signs out and returns to "Forgot your password?".
- [ ] DEFERRED: With SMTP deliberately broken, sign-up shows "couldn't send the email right now" and recovery shows the development note.

## Android APK (development build)

The development APK was built with EAS and installed by the user on 2026-10-09.

- [x] PASS: `eas build --platform android --profile development` finishes and produces an APK.
- [x] PASS: The APK installs, opens and runs the app from the local development server.
- [x] PASS: A confirmation link tapped in Gmail opens the installed Penguin app (not Expo Go, not a browser page).
- [x] PASS: A recovery link tapped in Gmail opens the installed Penguin app on the reset screen.
- [ ] DEFERRED: Existing features (Home, Discover, Create post with images, Profile, Messages) work in the installed build.
- [ ] DEFERRED: A standalone `preview` APK builds and runs with the Supabase values supplied as EAS environment variables.

Not a device test, recorded for reference: on 2026-10-09 the Supabase dashboard showed
`penguin://auth/callback` in the Redirect URLs.

## Auth: PKCE S256 and lock removal

JavaScript-only change made after the Sprint 1 results above. Confirmed again with the
change by the user on the installed Android development APK on 2026-10-09. Only the
scenarios the user reported are marked PASS.

- [x] PASS: Metro no longer shows "WebCrypto API is not supported" or "The lock option is deprecated".
- [x] PASS: Sign up with a new address; the confirmation email arrives and its link opens Penguin.
- [x] PASS: Request a password reset; the email arrives and its link opens the reset screen.
- [x] PASS: The password is updated and log in works with the new password.
- [x] PASS: The session persists after closing and reopening the app.
- [ ] DEFERRED: In the Supabase SQL editor, the newest `auth.flow_state` rows show `code_challenge_method = s256`. Until this is run, S256 on the device is supported only by indirect evidence (the plain-method warning is gone and the flows complete).
- [ ] DEFERRED: Logging out, then logging in as a different account, still works.
- [ ] DEFERRED: An automatic session refresh after the access token expires (about an hour of use) still works without the lock option.

## Home feed: Volcanic theme, tabs, stories and sample post types

JavaScript-only change made on 2026-10-09. Checked with `tsc`, `expo lint`, `npm test`
and a web bundle only. Nothing below has been run on a device or in a browser.

- [ ] DEFERRED: Light and Dark mode both render the orange/black palette on Home, auth, Discover, Profile and Messages with readable text.
- [ ] DEFERRED: For You still loads real posts, paginates, refreshes, likes and opens comments; Share opens the system sheet.
- [ ] DEFERRED: Following and My School show the sample-content notice and every sample card carries a "Sample" badge.
- [ ] DEFERRED: Stories scroll horizontally without fighting the vertical feed scroll.
- [ ] DEFERRED: The raised Create button in the tab bar is fully tappable and clears the gesture/navigation bar inset.
- [ ] DEFERRED: The Groups tab opens its "coming soon" screen and returning to Home keeps the feed.
- [ ] DEFERRED: TalkBack reads the tabs, post actions, poll options and sample notices sensibly.

## Brand: new app icon, adaptive icon and mascot logo

Made on 2026-10-09. The image files were inspected; nothing was run on a device. The icon
changes in `app.json` only take effect in a new native build.

- [ ] DEFERRED: After a new Android build, the launcher shows the new mascot icon and no mask shape (circle, squircle, teardrop) clips the beak or head.
- [ ] DEFERRED: With Android themed icons on, the monochrome icon is recognisable.
- [ ] DEFERRED: The text-only "Penguin" wordmark (black on light, white on dark, one orange dot over the "i") is sharp and correctly sized in the Home header, Welcome, login and onboarding.
- [ ] DEFERRED: The wordmark switches colour when the system theme changes while the app is open.
- [ ] DEFERRED: TalkBack announces the wordmark as "Penguin".

## Messages: tab, inbox, conversation and New message redesign

JavaScript-only change made on 2026-10-09. Checked with `tsc`, `expo lint`, `npm test` and
an Android JavaScript export only. Nothing below has been run on a device.

- [ ] DEFERRED: The bottom bar shows Home, Discover, Create, Messages and Profile, with Create centred and no clipped labels on a narrow (320-360dp) phone, and each opens its screen.
- [ ] DEFERRED: The Messages tab lists real conversations; pull to refresh, pagination, empty and error states work.
- [ ] DEFERRED: An unread conversation shows the orange dot, the dot clears after opening it and returning, and the Unread filter shows only unread conversations.
- [ ] DEFERRED: Search and compose both open New message; search opens it with the keyboard up.
- [ ] DEFERRED: New message finds a student by name or username, and tapping one opens the conversation; Back from that conversation returns to the inbox.
- [ ] DEFERRED: In a conversation, the composer stays above the keyboard, long messages grow the field without hiding the send button, and bubbles are readable in Light and Dark mode.
- [ ] DEFERRED: The header menu offers View profile and Block; blocking, unblocking, Retry on a failed send and a deleted student's conversation behave as before.

## Sprint 6B: live chat (two accounts, two devices or sessions)

Statuses: Automated PASS = covered by `npm test`; Device PASS = confirmed by the user on a
device; DEFERRED = not yet run; BLOCKED = cannot run until something else happens.
Recorded on 2026-10-10. No device test has been run for this sprint. Hosted checks done without a device (catalog, anonymous probes, function logic) are recorded in `docs/chat-realtime.md`.

Automated PASS (unit tests, `tests/chat-realtime.test.mjs`): incoming message handling,
de-duplication of your own message, out-of-order and duplicate events, receipt rules, unread
changes, typing throttle and expiry, reload after reconnect, channel cleanup, account scoping,
rejection of rows for other conversations.

Database suite:

- [x] Automated PASS (2026-10-10, disposable database): `bash tests/chat-db-verify.sh`, including `tests/chat-realtime-integration.sql` (72 + 44 assertions, 18 concurrency checks).

Regression (unchanged behaviour):

- [ ] DEFERRED: Sprint 6A behaviour is unchanged: send, Retry, pagination, block, unblock, deleted student.
- [ ] DEFERRED: Your newest stored message shows "Sent" until the other student opens the conversation; nothing ever shows "Delivered".
- [ ] DEFERRED: Opening a conversation produces no repeating errors in Metro.
- [ ] DEFERRED: Leaving the app for a minute and returning reloads the open conversation and the inbox.

The migration was applied to the hosted project on 2026-10-10, so these can now be run (A and B are the two accounts, each signed in on its own device or session):

- [ ] DEFERRED: A and B both have the conversation open. A sends; the message appears on B within a few seconds without touching the screen.
- [ ] DEFERRED: A's own message appears once, not twice.
- [ ] DEFERRED: B is on the Messages tab. A sends; B's row moves to the top with the new preview and an orange dot.
- [ ] DEFERRED: B opens that conversation and goes back; the dot is gone. On A, the newest message changes from "Sent" to "Read".
- [ ] DEFERRED: B has the conversation open but the app in the background. A sends; A still sees "Sent". B returns to the app; A then sees "Read".
- [ ] DEFERRED: B types; A sees "B is typing…". B stops; the line disappears within about 6 seconds. B sends; it disappears at once.
- [ ] DEFERRED: B turns on airplane mode, A sends three messages, B turns it off; all three appear on B in order, once each.
- [ ] DEFERRED: B scrolls up to older messages; a new message from A does not move what B is reading.
- [ ] DEFERRED: A blocks B. Neither sees a typing line; B's newest message stays "Sent" even after A opens the conversation; sending is refused as in 6A.
- [ ] DEFERRED: B has a message showing "Read". A blocks B. After B closes and reopens the conversation, that message still shows "Read".
- [ ] DEFERRED: A unblocks B and opens the conversation; B's newest message then changes to "Read".
- [ ] DEFERRED: A logs out and logs in as a third account C. C's inbox shows none of A's conversations and receives nothing when B writes to A.
- [ ] DEFERRED: After more than an hour in the app (token refreshed), live delivery still works.

## Chat composer and keyboard

JavaScript-only change made on 2026-10-10: the conversation screen uses one keyboard strategy
(`KeyboardAvoidingView` with `padding` on both platforms) and the composer grows to about five
lines. Checked with `tsc`, `expo lint` and `npm test` only. Nothing below has been run on a device.

- [ ] DEFERRED: Android: tapping the field raises the composer to sit directly on the keyboard, with no gap and nothing hidden; closing the keyboard returns it to the bottom with no leftover space.
- [ ] DEFERRED: Android: the same with gesture navigation and with three-button navigation.
- [ ] DEFERRED: Android: the hardware/gesture Back closes the keyboard first, and a second Back leaves the conversation.
- [ ] DEFERRED: Switching to the emoji keyboard, or to a keyboard language with a different height, keeps the composer on top of it.
- [ ] DEFERRED: Opening the keyboard at the bottom of a conversation keeps the newest messages visible; opening it while reading older messages does not jump to the bottom.
- [ ] DEFERRED: A long message grows the field to about five lines and then scrolls inside it; the send button stays visible.
- [ ] DEFERRED: A message arriving while the keyboard is open appears above the composer without a jump.
- [ ] DEFERRED: Small screen (about 5 inches): header, at least two messages and the composer are all visible with the keyboard open.
- [ ] DEFERRED: Light and Dark mode.
- [ ] DEFERRED: iOS: all of the above. No iOS build has ever been run for this project in these sessions.


## Chat message bubbles

JavaScript-only change made on 2026-10-10: grouped bubbles, the other student's avatar beside
incoming messages, one time per group. Checked with `tsc`, `expo lint` and `npm test` only.
Nothing below has been run on a device.

- [ ] DEFERRED: Your messages are orange, right-aligned, fully rounded, with no avatar; the time (and Sent/Read on the newest) is inside the bubble.
- [ ] DEFERRED: The other student's messages are grey (Light) or charcoal (Dark), left-aligned, with their photo, or the default avatar when they have none, at 32px.
- [ ] DEFERRED: Several messages in a row from one sender sit close together, show one avatar beside the last of them and one time; all their bubbles share the same left edge.
- [ ] DEFERRED: Spacing is visibly larger where the sender changes.
- [ ] DEFERRED: A long message wraps; a very long unbroken string (a URL) wraps inside the bubble without horizontal scrolling, on a small screen too.
- [ ] DEFERRED: An Arabic message is right-aligned inside its bubble; French and English are left-aligned; a mixed message follows its first letter.
- [ ] DEFERRED: A message from a deleted student shows the "Deleted Student" name with the default avatar, not a photo.
- [ ] DEFERRED: The keyboard and composer behave as before with the new bubbles.


## Design system: Warm Minimal Social

JavaScript-only change made on 2026-10-10: the app now follows the Penguin design system
(tokens, primitives, navigation island, Home, Discover, Create, Messages, Chat, Profile). Checked
with `tsc`, `expo lint`, `npm test` and the development gallery in a web browser (Light and Dark)
only. Nothing below has been run on a device. Earlier items in this file that describe the old
look (for example the time inside the bubble, a 32px avatar, a round send button) are superseded
by the items here.

Navigation
- [ ] DEFERRED: 360dp and 412dp phones with gesture navigation show the floating island: fully rounded, 12dp from the sides and from the bottom inset, five items, labels not cut.
- [ ] DEFERRED: A 320dp phone shows the docked bar; every slot is at least 48dp wide and "Messages" is not cut.
- [ ] DEFERRED: Three-button navigation shows the docked bar, with its labels clear of the system buttons.
- [ ] DEFERRED: Font size 130% and 200% dock the bar; it grows in height and no label is clipped.
- [ ] DEFERRED: The bar disappears while the keyboard is open (Discover) and returns when it closes; it never covers a focused field.
- [ ] DEFERRED: The last item of Home, Messages, Discover and your own profile is fully visible above the bar.
- [ ] DEFERRED: The selected item shows the capsule, a filled glyph (Home, Messages) or a heavier stroke (Discover), or a ring round your avatar (Profile); Create never looks selected.
- [ ] DEFERRED: Labels stay readable while a bright photo, a dark photo and orange content scroll under the bar, in Light and Dark.
- [ ] DEFERRED: TalkBack reads "Home, tab, selected" and "Create a post, button", in visual order.
- [ ] DEFERRED: With "Remove animations" on, the capsule changes without a fade and the Create tile does not scale.

Home
- [ ] DEFERRED: The header shows only the wordmark; posts run edge to edge with a divider between them; pull to refresh and "You're all caught up." still work.
- [ ] DEFERRED: An Arabic post is right-aligned and slightly larger; liking fills the heart.

Discover
- [ ] DEFERRED: Typing fast sends no request; after a pause a row of up to six students appears; posts appear under it about half a second later, or at once after the keyboard's Search key.
- [ ] DEFERRED: "See all" opens the full student list, which loads more on scroll; Back returns to the overview; changing the text returns to the overview.
- [ ] DEFERRED: A post result highlights the searched words and opens the post's comments.
- [ ] DEFERRED: One character shows "Type at least 2 letters or numbers."; no matches at all shows "No matches just yet" with "Clear search".

Create
- [ ] DEFERRED: Create slides up as a sheet with rounded top corners below the status bar; the screen underneath is dimmed.
- [ ] DEFERRED: With the keyboard open the toolbar ("Add photos", "2/4") stays visible directly above it, on a small phone too. If it does not, switch to the full-screen fallback noted in `src/app/(protected)/_layout.tsx`.
- [ ] DEFERRED: Long text scrolls the sheet, not the field; the counter appears from 4,500 characters and turns amber at 5,000.
- [ ] DEFERRED: Back is blocked while publishing; the back gesture otherwise closes the sheet; TalkBack focus does not reach the screen underneath.
- [ ] DEFERRED: Photos show as thumbnails, each with a working remove button; publishing with photos still reports each stage.

Messages and Chat
- [ ] DEFERRED: The inbox shows "Unread" and "Earlier" sections when something is unread and a plain list otherwise; rows are 72dp with a 48dp avatar.
- [ ] DEFERRED: Bubbles have 20dp corners; the last bubble of each group has the tight "beak" corner on the sender's side; the time and Sent/Read sit under the bubble.
- [ ] DEFERRED: While the other student types, a bubble with three dots appears at the bottom of the thread and TalkBack announces it once.
- [ ] DEFERRED: The send button is orange with text and grey when empty; the keyboard checks above still pass.

Profile
- [ ] DEFERRED: Your profile is centred with one "Edit profile" button; "More options" opens a menu under the button with "Log out", which signs out.
- [ ] DEFERRED: Another student's profile shows Back and one "Message" button.

Everywhere
- [ ] DEFERRED: Light and Dark on every screen above; no pure white or pure black page background.
- [ ] DEFERRED: Sheets (institution, field, study level) use the raised surface and the dimmed backdrop, and still confirm or discard the choice as before.
- [ ] DEFERRED: iOS: all of the above.

## UI/UX refinement pass (2026-10-11)

JavaScript-only changes; see `docs/UI_UX_QUALITY_AUDIT.md`. Checked with `tsc`, `expo lint`,
`npm test` and an Android export only. Nothing below has been run on a device.

- [ ] DEFERRED: Create: with text typed, Cancel shows "Discard this post?"; "Keep editing" keeps the text; "Discard" closes the sheet.
- [ ] DEFERRED: Create: the system Back does the same; with nothing typed, Cancel and Back close at once; neither does anything while a post is publishing.
- [ ] DEFERRED: Create: the toolbar sits directly on the keyboard when it opens and returns to the bottom when it closes, with no gap and nothing hidden.
- [ ] DEFERRED: Feed: a long post shows 8 lines and "Show more"; opening and closing it does not jump the list.
- [ ] DEFERRED: Feed: liking a post gives the heart a brief pop; with "Remove animations" on in system settings there is none.
- [ ] DEFERRED: Home: after scrolling down, pressing Home again returns the feed to the top.

## Sprint 7A: Groups foundation

Recorded on 2026-10-11. See `docs/groups.md`. Checked with `tsc`, `expo lint`, `npm test`,
an Android JavaScript export and the database suite on a disposable local database.
**Core Android acceptance: passed.** The user tested on Android after the hosted
deployment and reported the 12 core checks below as passed. Only what the user reported
is marked PASS; every other case is still DEFERRED, which means untested, not accepted.

- [x] Automated PASS (2026-10-11, disposable database): `bash tests/groups-db-verify.sh` (137 assertions, 24 concurrency checks, rollback rehearsal; includes the count-policy migration). `bash tests/chat-db-verify.sh` also passes with the groups migration applied.

`20261012090000_groups_foundation.sql` was applied to the hosted project on 2026-10-11
(`docs/groups.md`, "Hosted deployment"), so everything below can now be run. Use the
installed development APK with `npx expo start`; no new build is needed.

Core acceptance, confirmed by the user on Android (reported 2026-10-11), in the user's words:

- [x] PASS: Discover Groups entry point.
- [x] PASS: Groups list loads without errors.
- [x] PASS: Group creation.
- [x] PASS: Correct owner and initial member count.
- [x] PASS: My Groups listing.
- [x] PASS: Discovery and joining from a second account.
- [x] PASS: Member count increases to 2.
- [x] PASS: Leaving returns the count to 1.
- [x] PASS: Group search.
- [x] PASS: Light and Dark Mode.
- [x] PASS: Navigation and keyboard behavior.
- [x] PASS: Bidirectional blocking visibility.

Detailed cases, not individually confirmed. Several of them include a main path that a
core check above covers; they stay DEFERRED because each also names conditions the
report did not mention (a double tap, an exact message, an edge of the screen, a third
account). They are not failures.

Entry point and navigation
- [ ] DEFERRED: The bottom bar still shows exactly Home, Discover, Create, Messages and Profile.
- [ ] DEFERRED: Discover with an empty search field shows the Groups row at the top; tapping it opens Groups above the tabs; a quick double tap opens it once.
- [ ] DEFERRED: Android back from Groups returns to Discover; from a group to Groups; from Members to the group.
- [ ] DEFERRED: Opening a member, then Back, returns to the member list at the same scroll position.

Groups list
- [ ] DEFERRED: With no groups anywhere, "My groups" says none are joined and "Discover groups" shows "No groups yet" with "Create a group".
- [ ] DEFERRED: "Discover groups" lists active groups newest first, each with its name, one line of description and a member count that matches the member list.
- [ ] DEFERRED: With more than 20 groups, scrolling loads further pages with no duplicates and ends with "That's every group."
- [ ] DEFERRED: With more than 20 joined groups, "Show more" under "My groups" loads the rest.
- [ ] DEFERRED: Searching a word shows "Results" with only matching groups, in any letter case; two words must both match; one character shows the "at least 2" hint.
- [ ] DEFERRED: A search with no match shows "No groups match"; "Clear search" empties the field.
- [ ] DEFERRED: Airplane mode shows "Groups couldn't load"; "Try again" recovers. Offline at the end of a page shows "Retry loading more", which recovers.
- [ ] DEFERRED: Groups you are in show "Joined" or "Owner" in both sections.
- [ ] DEFERRED: The search field is not covered by the keyboard and dragging the list dismisses it.

Create a group
- [ ] DEFERRED: The + button opens "New group" with the keyboard up on the name field.
- [ ] DEFERRED: Create with an empty or two-character name shows the message under the field and sends nothing.
- [ ] DEFERRED: A valid name creates the group and opens it with "1 member", "Owner" and your identity under "Owner"; Back goes to Groups, where it is first in "My groups".
- [ ] DEFERRED: A name that exists in another letter case or spacing shows "A group with this name already exists."; editing the name clears it.
- [ ] DEFERRED: Tapping Create twice quickly creates one group.
- [ ] DEFERRED: In airplane mode Create shows the connection message and keeps the text; after reconnecting, Create succeeds once.
- [ ] DEFERRED: A fourth group within 24 hours shows the "3 groups a day" message.
- [ ] DEFERRED: With text typed, Cancel and Android back ask "Discard this group?"; "Keep editing" keeps it; "Discard" leaves. With nothing typed both leave at once.
- [ ] DEFERRED: The description counter follows typing and stops at 500; a long description scrolls the page and the keyboard never hides the field being typed in.

Group details, join and leave
- [ ] DEFERRED: Another student's group shows "Join group"; joining changes it to "Leave group", shows "Joined" and raises the count by one.
- [ ] DEFERRED: Tapping Join twice quickly joins once.
- [ ] DEFERRED: "Leave group" asks "Leave this group?"; "Stay" does nothing; "Leave" lowers the count by one and shows "Join group" again.
- [ ] DEFERRED: Your own group shows "You own this group. Owners can't leave their group yet." and no Leave button.
- [ ] DEFERRED: Tapping the owner opens their profile (your own opens the Profile tab).
- [ ] DEFERRED: A second account joining the same group sees the same count as the first after reopening the screen.
- [ ] DEFERRED: Airplane mode while joining shows the connection message and the button returns to "Join group".
- [ ] DEFERRED: There is no post, chat, edit, delete or invite control anywhere in Groups.

Members
- [ ] DEFERRED: "Members" lists the owner first with an "Owner" badge, then members in the order they joined; your own row says "(you)".
- [ ] DEFERRED: With more than 30 members, scrolling loads the rest with no duplicates.
- [ ] DEFERRED: After A blocks B (from a conversation), A does not see B in a shared group's members and B does not see A; a third member sees both. Messaging between A and B behaves as before.
- [ ] SUPERSEDED: For A and for B, the member count equals the number of rows in the member list they see. This described the first deployed behaviour; the count policy below replaces it.

Member count policy (`20261013090000_groups_member_count_policy.sql`), applied to the
hosted project on 2026-10-11, so these can now be run. Nothing below has been run on a
device. See `docs/groups.md`, "Member count policy refinement".
- [ ] DEFERRED: With no block, the count on the group, in "My groups" and in "Discover groups" equals the number of rows in the member list, and there is no "Penguin User" entry.
- [ ] DEFERRED: After A blocks B in a shared group of three, A, B and the third member all see the same count (3).
- [ ] DEFERRED: A's member list shows the two visible members and then one entry "Penguin User" with "Profile not available"; B's list shows the same; the third member sees three members and no such entry.
- [ ] DEFERRED: The "Penguin User" entry cannot be tapped, shows no username, and never mentions blocking.
- [ ] DEFERRED: With two unavailable members the entry reads "2 Penguin Users".
- [ ] DEFERRED: In a group with more than 30 members and an unavailable member, the entry appears only after scrolling to the end, once.
- [ ] DEFERRED: When the unavailable member is the owner, there is no Owner section and nothing marks the entry as the owner.
- [ ] DEFERRED: After unblocking and reopening the list, the entry is gone and the member is listed again; the count has not changed at any point.
- [ ] DEFERRED: TalkBack reads the entry as "Penguin User. Profile not available" and does not announce it as a button.
- [ ] DEFERRED: If the blocked student is the owner, the "Owner" section is absent for the other.

Ownership lifecycle (needs a test account that can be deleted)
- [ ] DEFERRED: After the owner's account is deleted, the group shows "Archived", the explanation, no Join button for non-members and a working Leave for members.
- [ ] DEFERRED: The archived group is gone from "Discover groups" and search, and still listed under "My groups" for its members.

Everywhere
- [ ] DEFERRED: Light and Dark on all four screens: readable text, initials tiles and badges visible, no pure white or black page.
- [ ] DEFERRED: Small phone (320-360dp) and font size 130% and 200%: long group names truncate, no control is clipped, every target is comfortably tappable.
- [ ] DEFERRED: Gesture navigation and three-button navigation: nothing sits under the system bar.
- [ ] DEFERRED: TalkBack reads each group row with its count and membership, announces loading, errors and results, and reaches Join/Leave and the dialog buttons in order.
- [ ] DEFERRED: Log out and log in as another account: "My groups" and any search belong to the new account only.
- [ ] DEFERRED: iOS: all of the above.

## Sprint 7B: Group membership and roles

Recorded on 2026-10-12. See `docs/groups-roles.md`. Checked with `tsc`, `expo lint`,
`npm test`, an Android JavaScript export and the database suites on a disposable local
database only. Nothing below has been run on a device.

- [x] Automated PASS (2026-10-12, disposable database): `bash tests/groups-db-verify.sh` (137 + 105 assertions, 63 concurrency checks, two rollback rehearsals) and `bash tests/chat-db-verify.sh` with all three group migrations applied.

`20261014090000_groups_roles_and_moderation.sql` was applied to the hosted project on
2026-10-17 (`docs/groups-roles.md`, "Hosted deployment"), so everything below can now be
run. Accounts needed: an owner (O), two more students (A, B), and ideally a fourth (C).
Use the installed development APK with `npx expo start`; no new build is needed.

- [ ] SUPERSEDED: Before the migration is applied, Groups behaves exactly as in Sprint 7A. The migration is now applied, so this can no longer be run.

Roles and badges
- [ ] DEFERRED: O opens Members, taps the More button beside A, and sees "Make admin", "Remove from group" and "Ban from group". There is no More button beside O's own row.
- [ ] DEFERRED: "Make admin" asks "Make A an admin?"; Cancel does nothing; confirming shows "A is now an admin." and an "Admin" badge on A's row.
- [ ] DEFERRED: On A's phone the group shows an "Admin" badge and a "Leave group" button, never "Join group".
- [ ] DEFERRED: A's More menu on a member shows only "Remove from group" and "Ban from group"; there is no More button beside O or beside another admin.
- [ ] DEFERRED: A plain member sees badges and no More buttons at all.
- [ ] DEFERRED: O chooses "Remove admin role" for A; after confirming, the badge is gone and A's phone shows "Joined" after reopening the group.
- [ ] DEFERRED: With ten admins, promoting an eleventh shows "A group can have up to 10 admins."

Remove and ban
- [ ] DEFERRED: "Remove from group" says the student can join again; after confirming, they disappear, the count drops by one, and on their phone the group shows "Join group", which works.
- [ ] DEFERRED: "Ban from group" says they can't join again; after confirming, they disappear and on their phone "Join group" answers "You can't join this group."
- [ ] DEFERRED: The two actions are visibly different in the menu (words and icons) and in their confirmations.
- [ ] DEFERRED: Tapping a confirmation twice quickly performs the action once.
- [ ] DEFERRED: Airplane mode while confirming shows the connection message and changes nothing.

Banned students
- [ ] DEFERRED: The group screen shows "Banned students" for O and A and not for a member.
- [ ] DEFERRED: The list shows the banned student with "Lift ban" for O. For A it shows "Lift ban" only on bans A placed on members.
- [ ] DEFERRED: "Lift ban" says the student is not added back; after confirming they leave the list, are still not a member, and can join again themselves.
- [ ] DEFERRED: With nobody banned the screen says "Nobody is banned".

Ownership transfer
- [ ] DEFERRED: O's More menu on admin A includes "Make owner"; on a plain member it does not.
- [ ] DEFERRED: The confirmation says O will become an admin and lose owner powers; Cancel does nothing.
- [ ] DEFERRED: After confirming, A has the "Owner" badge, O has "Admin", the Owner section shows A, and O's phone no longer shows "Edit group".
- [ ] DEFERRED: O (now an admin) can leave the group; the group stays active under A.
- [ ] DEFERRED: Before transferring, O's group screen explains that an admin must be made owner first, and shows no Leave button.

Edit group
- [ ] DEFERRED: "Edit group" appears for the owner only and opens the form filled with the current name and description.
- [ ] DEFERRED: Save is disabled until something changes; saving returns to the group, which shows the new name and description.
- [ ] DEFERRED: A name used by another group shows "A group with this name already exists." under the field.
- [ ] DEFERRED: With a change typed, Cancel and Android back ask "Discard your changes?"; with none they leave at once.
- [ ] DEFERRED: The keyboard never hides the field being typed in.

Admin history
- [ ] DEFERRED: "Admin history" lists the actions above as sentences, newest first, with times.
- [ ] DEFERRED: O sees promotions, the transfer and the rename; A sees only removals, bans and lifted bans.
- [ ] DEFERRED: A member opening the route directly is told the history is not available.

Blocking with roles
- [ ] DEFERRED: After B blocks O, O's member list shows "Penguin User" for B with no More button, and the count is unchanged.
- [ ] DEFERRED: A (no block with B) can still remove or ban B.
- [ ] DEFERRED: After a member blocks admin A, that member's list does not show A or an "Admin" badge for A, and the count is unchanged.
- [ ] DEFERRED: Entries about a student who is unavailable to the viewer do not appear in that viewer's ban list or history.

Archived groups
- [ ] DEFERRED: In an archived group there are no More buttons and no "Edit group"; "Banned students" opens with no "Lift ban"; an admin can still leave.

Everywhere
- [ ] DEFERRED: Light and Dark on the action sheet, the dialogs, and the three new screens.
- [ ] DEFERRED: Small phone (320-360dp) and font size 130% and 200%: the action sheet, long names and the "Lift ban" button are not clipped.
- [ ] DEFERRED: Gesture and three-button navigation: the action sheet clears the system bar.
- [ ] DEFERRED: TalkBack: "Manage <name>" is announced as a button; each sheet row reads its action and the name; results are announced.
- [ ] DEFERRED: The bottom bar still shows exactly Home, Discover, Create, Messages and Profile.
- [ ] DEFERRED: iOS: all of the above.

Sprint 7A checks worth running in the same session (still DEFERRED above): owner first
with a badge and "(you)" in the member list; opening a profile and returning; more than
30 members; a third member with a block in place; the hidden-owner case; the leave
dialog; archived groups; account switching.
