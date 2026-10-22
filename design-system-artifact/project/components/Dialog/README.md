# Dialog

A blocking question for an irreversible choice, centred over the `overlay` scrim.

## The consumer provides
- `visible`, `title`, optional `description`, `actions` (Buttons, the safe one first and the destructive one last) and `onClose`.

## Rules
- `surface-raised`, `radius-lg`, `shadow-raised`, 24px padding, max 384 wide. Title `title-2`; description `callout` in `muted-foreground`; actions right-aligned.
- Say what will be lost: "What you wrote and the photos you chose will be lost."

Hand-written from src/components/ui/dialog.tsx.
