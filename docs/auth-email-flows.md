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

## Sprint 1 fix: email links and deep links (2026-10-09)

Status: superseded by "Verified on Android" at the end of this document. This section
records the audit as it stood before any device test.

### What the audit found

- The app requests every email with its own callback URL, uses PKCE, exchanges the code
  once, and lets Supabase's `PASSWORD_RECOVERY` event (not the URL) open the reset
  screen. The installed auth library (2.117.2) emits that event on code exchange. No
  defect was found in that path.
- A failing mail provider was invisible or misleading. Sign-up and resend showed "Check
  your connection"; password recovery showed its normal neutral message. An SMTP error
  such as `535 Username and Password not accepted` therefore looked like an app or link
  problem.
- Only the most recent email's link can be completed. Each request (sign-up, resend,
  password reset) replaces the stored PKCE verifier, so an older email's link fails on
  return even though Supabase has already confirmed the address. The screen gave no hint.
- A failed link offered only "request another email", although after a failed
  confirmation link the account can usually just log in.
- The app has no development-client dependency, so on a phone it runs in Expo Go, where
  the callback is `exp://<host>/--/auth/callback`, not `penguin://auth/callback`. If
  that exact URL is not allowlisted, Supabase sends the link to the Site URL instead and
  the app never opens.

### What changed in the app

- `src/features/auth/email-callback.ts` reads the link once: a code, a recovery hash, or
  a reason for failure (expired or used, refused, incomplete). Values that are not short
  URL-safe strings are never sent to Supabase.
- The callback screen explains each case, offers Log in when signed out, and completes a
  link once per link.
- `src/features/auth/auth-errors.ts` recognises a mail-provider failure and says the
  problem is on Penguin's side, without showing server text.
- Password recovery keeps its neutral message. In development builds only, a note
  appears when the server could not send the email.
- The check-email screen says to use the most recent email.

Email confirmation was not disabled or bypassed.

### Dashboard settings to check (not done by this change)

1. Authentication → Emails → SMTP Settings: either turn custom SMTP off (built-in
   sender, a few emails per hour, for testing only) or correct the credentials. For
   Gmail the password must be a 16-character app password for an account with 2-step
   verification, the username the full address, host `smtp.gmail.com`, port 465 or 587,
   and the sender address the same account.
2. Authentication → URL Configuration → Redirect URLs must contain
   `penguin://auth/callback` and, for Expo Go testing only, `exp://**`.
3. Authentication → URL Configuration → Site URL should not be relied on; a link that
   lands there means the redirect URL was not allowlisted.
4. Authentication → Emails → Templates: "Confirm signup" and "Reset password" must link
   to `{{ .ConfirmationURL }}`.
5. Authentication → Sign In / Providers → Email: "Confirm email" stays on.
6. Authentication → Logs show the exact mail error after a test request.

## Android APK and the `penguin://` deep link (2026-10-09)

Status: the development APK has since been built and installed, and both email links
were verified on it. See "Verified on Android" at the end of this document.

### Why links did not open the app

Emails arrived, but the app was running in Expo Go. Expo Go cannot register the
`penguin` scheme, and its callback address is `exp://<host>:<port>/--/auth/callback`,
which changes with the network. An installed build registers `penguin://` with Android,
so the link has a fixed target.

There was a second problem waiting behind that one: in a development build the linking
library builds callback addresses from the development server's host, which would have
produced a changing, malformed address. Installed builds now always send
`penguin://auth/callback` (`src/features/auth/auth-redirect.ts`).

### What is configured

- `app.json`: `scheme` is `penguin`; `android.package` is `com.penguin.student`.
- `eas.json`: two internal APK profiles and no production profile.
  - `development`: development build. Loads JavaScript from `npx expo start` on your
    computer, so it uses the local `.env`.
  - `preview`: standalone APK with the JavaScript bundled. `.env` is git-ignored and is
    not uploaded, so `EXPO_PUBLIC_SUPABASE_URL` and
    `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` must first be added as EAS environment
    variables for the `preview` environment.
- `expo-dev-client` is the one added dependency (SDK-matched version).
- PKCE, the one-time code exchange and the email-confirmation requirement are unchanged.

### Supabase Redirect URLs for the APK

Authentication → URL Configuration → Redirect URLs must contain exactly:

    penguin://auth/callback

Nothing else is needed for the APK. Do not add `penguin://**` or other wildcards.
`exp://**` is only for Expo Go testing and should be removed once the APK is in use.

