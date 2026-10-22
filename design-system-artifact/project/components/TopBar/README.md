# TopBar

The screen header: 56 high, a title (or the wordmark on Home) and at most one action on the right.

## The consumer provides
- `title`, `onBack` (adds the Back IconButton), `actions` (one IconButton or compact Button), `brand` (false hides the wordmark when there is no title).

## Rules
- Title `title-1` with 20px inset; after Back the inset is 4 and the title drops to `headline`. 8px after the action.

Hand-written from src/components/navigation/top-bar.tsx.
