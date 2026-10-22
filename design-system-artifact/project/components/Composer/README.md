# Composer

The chat input: a pill-shaped text field and the send button.

## The consumer provides
- `placeholder`, `onSend` (returns whether the message was handed over) and optional `onDraftChange` for the typing signal.

## Rules
- The field is an Input with `radius-xl`, growing to about five lines, then scrolling.
- Send is a 48 circle with the beak (`radius-beak`) at the bottom right: `primary` with a `primary-foreground` icon when there is text, `muted` with `disabled-foreground` otherwise.
- Text only: no attach, photo or voice control. The draft clears when the message is handed over.

Hand-written from src/features/chat/composer.tsx.
