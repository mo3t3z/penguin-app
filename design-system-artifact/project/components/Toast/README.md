# Toast

A short result message above the navigation that leaves after 4 seconds.

## The consumer provides
- `message`, `icon`, `tone` (`neutral` on `surface-raised`, `success` on `success-surface`, `error` on `destructive-surface`), optional `actionLabel` + `onAction`, and `onDismiss`. The caller places it and shows one at a time.

## Rules
- `radius-lg`, `shadow-raised`, message `callout`, action `label` at 600.
- With a screen reader on it stays until dismissed. Never the only place an error appears.

Hand-written from src/components/ui/toast.tsx.
