# PostCard

A post in a feed: edge to edge on `background` with a `divider` below. No card, no shadow — the post is the interface.

## The consumer provides
- `post` (author, content, media, time), `visible`, `likeState`, `commentCount`, `onToggleLike`, `onOpenComments`, optional `onOpenAuthor`.

## Rules
- Padding 16 × `space-5`, 12 between parts. Identity row: `avatar-md`, name in `label` 600, meta "@username · 2h" in `footnote` muted.
- Text `body` (`body-ar`, right-aligned, for Arabic). Long posts clamp with "Show more" in `primary-text`.
- Actions are 44 high, 20px icons in `muted-foreground`: Like (count or "Like"), Comment (count or "Comment"), Share. A liked heart fills with `primary`, its count in `primary-text`, and pops once. An unavailable count reads "—".

Hand-written from src/features/posts/post-card.tsx.
