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
