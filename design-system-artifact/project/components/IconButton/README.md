# IconButton

An icon-only 48px circle for headers and toolbars, with a 24px icon.

## The consumer provides
- `icon`: a Lucide icon. `accessibilityLabel`: required, it is the only name the control has.
- `color`: a solid colour token (default `foreground`).
- `tinted`: the `muted` fill that marks the button whose menu is open.
- `disabled`: fades to 50%.

## Rules
- Visual size and touch target are both 48. Pressed and hovered: `muted`.
- A top bar holds at most one action besides Back.

Hand-written from src/components/ui/icon-button.tsx.
