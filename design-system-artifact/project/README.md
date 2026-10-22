Penguin is a social app for students: posts, people, groups and messages. Its style is **Warm Minimal Social — less chrome, more people.** Warm paper and warm night surfaces, ink text, and one Volcanic Orange fill for the action that matters. The interface steps back so students' words and photos lead.

## Content fundamentals

- **Plain, warm, second person.** Speak to the student as "you"; the app never says "we". "Your thoughts, questions, and discoveries belong here. Share your first post."
- **Sentence case everywhere**: titles, buttons, menu items, tabs ("Create a group", "Admin history", "Show more").
- **Buttons are verbs that say what happens**: "Create a post", "Try again", "New message", "Retry". Never "OK" or "Submit".
- **Explain, then offer one next step.** Empty and error states pair a short title with one sentence and at most one action: "You're offline" / "Check your connection and try again." / Try again.
- **Say what is lost before it is lost.** Destructive dialogs name the consequence: "What you wrote and the photos you chose will be lost."
- **Honest states.** Show only what the system knows: "Sent" and "Read", no "Delivered"; "Sending…" and "Not sent" with Retry; "—" when a count is unavailable.
- **Placeholders are inviting examples**, not instructions: "Let an idea take shape…", "For example, Algorithms study group", "you@university.edu".
- Typographic punctuation: curly apostrophes (isn’t), the ellipsis character (…), the middle dot for meta (`@leo · 2h`, `14:02 · Read`).
- No emoji in the interface. No exclamation marks.
- Arabic and other right-to-left text is set right-aligned in `body-ar`.

## Colour

