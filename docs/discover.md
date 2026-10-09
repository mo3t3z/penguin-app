# Sprint 5: Discover (student and post search)

Status: client code only. No migration, RPC, Edge Function or dependency was added.

## Behaviour

- Discover is a tab between Home and Create (`src/app/(protected)/(tabs)/discover.tsx`).
- Two scopes share one search field: Students (default) and Posts.
- Typing waits 350 ms before a request. A search needs at least 2 usable characters;
  input is limited to 60 characters and 5 distinct words, matched without regard to case.
- Students: every word must appear in the display name or the username. Results are
  ordered by username, 20 per page, continuing with `username > cursor`. Only profiles
  with `onboarding_completed = true` are listed.
- Posts: every word must appear in the post text. Results reuse the feed query, so they
  are newest first, 20 per page, with the feed's `(created_at, id)` cursor.
- Your own profile and posts are included; your own author row opens the Profile tab,
  other students open `/students/[id]`, and the comment action opens `/comments/[postId]`.

## Scopes

- Post results are a `FeedList` with a `search` key, so `PostCard`, images, likes,
  comment counts and the signed-media cache behave exactly as on Home.
- No post list is mounted until a valid search has settled while Posts is showing.
- Once a pane exists it stays mounted. The pane that is not showing is hidden and
  paused: students start no search or page request, and the post list asks for no
  further pages and no image URLs.
- Switching back with the same text shows the held results and scroll position without
  a request. If the text changed, only the scope now showing fetches.
- A search list ignores the post-published refresh; Home and profile lists keep it.
- The screen is keyed by account, so both scopes are cleared when the account changes.

## Safety

- `search-query.ts` keeps only letters, digits and combining marks. No PostgREST filter
  character or LIKE wildcard can reach a query, and the filter builders reject any term
  that was not produced by that normalisation.
- Student search uses one `or` group per word; post search uses one `ilike` column
  filter per word. Neither interpolates raw input.
- Both run as the signed-in user under existing RLS policies.
- Every student result carries a token of account, attempt and search; each post list is
  keyed by its search. Responses for an older search or another account are dropped.
- Search text and results are not logged and are not placed in route parameters.

## Known limits

- Matching is an unindexed `ILIKE` scan; a rare word reads the whole posts table.
  Trigram indexes (`pg_trgm`) are the next step once the row counts justify them.
- Students are alphabetical and posts are newest first; nothing is ranked by relevance.
- Request limiting is client-side only (debounce, minimum length, cancellation).
- A post published while a search is open appears only after searching again.

Device testing status is tracked in `docs/android-acceptance-checklist.md`.
