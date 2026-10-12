# Penguin UI/UX quality audit

Date: 2026-10-11. Branch `fix/auth-pkce-s256`, working tree uncommitted.

**How to read this.** Everything here comes from reading the source, the design tokens,
the tests and the project documents, and from running the type checker, the linter, the
unit tests and an Android JavaScript export. **Nothing was observed on a device, an
emulator or in a browser**: no device is connected (`adb` is not installed on this
machine) and no screenshots were taken. So this audit can judge structure, consistency,
accessibility wiring and contrast arithmetic. It cannot judge how the app looks, how
smooth it feels, or how fast it is. Those are marked "not validated". No performance
figure appears in this document because none was measured.

## 1. Executive summary

Penguin has a coherent, well-enforced design system ("Warm Minimal Social") and its
screens follow it. Tokens, typography, touch-target sizes, empty/error states and
screen-reader labels are applied consistently, and most of those rules are pinned by
tests. On paper it is closer to professional quality than most apps at this stage.

What it lacks is proof. The acceptance checklist has 168 open items and almost none of
the interface work has been confirmed on a phone. The second gap is depth: several
things leading social apps treat as basic (image caching, notifications, an unread
badge, a way to choose the theme, something to browse in Discover before you search)
are not built.

This pass added five small, high-value behaviours: a guard against losing a draft post,
collapsed long posts in the feed, feedback when a like lands, scroll-to-top on the Home
tab, and one keyboard strategy shared by Create and chat.

**Verdict: not production-ready yet**, mainly because it is unverified on devices.

## 2. Scores

Each score is for what the code demonstrably does. "Ceiling" notes what keeps it from
being higher. A category that depends on seeing or feeling the app is capped and says so.

| Category | Score | Evidence | Ceiling |
|---|---|---|---|
| Visual hierarchy | 7 | One type scale (11 sizes) used through `Text` variants; one primary button per screen is a written rule; posts are edge to edge with a single divider | Not validated visually |
| Design consistency | 9 | All colours, radii, sizes, motion and shadows in `src/theme/tokens.ts`; no literal colour in screens; the "beak" corner limited to three places; shared `StatePanel`, `IdentityRow`, `PostAction`, `UserAvatar` | Inter still stands in for the specified Readex Pro |
| Navigation | 8 | Five fixed destinations; Create is an action; the bar floats, docks or hides by measured rules (`nav-layout.ts`, tested); pushed screens sit above tabs; Home now scrolls to top on re-press | No unread badge on Messages; Groups route has no entry point |
| Interaction design | 7 | 48dp targets as a token (`layout.touchMin`) with hitSlop where the visual is 44; double-press guards on every navigation action; pressed states on all controls | No swipe or long-press actions anywhere; no haptics |
| Microinteractions | 5 | Three animations in the whole app (tab capsule, Create press, typing fade) plus the new like pop; all honour reduce motion | Skeletons are static; list changes do not animate; not validated for smoothness |
| Chat experience | 8 | Grouped bubbles, one avatar and one time per group, truthful Sent/Read, typing indicator, optimistic send with Retry, reconnect recovery, single keyboard strategy; 80+ chat tests | Two-account device test not done; no reactions, reply, copy or delete |
| Social feed | 7 | Readable post item, like/comment/share with counts, right-to-left text, signed image loading tied to visibility, long posts now collapse | Images use the basic `Image` (no disk cache, no fade-in); no bookmark, no post menu (report, delete) |
| Accessibility | 8 | Contrast tests for every text pair; every `Pressable` file carries roles and labels; 43 live regions for async results; reduce motion honoured; text scaling never disabled; nav re-lays out at 1.3x text | Not tested with TalkBack or VoiceOver |
| Performance | 6 | Lists are `FlatList` with tuned windows; cards are memoised; image URLs requested only for visible posts; realtime channels close in the background | Nothing measured; no image caching library; unverifiable without a device |
| Responsive design | 7 | Content capped at 600dp; nav adapts under 360dp and for three-button navigation; long text wraps or truncates by rule | Tablets and landscape not considered (portrait locked); not validated on small phones |
| Theme quality | 7 | Complete light and dark palettes, both passing the contrast tests | No in-app theme choice (follows the system only; the setter is used only by the dev gallery); not validated visually |
| Error handling | 9 | Loading, empty, error and retry states on every list; drafts survive a failed publish; failed messages keep their text with Retry; neutral, non-revealing auth and chat errors | On the password-reset screen a mail failure is deliberately indistinguishable from "no email arrived" in production (sign-up and resend do name it) |

Contrast ratios computed from the tokens (WCAG AA needs 4.5 for text):

