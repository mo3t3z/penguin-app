# Authentication foundation

Sprint 1B extends this foundation with verification and password recovery. See [email flows and Dashboard configuration](auth-email-flows.md). The Sprint 1A scope notes below are historical and superseded for those two features.

## Configuration

Copy `.env.example` to `.env` and enter the Supabase project's HTTPS URL and `sb_publishable_` key. Restart Expo after changing values. Missing/invalid configuration renders a setup message without constructing a broken client. `.env` is already ignored by Git. All EXPO_PUBLIC variables are bundled into the client: never use a service-role/secret key.

No remote project, database tables, policies, or dashboard settings were created or changed. A configured Supabase project with email/password authentication enabled is required for live use.

## Boundaries

- `src/lib/env.ts`: client-safe configuration validation.
- `src/lib/supabase.ts`: singleton SDK client; automatic token refresh and session persistence; URL session detection disabled.
- `src/lib/auth-storage.ts`: encrypted native SecureStore adapter, with Unicode-safe chunks for large session payloads. A manifest is switched after all chunks are saved. Failed writes preserve the previous manifest; cleanup is best effort. OS access is limited to the unlocked device; no biometric prompt. Browser persistence uses the SDK's default local storage and web locking.
- `src/features/auth/service.ts`: sign-in, sign-up, local-device logout, and safe error messages. Screens never call Supabase directly.
- `src/features/auth/provider.tsx`: the single source of session state; subscribes before restoration and avoids stale restoration overwriting auth events. Native auto-refresh follows foreground/background lifecycle, with listener cleanup. Storage failures expose a retry state. The provider does not log tokens or store passwords.
- `src/features/auth/auth-screen.tsx`: shared login/sign-up composition using existing Penguin primitives, inline validation, loading/error states, and duplicate-submit prevention.

No additional state/form library is needed for two fields. Server validation remains authoritative. Sign-up uses an 8-character client minimum; Supabase may require a stronger password. Passwords are never trimmed and are cleared after successful submission.

## Routes

`src/app/index.tsx` redirects to `/login` or `/account`. The root Stack uses Expo Router protected groups: `(public)` contains login/sign-up and `(protected)` contains a minimal session/logout screen. Restoration completes before the route tree is exposed. Sign-out removes the current device session; other devices remain signed in. An unsuccessful logout retains the current screen and shows a retryable error. Guards are navigation controls, not server authorization: future data access must use RLS.

The gallery remains development-only. No UI primitive was rebuilt or redesigned.

## Scope and deferred work

If Supabase returns a sign-up response without a session, the user remains public and sees an informational message; the app does not pretend they are authenticated. Do not disable production confirmation requirements to work around this. Email verification/callback handling, forgot password, profiles, onboarding, and all product features are deferred. Full sign-up activation on a confirmation-required project therefore awaits that later work.

No `.env` was supplied, so live sign-in/sign-up/logout and persistence could not be exercised against a project. Native storage behavior and device QA remain pre-release requirements, not development blockers. SecureStore persistence across uninstall is platform-dependent; a reinstall must not be treated as a guaranteed logout.

Validation for this task is intentionally limited to one TypeScript run and one lint run, per request. No browser, visual, accessibility, dependency-audit, or Sprint 0 checks were run.

References: https://supabase.com/docs/guides/auth/quickstarts/react-native and https://docs.expo.dev/router/advanced/authentication/