- Set every screen on `background`. Posts sit directly on it, edge to edge, separated by a `divider` rule: no card, no shadow. Use `card` for fields and the few true cards.
- Write in `foreground` (ink). Use `muted-foreground` for meta lines, timestamps, hints and placeholders.
- `primary` (Volcanic Orange #FF7A00) is a **fill, never text**. It marks the one main action of a screen, your own chat bubbles, the Create tile, the send button, the selected-tab underline and the wordmark's dot. Text and icons on it are `primary-foreground` (ink, in both themes). Pressed and hovered fills use `primary-pressed`.
- Orange you read is `primary-text`: ghost and link buttons, "Show more", the liked count.
- `accent` with `accent-foreground` is the warm tint for highlighted cards and half of all avatar and group fallbacks.
- `muted` carries received bubbles, fallbacks, pressed rows and disabled fills; `disabled-foreground` is the label on a disabled fill.
- Status colours (`success`, `warning`, `destructive`, `info`) are text, icon and outline colours on `background`, `card` and their own `*-surface` fills. Status is never colour alone: pair it with a word or an icon.
- Destructive actions are **text only** (`destructive` on transparent), and only inside menus and dialogs.
- Alpha tokens (`nav-surface`, `nav-surface-solid`, `nav-border`, `nav-active`, `overlay`) have no Tailwind class in the app; apply them with `style`.
- No literal colour in a component. Every text pair meets WCAG AA in both themes; `input` outlines and the `focus` ring meet 3:1 on every surface. The app enforces this in `tests/theme-contrast.test.mjs`.

## Type

- One family, Inter, in four weights (400, 500, 600, 700). On Android each weight is its own family (`Inter_600SemiBold`…), so choose weight with the `font-inter-*` utilities, never `font-semibold`.
- The design specifies **Readex Pro**; the app keeps Inter until that dependency is approved. Only the family will change.
- Scale (size/line height): `display` 30/36 (Welcome only), `title-1` 24/30 (screen titles), `title-2` 20/26 (sheet, dialog and empty-state titles), `headline` 17/24 (section and card titles, titles after Back), `body` 16/24, `body-ar` 17/28, `callout` 15/22, `label` 15/20 (buttons and names at 600), `footnote` 13/18 (meta), `caption` 12/16, `micro` 11/14 (navigation and badges).
- Titles are weight 600. Body copy is 400. Names and buttons are `label` at 600.

## Space, size and shape

- Spacing steps: `space-1` 4, `space-2` 8, `space-3` 12, `space-4` 16, `space-5` 20, `space-6` 24, `space-8` 32, `space-10` 40, `space-12` 48. The screen gutter is `space-5`. Rows are 72 (`row`).
- Every touch target is at least 48 (`touch-min`). Compact controls (40px buttons, 36px chips, 44px tabs) restore 48 with hit slop.
- Radius: `radius-md` 14 for controls and media, `radius-lg` 20 for bubbles and floating layers, `radius-xl` 24 for the pill composer, `radius-sm` 10 for badges, `radius-full` for avatars, chips, icon buttons and the navigation island.
- **The beak.** `radius-beak` (6) is the one tight corner that points at its source: the last bubble of a message group, the Create tile (bottom-left) and the send button (bottom-right). Use it nowhere else.
- **Circles are students, rounded squares are groups.** `UserAvatar` is always a circle; `GroupAvatar` is initials in a `radius-md` (48) or `radius-lg` (96) square.
- Borders: `border-hairline` 1 for cards, menus and dividers; `border-control` 1.5 for field, outline-button and chip outlines; `border-focus` 2 for focus, invalid fields and the tab underline.
- Content stops at `content-max-width` 600 on tablets and web.

## Elevation

- Only floating layers cast a shadow: `shadow-raised` for the navigation island, menus, dialogs and toasts; `shadow-sheet` for bottom sheets. On Android use elevation 6 and 12. Floating layers sit on `surface-raised` over the `overlay` scrim.
- Nothing on the page itself (posts, rows, cards) has a shadow.

## Motion

- Durations: quick 120ms (press feedback, the like pop), standard 180ms (navigation capsule cross-fade), gentle 240ms.
- Motion confirms a touch and nothing more: the Create tile scales to 0.94 while pressed; a heart pops to 1.25 once when a like lands. Dialogs, menus and sheets fade.
- With Reduce Motion on, everything is instant. Skeletons are static: no shimmer, no loops.

## Navigation

- The bottom navigation has exactly five items, in this order: Home, Discover, Create (an action, never selected), Messages, Profile (your own avatar, ringed in `foreground` when selected).
- On regular phones it is a floating island (`nav-surface-solid`, `nav-border`, `shadow-raised`, max 440 wide, 12 from the edges); on small screens, with three-button navigation or large text, the same bar docks to the edge; it hides while the keyboard is open.
- The top bar is 56 high with a `title-1` title (or the wordmark on Home) and at most one action. After Back, the title drops to `headline`.

## Iconography

- **Lucide**, outline, on a 24 grid, stroke 1.75 at every size: `icon-sm` 16 for meta, `icon-md` 20 for post actions and fields, `icon-lg` 24 for navigation, headers and toolbars, `icon-xl` 32 in empty-state tiles.
- Filled icons only for the selected navigation item (stroke 2.25) and a liked heart (`primary` fill, `primary-text` stroke).
- Icon-only controls always carry an accessibility label. One decorative icon per empty state, in an `IconTile`.
- The Icons group holds the exact Lucide glyphs the app imports (Lucide 1.49, ISC licence), drawn in `foreground` ink (#1C1712). Recolour them in code; as `<img>` they stay ink.

## Brand marks

- In the app the brand is the **text-only wordmark**: "Penguin" in Inter Bold outlines with 2% tighter tracking, letters in `wordmark` and the dotless i's dot in `primary`. Sizes: 26 (top bar), 34 (auth), 38 (hero), 40 (onboarding). Use `penguin-wordmark-ink.svg` on light grounds and `penguin-wordmark-paper.svg` on dark.
- The penguin mascot is an illustration, not a logo: Welcome artwork, the app icon and store assets only. Its head is black, so on the dark theme show the app-icon tile (`penguin-icon-small.png`) instead of the standalone mascot.
- Never redraw, recolour or crop the mascot, and never pair the mascot with the wordmark inside the app.

---

Not synced: the React Native components are not built into a live bundle. Their cards are static HTML renditions styled by `components/bundle.css`, each hand-written from the source path its README names. The legacy Figma export (`design-reference/figma-exports`, an earlier teal palette) was not used: the code is the source of truth. Readex Pro is specified but not shipped, so `type.fonts` carries Inter.