| Pair | Light | Dark |
|---|---|---|
| Text on background | 16.6 | 16.6 |
| Muted text on background | 5.7 | 7.5 |
| Muted text on muted surface (incoming bubble meta) | 5.3 | 6.4 |
| Text on orange | 6.8 | 6.8 |
| Orange text on background | 5.4 | 8.8 |
| Navigation label on its surface | 8.3 | 9.1 |

## 3. Strengths and weaknesses

**Verified strengths**
- A real design system, documented (`docs/design-system.md`) and enforced by tests.
- State coverage: 12 files use the shared empty/error panel; every list has a skeleton with its final geometry, an error with retry and an end-of-list message.
- Honesty rules: no control is shown for a feature that does not exist, and tests enforce it (no call, attachment, presence or "delivered").
- Accessibility is built in rather than added: labels, roles, live regions, contrast tests, reduce motion.
- Data-loss protection in the two places people type: failed posts keep the draft and resume uploads; failed messages keep their text.

**Verified weaknesses**
- No visual or device validation of almost any interface work.
- A draft post was lost on Cancel or Back with no question asked (fixed in this pass).
- A 5,000-character post was shown in full in the feed (fixed in this pass).
- Create used a different keyboard behaviour on Android from chat (fixed in this pass).
- No way to choose Light or Dark inside the app.
- Discover shows only a prompt until you type; there is nothing to browse.
- No notifications of any kind, and no unread badge on the Messages tab.
- Images are not cached to disk and appear without a transition.
- The header comment in the applied Sprint 6B migration file still says "not applied".

**Potential improvements** (not weaknesses today, but expected at the next level): message
actions on long press, double-tap to like, swipe to go back between tabs' pushed screens
(platform default applies), post menu with report and delete.

**Cannot be validated yet**: appearance in both themes, animation smoothness, scroll
performance, keyboard behaviour, safe areas on real hardware, the floating navigation
island, TalkBack/VoiceOver, iOS as a whole (no iOS build has been run).

## 4. Screens reviewed

Read in full or in their rendering parts: Home and feed list, post item, Discover,
Create post, Messages inbox, conversation, new message, Profile tab and profile header,
navigation bar and header, dialog, empty state, skeletons, theme tokens and provider.
Read only through their shared components and tests: welcome, login, sign-up, email
screens, onboarding, comments, edit profile, student profile.

## 5. Comparison with established patterns

These are principles Penguin already follows or should adopt, not features to copy.

| Reference | Principle | Penguin today | Fits Penguin because |
|---|---|---|---|
| Telegram | The inbox is one tap away and always current | Messages is a tab with live previews | Done |
| Telegram | Tapping the current tab returns to the top | Added for Home in this pass | A feed is revisited many times a day; the way back should be free |
| Instagram, X | Long text is cut in the feed, opened on demand | Added in this pass | Posts allow 5,000 characters; one must not hide the rest |
| Instagram | A like confirms itself instantly | Optimistic count existed; a short pop was added | Feedback at the moment of the tap makes a slow network feel fine |
| Instagram | Starting a post never risks losing it | Discard question added | Students write long posts on unreliable connections |
| Messenger | Status says only what is true | Sent/Read from the server, no "delivered" | Already a project rule |
| Messenger | Long press on a message offers copy and more | Not built | Copying a message is basic; text is selectable but not obviously so |
| X | Content first, little chrome | Edge-to-edge posts, header with no buttons | Done |
| Snapchat | Creation is one obvious, fast action | Central Create tile opening a sheet with the keyboard up | Done |
| All | A badge shows unread messages from anywhere | Not built | Without it a reply is invisible until the tab is opened |

Deliberately not recommended: stories, reactions, streaks, algorithmic tabs. Nothing in
the backend supports them and they would add surface without serving the core use.

## 6. Issues by severity

**High**
1. Interface work is unverified on devices (168 open checklist items).
2. Losing a draft post to one tap. *Fixed.*
3. No unread indication outside the Messages tab, and no notifications.

**Medium**
4. Long posts flood the feed. *Fixed.*
5. Create and chat disagreed on Android keyboard handling. *Fixed; unverified on device.*
6. No in-app theme choice.
7. Discover is empty until a search is typed.
8. Images: no disk cache, no placeholder transition.
9. No post menu (report, delete own post) and no message actions (copy).

**Low**
10. No feedback when a like lands. *Fixed.*
11. Home tab re-press did nothing. *Fixed.*
12. Groups screen is unreachable. *Superseded by Sprint 7A: Groups now opens from Discover (`docs/groups.md`); unverified on device.*
13. Log out signs out with no confirmation (a documented design choice; worth a device check).
14. Readex Pro not yet adopted.

