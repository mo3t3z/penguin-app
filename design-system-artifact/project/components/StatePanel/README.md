# StatePanel

The empty state: explains an empty, idle or failed region and offers one next step.

## The consumer provides
- `icon` (shown in an IconTile), `title`, optional `description`, `actionLabel` + `onAction`, `primaryAction`, `footnote`, `live` (announce description changes) and optional children.

## Rules
- Title `title-2`, description `callout` in `muted-foreground` (max 320 wide), centred, 32px vertical padding.
- The action is an outline button unless it is the screen's main action (`primaryAction`).
- One sentence of explanation, one action: "You’re offline" / "Check your connection and try again." / Try again.

Hand-written from src/components/social/state-panel.tsx.
