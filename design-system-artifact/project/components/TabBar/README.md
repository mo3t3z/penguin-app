# TabBar

The main navigation: exactly five destinations — Home, Discover, Create, Messages, Profile — in that order.

## The consumer provides
- Nothing: it is the router's tab bar. Tab screens pad their lists so content scrolls underneath it.

## Rules
- Floating island on regular phones (`nav-surface-solid`, hairline `nav-border`, `radius-full`, `shadow-raised`, max 440, 12 from the edges); docked to the edge on small screens, with three-button navigation or large text; hidden while the keyboard is open.
- Items 64 high: 24px icon over a `micro` label in `nav-label`; selected in `foreground` at 600 with a `nav-active` capsule (64 wide), stroke 2.25, filled Home and Messages.
- Create is an action, never selected: the 48 `primary` tile with `radius-tile` corners and the `radius-beak` bottom-left, scaling to 0.94 while pressed.
- Profile is the student's own avatar (`avatar-xs`) with a 2px `foreground` ring when selected. No unread badge on Messages.

Hand-written from src/components/navigation/tab-bar.tsx.