## 7. Implemented in this pass

| Change | Why it matters | Where |
|---|---|---|
| "Discard this post?" on Cancel and on the system Back when there is text or a photo; never while publishing | Prevents silent loss of writing | `create-screen.tsx`, `validation.ts` |
| Long posts (over 420 characters or 8 lines) show 8 lines with "Show more" / "Show less" | Keeps the feed scannable | `post-card.tsx`, `post-presentation.ts` |
| The heart gives one short pop when a like registers; off with reduce motion; only the heart | Confirms the tap | `post-action.tsx`, `post-card.tsx` |
| Pressing Home while on Home scrolls the feed to the top (instantly with reduce motion) | Standard, free way back | `home.tsx`, `feed-list.tsx` |
| Create uses the same single keyboard strategy as the conversation | One behaviour to verify instead of two | `create-screen.tsx` |

No dependency was added. No backend, schema, policy, authentication or navigation
structure was changed.

## 8. Files changed

- `src/features/posts/create-screen.tsx`
- `src/features/posts/validation.ts`
- `src/features/posts/post-card.tsx`
- `src/features/posts/post-presentation.ts`
- `src/features/posts/feed-list.tsx`
- `src/components/social/post-action.tsx`
- `src/app/(protected)/(tabs)/home.tsx`
- `tests/ux-refinements.test.mjs` (new, 7 tests)
- `tests/discover-posts.test.mjs` (one pinned signature updated)
- `docs/UI_UX_QUALITY_AUDIT.md` (this file), `docs/android-acceptance-checklist.md`

## 9. Validation results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npx expo lint` | Clean |
| `npm test` | 258 of 258 pass (251 before this pass, 7 added) |
| `npx expo export --platform android` | Bundles |
| Device, emulator, screenshots | **Not done.** No device available |

## 10. Remaining issues

Items 1, 3, 6, 7, 8, 9, 12, 13 and 14 above remain. In addition:
- The "Show more" rule is by length, so a post just under the limit with very long
  words could still run past 8 lines, and one just over could be cut by only a line.
- An opened long post closes again if it scrolls far enough away to be unmounted.
- Authentication: an earlier version of this audit said email delivery "blocks new
  sign-ups in practice". That was wrong; it repeated a problem that had already been
  fixed and verified on a phone. See section 13 for the status of each flow. What is
  still open is narrower: which mail sender the project uses and its sending limits
  are not recorded, and the edge cases listed in section 13 have not been run.

## 11. Manual device checklist for this pass

Added to `docs/android-acceptance-checklist.md` as DEFERRED:
- Create: type something, tap Cancel, see the question; "Keep editing" keeps the text and the keyboard returns; "Discard" closes. Same with the system Back. With nothing typed, both close at once.
- Create: the toolbar sits on the keyboard, with no gap and nothing hidden, opening and closing.
- Feed: a long post shows 8 lines and "Show more"; opening and closing it does not jump the list.
- Feed: liking shows a brief pop; with "Remove animations" on, there is none.
- Home: scroll down, press Home again, the feed returns to the top.

## 12. Recommendations, in order

1. **Run the device checklist**, starting with chat (two accounts), keyboard behaviour and both themes. This is the single biggest gain in confidence and will reorder everything below.
2. **Unread badge on the Messages tab.** The inbox already knows what is unread; it needs to be held above the tab screens. No backend change.
3. **Confirm the email sender before wider release.** Emails were delivered in the device test; what is not recorded is which sender is configured and how many emails per hour it allows. Read both in the Supabase dashboard.
4. **Theme choice** (System, Light, Dark) in the Profile menu, remembered between launches.
5. **Cached images** with a placeholder transition (`expo-image`; needs approval and a new build).
6. **Message and post menus**: copy a message; report or delete a post.
7. **Something to browse in Discover**, such as students from your institution. Needs a query.
8. **Push notifications** for new messages. Largest effort; needs backend work and a build.

## 13. Authentication status

Reviewed on 2026-10-11 by reading the current code (`src/features/auth/`,
`src/app/auth/callback.tsx`, `src/lib/supabase.ts`, `src/lib/webcrypto*.ts`), the fix
history (commit `7d84e18` and the uncommitted PKCE S256 change) and
`docs/auth-email-flows.md`, and by re-running the automated checks. No authentication
code was changed by this review.

Three kinds of evidence are kept apart:

