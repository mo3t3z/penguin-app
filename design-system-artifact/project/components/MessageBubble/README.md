# MessageBubble

One message in a conversation: yours on an orange bubble at the right, theirs on a muted bubble at the left beside their avatar.

## The consumer provides
- `message`, `mine`, `dayLabel`, `receipt` (`sent` or `read`, newest own message only), `group` (start and end of a run from one sender), `sender` (name and avatar) and `onRetry`.

## Rules
- Bubbles `radius-lg`, max 82% wide, padding 10 × 14, `body` text. Mine: `primary` with `primary-foreground`. Theirs: `muted` with `foreground`.
- A group's bubbles sit 2px apart (16 between groups). The last bubble of a group takes the beak (`radius-beak`) on the sender's side, shows the time in `caption`, and — for theirs — the `avatar-sm`.
- Pending: 70% opacity and "Sending…". Failed: "Not sent" in `destructive` at 600 with a ghost Retry. Receipts: "14:02 · Sent", "14:02 · Read"; no Delivered.

Hand-written from src/features/chat/message-bubble.tsx.
