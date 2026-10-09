# Sprint 5A: Discover (student search)

Status: client code only. No migration, RPC, Edge Function or dependency was added.

## Behaviour

- Discover is a tab between Home and Create (`src/app/(protected)/(tabs)/discover.tsx`).
- Students are searched by display name or username. Post search is Sprint 5B.
- Typing waits 350 ms before a request. A search needs at least 2 usable characters;
  input is limited to 60 characters and 5 words. Every word must match the display
  name or the username.
- Results are ordered by username, 20 per page, and continue with `username > cursor`.
- Only profiles with `onboarding_completed = true` are listed. Your own profile is
  included and opens the Profile tab; other students open `/students/[id]`.

## Safety

- `search-query.ts` keeps only letters, digits and combining marks. No PostgREST filter
  character or LIKE wildcard can reach a query, and `studentSearchFilters` rejects any
  term that was not produced by that normalisation.
- The query runs as the signed-in user under the existing `profiles` RLS policy and
  selects presentation fields plus the institution and field names.
- Every result carries a token of account, attempt and search. Responses for an older
  search or another account are dropped, and superseded requests are aborted.
- Search text and results are not logged and are not placed in route parameters.

## Known limits

- Matching is an unindexed `ILIKE` scan and results are alphabetical, not ranked.
  Trigram indexes (`pg_trgm`) are the next step once the profile count justifies them.
- Request limiting is client-side only (debounce, minimum length, cancellation).
