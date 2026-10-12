# Penguin design system

The source of truth is the Penguin design system artifact ("Warm Minimal Social": less chrome, more people). This file records how the app implements it.

## Foundation

Warm paper and warm night surfaces, ink text and Volcanic Orange (#FF7A00) as a fill for the one main action of a screen. Orange you read is `primary-text`; text on orange is `primary-foreground`. Every text pair keeps WCAG AA contrast and every control outline and focus ring 3:1 (`tests/theme-contrast.test.mjs`).

Colours, radii, sizes, motion and shadows live in `src/theme/tokens.ts`. The provider exposes the opaque colours as RGB variables to NativeWind (`tailwind.config.js` lists them). Tokens with alpha (`nav-surface`, `nav-surface-solid`, `nav-border`, `nav-active`, `overlay`) have no class: apply them with `style`. Shadows go through `shadowStyle()` in `src/theme/shadow.ts` and only on floating layers. No literal colour belongs in a component.

Typography (`tailwind.config.js`): display 30/36, title-1 24/30, title-2 20/26, headline 17/24, body 16/24, body-ar 17/28, callout 15/22, label 15/20, footnote 13/18, caption 12/16, micro 11/14. `Text` variants: h1 display, h2 title-1, h3 title-2, h4 headline, default/p body, callout, large (label, names and buttons), small (footnote 600, field labels), muted (footnote, meta), caption. New size names must also be added to `src/lib/utils.ts`, or `cn()` treats them as colours and drops the text colour.

The design specifies Readex Pro. The app still loads Inter until `@expo-google-fonts/readex-pro` is approved; only the font family will change.

Spacing: 4, 8, 12, 16, 20, 24, 32, 40, 48; screen gutter 20. Radius: `sm` 10, `md` 14 (controls, media), `lg` 20 (bubbles, sheets, dialogs, menus), `xl` 24 (pill composer), full (avatars, chips, navigation island), and `beak` 6: the one tight corner on the last bubble of a group, the Create tile and the send button.

Themes support Light, Dark and System, as before.

## Components

| Component | Where | Notes |
|---|---|---|
| Button | `ui/button.tsx` | default (primary), outline / secondary, ghost, link, destructive (text only); 48 high, `sm` 40 with hitSlop; disabled and loading |
| IconButton | `ui/icon-button.tsx` | 48 circle, 24 icon, `tinted` while its menu is open |
| Input / FormField | `ui/input.tsx`, `ui/form-field.tsx` | 48 high, 1.5 `input` outline, 2 `focus` / `destructive`; `search` adds the magnifier and a clear button |
| Chip, Dialog, Menu, Toast | `ui/*.tsx` | new primitives |
| Avatar | `social/user-avatar.tsx` | xs 24, sm 28, md 40, lg 48, xl 96; the only app-level avatar |
| Tabs | `navigation/segmented-tabs.tsx` | text tabs with a 2px `primary` underline |
| Header | `navigation/top-bar.tsx` | 56 high, at most one action |
| Navigation | `navigation/tab-bar.tsx`, `nav-layout.ts` | floating island, docked bar or hidden, decided by `useNavLayout()` |
| BottomSheet | `sheets/sheet-shell.tsx` | raised surface, `overlay` scrim, optional footer action |
| EmptyState | `social/state-panel.tsx` | outline action unless `primaryAction` |
| PostItem | `features/posts/post-card.tsx`, `post-search-result.tsx` | edge to edge; compact search variant |
| MessageBubble, TypingIndicator, Composer, ConversationRow | `features/chat/*` | presentation only; chat behaviour unchanged |
| GroupRow, GroupAvatar | `features/groups/group-row.tsx`, `group-avatar.tsx` | 72 row; a group is its initials in a rounded square (48 `md`, 96 `lg`), never a circle, which is reserved for students |

Icons are Lucide at 16 / 20 / 24 (32 in empty states), stroke 1.75, outline by default. Icon-only controls must receive `accessibilityLabel`. Status is never colour alone. Skeletons are static.

## Not built yet

- Readex Pro and the navigation blur (`expo-blur`): both need a new dependency. The island ships with `nav-surface-solid`.
- "Discard this post?" when leaving Create with a draft: the Dialog exists, the safeguard is not wired.
- The shorter profile header for screens under 640dp tall, and Discover's optional 60-second cache.
- The sample Stories, sample feed and inline composer left the screens; their files remain in `src/features/home/`.

## Reuse rule

Before adding a primitive: check React Native Reusables, import its compatible NativeWind source, review required dependencies, then apply Penguin tokens. Keep source provenance (`docs/component-provenance.md`). Only introduce a custom primitive when a concrete technical or design requirement cannot be met.
