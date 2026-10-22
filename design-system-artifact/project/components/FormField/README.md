# FormField

A labelled Input with an optional hint or error line beneath it.

## The consumer provides
- `label` (required), `hint`, `error`, `required`, plus every Input prop.

## Rules
- Label `footnote-strong` (13/18, 600) 6px above the field. Hint `caption` in `muted-foreground`.
- An error replaces the hint: `caption` in `destructive` with a 16px CircleAlert icon, announced politely; the field turns invalid. Never colour alone.

Hand-written from src/components/ui/form-field.tsx.
