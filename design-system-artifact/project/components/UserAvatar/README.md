# UserAvatar

A student's photo in a circle, or their initials when there is none.

## The consumer provides
- `name` (for initials and the label), `uri` (optional photo), `size`: `xs` 24, `sm` 28, `md` 40, `lg` 48, `xl` 96. Nothing else.

## Rules
- Always a circle: circles mean students. The fallback is `muted` or `accent`, chosen from the name so it is stable across screens; initials are 600 in `foreground` or `accent-foreground`.
- Sizes: xs search meta and navigation, sm beside received bubbles, md posts, comments and chat header, lg rows and tiles, xl profile.

Hand-written from src/components/social/user-avatar.tsx.
