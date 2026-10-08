# Sprint 0 verification report

Final review: 2026-10-04. Status: **INCOMPLETE — implementation finished; native acceptance pending.** No Sprint 1 work started.

## Completed implementation

Expo SDK 57, React Native, strict TypeScript, Expo Router, stable NativeWind 4/Tailwind 3, customized React Native Reusables source, semantic Penguin tokens, session-level Light/Dark/System selection, typography, icons, and a development-only gallery. Button, Text, Input, Card, Avatar, Badge, Separator, Skeleton and FormField are available.

Routes are in `src/app` as required by AGENTS.md. Components remain outside the route tree. The final review added Expo ESLint configuration and explicit busy/disabled accessibility properties where browser inspection found missing states. Conditional gallery loading has a single documented lint exception so its code can be removed from release bundles.

## Passed checks

| Check | Result |
|---|---|
| Light, Dark, live System switching | Previously passed; preserved without repeating |
| Phone-width layout / horizontal overflow | Previously passed |
| Both palettes' normal-text contrast | Both automated tests previously passed; palette unchanged |
| Expo lint | Pass, zero errors/warnings after documented conditional-require exception |
| TypeScript | Pass after final source edits |
| Expo dependency compatibility | Dependencies up to date |
| Expo Doctor | 21/21 checks passed |
| Production bundles | Android, iOS and web exported successfully after final changes |
| Expo development runtime | Fresh Metro startup and browser rendering passed |
| Form validation | Whitespace rejected; error shown with aria-invalid and associated description; valid text clears error and shows success |
| Accessibility semantics | Labeled inputs and icon controls; required field; valid description references; loading button exposes busy and disabled; unavailable input exposes disabled and read-only |
| Target sizes | Inspected buttons/inputs were at least 48px high; icon button 48px |
| Keyboard | Primary button activates with Enter; visible 3px focus ring |
| Runtime errors | No errors returned by browser error inspection in development or production |
| Production gallery | Direct /gallery navigation redirects to /; no gallery entry link; gallery module/content absent from production web JavaScript |
| Not-found route | Unknown production URL renders not-found page and return link |

The initial resumed development server needed a clean restart after dependency files changed. No source fix was necessary for that stale development session.

## Unverified native acceptance

No adb executable/connected Android testing setup was available, and this Windows environment has no iOS simulator. Successful native bundle export is **not** a native installation or device runtime test.

Before closing Sprint 0, verify on Android (and iOS for cross-platform sign-off): native startup/navigation, software keyboard behavior, safe areas, large system text, TalkBack/VoiceOver focus order and announcements, and native System appearance changes. Browser accessibility semantics are evidence, not a substitute for actual screen-reader use. Device performance was not measured.

## Warnings and technical debt

- Final npm audit reports 32 affected dependency entries: 22 high and 10 moderate, arising from four underlying advisory chains: braces (build pattern parsing), node-forge (signing tooling), decode-uri-component (Router URL parsing), uuid (Xcode tooling). A non-breaking `npm audit fix --ignore-scripts` was attempted. The remaining proposed automatic fixes involve incompatible stack changes; no force upgrade or untested override was applied. Reassess patched upstream dependencies before release, especially URL parsing. These are not 32 independent root vulnerabilities.
- Expo-selected ESLint 9 emitted an upstream end-of-support warning. It runs successfully with Expo's matching config; revisit when the supported Expo lint stack advances.
- Contrast tests use Node's experimental TypeScript stripping and emit an experimental/module-type warning on Node 22.14. Tests previously passed; avoid changing project module type solely to silence it.
- Theme preference is session-only and defaults to System after restart.
- Skeletons are intentionally static. FormField validates no business rules itself; the gallery owns its demonstration validation.
- Launcher assets are still Expo template placeholders. The UI has Penguin branding; a final app icon is not included.
- Browser verification was performed interactively; only the contrast tests are committed automated tests. Native and browser regression automation remain future work.
- React Native Reusables was imported from upstream main with license and import date, but without a pinned upstream commit; future upgrades require reviewing the customized source diff.

## Run

`npm ci`, then `npm start` (Expo), or `npm run web` (browser). Open “Explore the UI foundation” in development. Use a matching Expo Go version for bundled modules, or an appropriate development build. No native installation was verified here.

## Next acceptance action

Complete the native device checklist and resolve or explicitly assess remaining dependency advisories. Keep Sprint 1 blocked pending the user's approval.
