# Penguin

Mobile-first Expo foundation with Ink + Snow + Glacier styling, React Native Reusables primitives, and Sprint 1A authentication. See [authentication setup](docs/authentication.md); copy `.env.example` to `.env` and enter your project's public Supabase configuration before running.

## Run

Use Node 22.14 or newer and npm.

```sh
npm ci
npm start
```

Scan the Expo QR code with an SDK-compatible Expo Go installation on Android. Alternatively, `npm run android` opens an installed Android emulator. `npm run web` opens the browser preview. Local iOS simulator builds require macOS; an iPhone can use a compatible Expo Go installation.

Open **UI foundation** on the login/sign-up screen, or `/gallery` on web. The gallery is gated with `__DEV__`, excluded from release bundles, and redirects to `/` in production.

```sh
npm run typecheck
npm run lint
npm test
npm run doctor
npx expo install --check
npm run export
```

## Structure

```text
src/app/                 Router layout, landing, gallery gate, not-found route
src/components/ui/       Reusables-based primitives, Icon, FormField
src/theme/               Semantic color/spacing/radius/motion tokens, provider
src/lib/                 Class-name merging with Penguin typography support
src/dev/                 Interactive development component gallery
assets/                  Expo template launcher assets (temporary)
tests/                   Automated theme contrast checks
docs/                    Design system, provenance/license, validation notes
```

## Dependencies

- Expo SDK 57, React 19.2, React Native 0.86, TypeScript 6.
- Expo Router, linking/constants, screens, safe-area context, status bar and system UI.
- Stable NativeWind 4.2 with Tailwind 3.4; Expo-compatible Reanimated and Worklets.
- Reusables source plus only its required avatar, separator and slot primitives; class-variance-authority, clsx and tailwind-merge.
- Lucide React Native and react-native-svg for icons.
- React DOM and React Native Web for browser verification.
- Expo Doctor, Expo Babel preset, ESLint 9 and the Expo ESLint config for development.

Exact resolved versions are recorded in `package-lock.json`. Do not add overlapping UI kits or upgrade native dependencies independently of Expo compatibility checks.

See [design system](docs/design-system.md), [component provenance](docs/component-provenance.md), and [verification](docs/sprint-0-verification.md).

