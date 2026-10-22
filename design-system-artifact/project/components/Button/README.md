# Button

A 48px pressable with a text label, in one of six variants, for the actions on a screen.

## When to use
- `default` (primary, orange fill): the one main action of a screen. One per screen.
- `outline` / `secondary`: other actions, and the action of an empty state.
- `ghost` and `link`: inline actions (Retry, Show more); text in `primary-text`.
- `destructive`: text-only, and only inside menus and dialogs.

## The consumer provides
- `children`: a `Text` label, optionally with an icon before it. Labels are verbs in sentence case.
- `variant` (default `default`), `size` (`default` 48, `sm` 40 with hit slop to 48, `lg` 48 with wider padding, `icon` 48 circle).
- `disabled`: filled and outline buttons turn `muted` with a `disabled-foreground` label; text-only ones fade to 50%.
- `loading`: keeps the action colour and adds a spinner; the button is busy and not pressable.

## Rules
- Corners `radius-md`; label `label` (15/20, 600); focus-visible outline `border-focus` in `focus`, offset 2.
- Text on primary is always `primary-foreground`, never white.

Hand-written from src/components/ui/button.tsx.
