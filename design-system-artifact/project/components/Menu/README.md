# Menu

A short list of secondary actions under the icon button that opened it.

## The consumer provides
- `visible`, `items` (key, label, icon, onPress, optional destructive, busy, disabled), `top` and `right` (placement from the screen edges) and `onClose`.

## Rules
- 224 wide, `surface-raised`, hairline `border`, `radius-lg`, `shadow-raised`; items 48 high, `radius-md`, `label` at 400 with a 20px icon.
- Destructive items are `destructive` text and icon. Tapping outside or Back closes it; the opening IconButton is `tinted` meanwhile.

Hand-written from src/components/ui/menu.tsx.
