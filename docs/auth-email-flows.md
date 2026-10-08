# Sprint 1B — Verification and password recovery

## Dashboard configuration required

1. Enable email/password and Confirm email in Supabase Authentication settings.
2. Add `penguin://auth/callback` to Authentication > URL Configuration > Redirect URLs for installed development/production apps. The scheme already exists in app.json; use a build that registers it. Expo Go uses an `exp://.../--/auth/callback` URL that varies by development host. Allowlist the exact callback URL for that environment. Web uses its current origin plus `/auth/callback`; allowlist the exact development and deployed HTTPS URLs. Do not broadly allow untrusted origins.
3. Keep Confirm signup and Reset password templates linking to `{{ .ConfirmationURL }}`. Supabase validates the email link and redirects to the supplied callback with a PKCE authorization code. Do not change these templates to send raw tokens directly to the app. If customized, ensure they preserve the requested RedirectTo rather than forcing SiteURL.
4. Configure a production SMTP sender, verified sending domain, appropriate expiry and rate limits. The default sender is restricted; external email delivery was not exercised during this task.

No Dashboard configuration was modified by this implementation.

## Verification

Sign-up supplies `emailRedirectTo`. Without a session it navigates to Check your email; the SDK never treats that response as authenticated. That screen also accepts an email address for `auth.resend({ type: 'signup' })`, with an in-flight guard and a 60-second local retry delay. Server limits remain authoritative. The email is not placed in a route URL or persisted.

The callback route is outside signed-in/signed-out route guards, so both a cold-start link and a link received while running can reach it through Expo Router. The provider restores persisted state first. `exchangeCodeForSession` validates the one-use code; auth events populate the existing session provider and secure persistence. Invalid, missing, expired, used, or wrong-device links offer fresh-email actions and never render raw server errors.

## Recovery

Forgot password calls `resetPasswordForEmail`. For every syntactically valid email, its visible outcome is the same neutral conditional message, including account-specific errors; the UI cannot disclose account membership. Transport/provider failures may therefore appear as “no email arrived”; users can retry after the delay. No repeated delivery tests were performed.

The existing client now uses PKCE, with automatic URL detection still disabled. The callback exchanges a code once (short-lived in-memory deduplication covers remounts). Supabase's PASSWORD_RECOVERY event, not a URL flag, grants the provider a 15-minute in-memory recovery state bound to the returned user. Normal protected account navigation is gated while recovery is pending. The reset screen requires that state and a matching session, checks matching passwords and an 8-character minimum, then calls `updateUser`. Supabase remains authoritative for password policy and session validity. Passwords are kept only in transient form state and cleared after success; no password logging or persistent password storage was introduced.

Success clears recovery state and offers continuation into the existing account flow. Cancellation signs out locally before requesting a new link. Missing/expired recovery state offers a fresh reset request. A restart after consuming a recovery link requires a fresh recovery link before changing the password through this UI; session persistence itself remains unchanged.

PKCE links must be opened in the same app installation/browser that initiated the request, where the verifier is stored. Request a new reset link on the intended device if needed. A confirmation completed on another device may still confirm the email at Supabase while the local code exchange fails; the user can return to login. Old implicit-flow emails are not accepted; request fresh emails after this change.

Callback codes are not logged. On web, query/fragment data is removed from browser history after capture. Callback navigation uses fixed application destinations, never a caller-supplied redirect. Native storage continues using the existing SecureStore adapter; browser storage remains the SDK default. No dependencies, tables, profiles, or policies were added.

## Validation scope

TypeScript and lint only, per the requested budget. Email delivery and cold/warm device callbacks still require integration QA with the configured sender; no browser, visual, accessibility, dependency, export, or Sprint 0 checks were run.
