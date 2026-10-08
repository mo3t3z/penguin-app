# Penguin design system

## Foundation

Ink + Snow + Glacier: calm neutral surfaces, strong readable type and teal actions. System fonts avoid download delays and respect platform conventions. Text scaling remains enabled. Controls have content-driven heights and minimum 48px touch targets.

Typography lives in `tailwind.config.js`: caption 12/16, metadata 14/20, body 16/24, lead 18/26, heading 22/28, title 28/34, display 34/40. Weights: 400, 500, 600 and 700. `Text` supports default/p, caption, small/muted, lead/large, h1–h4, plus upstream code and blockquote variants. Explicit margins belong to layouts, not body text.

Spacing: 4, 8, 12, 16, 20, 24, 32, 40, 48. Phone gutters start at 16. Radius: 8 small, 12 controls, 20 cards, 24 sheets, fully rounded chips and avatars.

Colors live in `src/theme/tokens.ts`; the provider exposes RGB CSS variables to NativeWind and explicit palette values to SVG/native APIs. Input outlines intentionally use stronger contrast than decorative separators. No literal palette values belong in screen components.

Themes support Light, Dark and System. System follows live OS/browser appearance changes. Sprint 0 overrides last for the current app session; restart defaults to System. Persistent settings are not part of this foundation.

## Components

| Component | API / variants |
|---|---|
| Button | default (primary), secondary, outline, ghost, destructive, link; sm/default/lg/icon; disabled and loading |
| Text | Semantic typography and inherited button/badge text styling |
| Input | default/search/multiline; focus, invalid, disabled (`editable={false}`), readOnly |
| Card | surface/outlined/muted/highlighted; Header, Title, Description, Content, Footer |
| Avatar | xs 24, sm 32, md 40, lg 48, xl 64, profile 96; Image + Fallback; required alt |
| Badge | default, secondary (neutral), campus, subject, success, warning, destructive, outline |
| Separator | Horizontal/vertical; decorative by default |
| Skeleton | Static, geometry-matching placeholder; hidden from accessibility tree |
| FormField | Label, required marker, hint/error and associated Input; no form-library dependency |
| Icon | Lucide glyph, sizes 16/20/24/32, stroke 1.75, semantic color |

Icons are decorative inside labeled controls. Icon-only Buttons must receive `accessibilityLabel`. Badges never communicate status through color alone. Avatar fallbacks are composed with initials; the upstream primitive handles failed image loading.

Loading Buttons prevent duplicate presses and expose busy state. Place meaningful loading announcements on the region containing Skeletons. Static skeletons avoid continuous GPU work and respect reduced-motion preferences without a separate animation implementation. Motion tokens reserve 120/180/220ms for future justified transitions.

## Reuse rule

Before adding a primitive: check React Native Reusables, import its compatible NativeWind source, review required dependencies, then apply Penguin tokens. Keep source provenance. Only introduce a custom primitive when a concrete technical or design requirement cannot be met. Product compositions arrive in their feature sprints; approximately 70% reuse / 30% product composition is a guideline, not a file-count target.
