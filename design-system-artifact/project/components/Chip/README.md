# Chip

A choice in a short set: a 36px pill with an `input` outline that fills with `foreground` when selected.

## The consumer provides
- `label` (also its accessibility label) and `selected`; the press handler.

## Rules
- Label `chip-label` (15/22, 500). Selected: `foreground` fill, `background` label.
- Hit slop brings the touch target to 48. Selection is announced through the selected state, not colour alone.

Hand-written from src/components/ui/chip.tsx.
