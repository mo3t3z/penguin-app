# BottomSheet

A raised panel from the bottom edge: handle, centred title, close button, scrolling content and an optional footer action.

## The consumer provides
- `visible`, `title`, children, `onClose`, and for a footer action `confirmLabel` (default "Confirm selection"), `confirmDisabled`, `onConfirm`.
- The caller keeps the temporary choice in its own state, so closing without confirming discards it.

## Rules
- `surface-raised`, top corners `radius-lg`, `shadow-sheet`, over the `overlay` scrim; at most 88% of the screen, max 576 wide.
- Handle 40×4 in `border`; header 56 with the title in `body` at 600; content inset `space-5`.

Hand-written from src/components/sheets/sheet-shell.tsx.