### Build, install and test

1. `npm install --global eas-cli` then `eas login` (an Expo account is required).
2. `eas init` once, to create the EAS project and write its id into `app.json`.
3. `eas build --platform android --profile development`. The first build asks to
   generate an Android keystore; accept and let EAS store it.
4. Open the build page link on the phone and install the APK (allow installs from the
   browser when Android asks). Or `adb install path/to/file.apk`.
5. On the computer run `npx expo start`. Phone and computer must be on the same Wi-Fi;
   open Penguin and choose the development server (or scan the QR code).
6. Sign up with a new address, open the Gmail message on the same phone and tap the
   link: Penguin opens on "Email confirmed.".
7. Log out, choose "Forgot password", request a link, tap it in Gmail: Penguin opens on
   "Choose a new password.".

Emails requested from Expo Go before installing the APK carry the old `exp://` address;
request new ones from the installed app.

## Recovery email pointing at `http://localhost:3000` (2026-10-09)

Measured against the hosted project without sending any email (a deliberately invalid
token on the verify endpoint, which only reveals where Supabase would redirect):

| Requested return address | Supabase redirects to |
|---|---|
| `penguin://auth/callback` | `penguin://auth/callback` |
| `penguin://<host>:8081auth/callback` (old development-build address) | `http://localhost:3000` |
| `exp://<host>:8081/--/auth/callback` (Expo Go) | `http://localhost:3000` |

So `penguin://auth/callback` is allowlisted, the Site URL is `http://localhost:3000`, and
any other address falls back to the Site URL. An email containing
`redirect_to=http://localhost:3000` was therefore requested with an address other than
`penguin://auth/callback`: from Expo Go, or from JavaScript older than the fixed-address
change. Which one was not observed.

The Supabase auth log for the next recovery request recorded its return address as
`penguin://auth/callback`, and that request's email opened the app. The earlier
localhost email therefore came from a request made before the fixed address was running
on the phone.

While this was investigated, the email-request screens showed a temporary
development-only line (return address, platform, execution environment and a revision
marker) and the recovery request wrote one development console entry. Both were removed
once the flows were verified; neither ever contained a token, code, key or email address.

`otp_expired` on that link is a separate, expected result: a recovery token works once
and only the newest one is valid.

`{{ .ConfirmationURL }}` is compatible with the PKCE callback: Supabase verifies the
token and redirects to the allowlisted address with `?code=`, which the app exchanges.

## Verified on Android (2026-10-09)

Confirmed by the user on the installed Android development APK (`com.penguin.student`,
connected to the local development server), against project `utdwgmvdhghmephbvxvj`:

| Scenario | Result |
|---|---|
| Confirmation email is delivered | PASS |
| Tapping the confirmation link opens the installed app | PASS |
| The account is confirmed | PASS |
| Password recovery email is delivered | PASS |
| Tapping the recovery link opens the installed app on the reset screen | PASS |
| The password is updated and log in works with the new password | PASS |

Read in the Supabase dashboard on the same day (read-only): Site URL
`http://localhost:3000`; Redirect URLs include `penguin://auth/callback`; the Reset
password template links to `{{ .ConfirmationURL }}`.

### What made it work

- An installed build, so Android has a registered `penguin://` target. Expo Go cannot
  receive these links.
- A fixed return address, `penguin://auth/callback`, for every installed build
  (`src/features/auth/auth-redirect.ts`) instead of one derived from the development
  server.
- `penguin://auth/callback` in the Supabase Redirect URLs.

PKCE, the one-time code exchange and the email-confirmation requirement are unchanged.

### Still deferred

Not yet run on a device (tracked in `docs/android-acceptance-checklist.md`):

- Resend verification email, and the auth log check for mail errors.
- After confirmation, Continue leading to onboarding.
- Both links from a closed app (cold start) and from the background.
- A link tapped twice; an older email's link after Resend.
- A recovery link for one account opened while signed in as another.
- Cancelling on the reset screen.
- A deliberately broken mail sender (sign-up message and the development-only note on
  the recovery screen).
- A standalone `preview` APK, which needs the two public Supabase values as EAS
  environment variables.

### EAS upload

`.easignore` repeats every `.gitignore` rule (EAS uses it instead of `.gitignore`) and
also leaves out `docs/`, `design-reference/`, `tests/`, `supabase/` and `.claude/`,
none of which the app imports. `.env` stays excluded.