- **Implemented**: the code is present in the working tree today.
- **Automated**: `npm test`, re-run on 2026-10-11. The 37 authentication tests
  (`auth-email-flows`, `auth-pkce`, `auth-validation`) pass, as do all 258 tests,
  `npx tsc --noEmit` and `npx expo lint`. These tests run in Node. They send no email
  and contact no server, so they cannot show that an email arrives or that a link opens
  the app.
- **Android device**: reported by the user on 2026-10-09 on the installed development
  APK (`com.penguin.student`) against the hosted project, once after the deep-link fix
  and again after the PKCE S256 change. Nothing was re-run on a device for this review:
  no device is connected and `adb` is not installed on this machine.

### The four flows

| Flow | Implemented | Automated | Android device |
|---|---|---|---|
| 1. Account registration | Yes | PASS (input validation, secure-PKCE check before the request) | **PASS**: sign-up with a new address is accepted and the confirmation email arrives |
| 2. Email confirmation | Yes | PASS (link parsing, failure reasons, one exchange per link, fixed return address) | **PASS**: the link tapped in Gmail opens the installed app and the account is confirmed |
| 3. Password reset and recovery deep link | Yes | PASS (neutral message, recovery link handling, mail-failure detection) | **PASS**: the reset email arrives, its link opens the app on "Choose a new password.", and the password is updated |
| 4a. Log in after password reset | Yes | PASS (validation only) | **PASS**: log in works with the new password |
| 4b. Log in after email verification | Yes | PASS (validation only) | **NOT VERIFIED** as a separate step. The confirmation link itself signs the student in, and the session surviving an app restart is PASS, but typing the original password into the login screen for a newly confirmed account that has not reset its password was not recorded |

### Earlier problems, as they stand now

| Earlier problem | Status | Evidence |
|---|---|---|
| Mail provider rejecting the request (SMTP error) | Resolved in practice: both emails were delivered on the device | Device PASS. The sender settings themselves were not read, so which sender is in use is NOT VERIFIED |
| Link in Gmail opening a browser page or Expo Go, not the app | Resolved | Device PASS on the installed APK. Expo Go still cannot receive these links, by design |
| Recovery email pointing at `http://localhost:3000` | Resolved | Cause measured against the hosted project (a return address other than `penguin://auth/callback` falls back to the Site URL); the next request was logged with the correct address and its email opened the app |
| A mail failure looking like a connection problem | Fixed in code | Automated PASS. NOT VERIFIED on a device (needs a deliberately broken sender) |
| PKCE sent with the weaker `plain` method | Fixed in code | Automated PASS against the real auth library; on the device the warning is gone and the flows complete. The method recorded by the server (`auth.flow_state`) is NOT VERIFIED |

### Not verified on a device

None of these has failed. They have not been run.

- Resend verification email.
- After "Email confirmed.", Continue leading to onboarding.
- Both links with the app closed (cold start) and in the background.
- A link tapped twice; an older email's link after a resend.
- A recovery link for one account opened while signed in as another.
- Cancel on the reset screen.
- Logging out and logging in as a different account.
- Automatic session refresh after about an hour.
- A standalone `preview` APK. Every device result above is from the development APK.
- iOS and web: never run.

### Caveats on the device results

- The login, sign-up and email screens were restyled on 2026-10-10 (wordmark and text
  styles only; no logic), after the device run. They have not been seen on a device
  since.
- The PKCE S256 change that the second device run covered is not committed.
  `src/lib/webcrypto.ts`, `src/lib/webcrypto-core.ts` and `tests/auth-pkce.test.mjs`
  are untracked files; commit `7d84e18` alone does not contain it.

**Conclusion.** Registration, email confirmation, password reset with its deep link,
and log in after a reset are working on Android. Authentication is not a blocker for
the app. What remains is edge-case and release-build coverage, tracked in
`docs/android-acceptance-checklist.md`.

## Direct answers

**Is Penguin's UI/UX production-ready?** No. The design and its implementation are in
good order, but most of the interface has not been seen running on phones and there are
no notifications. Authentication is not among the reasons: its main flows passed on an
Android device (section 13).

**Which experiences already meet professional standards?** Judged from the code: the
design system and its consistency; loading, empty and error handling; the accessibility
groundwork; the honesty of chat status; and the safety of publishing and sending. These
would hold up in review at an established product, subject to device confirmation.

**What still prevents a Telegram or Instagram level of experience?** Verification first.
Then the things those apps make invisible: instant cached media, notifications and
badges, fluid motion throughout, and contextual actions on every item. Penguin has the
structure for them but few are built.

**What should be improved next for the greatest user benefit?** After device testing:
the unread badge, which makes replies visible. Email delivery already works; only the
sender's limits need confirming before a wider release.
