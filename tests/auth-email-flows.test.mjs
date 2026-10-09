import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { authErrorMessage, isEmailDeliveryFailure, isEmailRateLimited } from '../src/features/auth/auth-errors.ts';
import { APP_SCHEME, INSTALLED_AUTH_CALLBACK_URL, resolveAuthCallbackUrl } from '../src/features/auth/auth-redirect.ts';
import { emailCallbackKey, emailCallbackProblemText, readEmailCallback } from '../src/features/auth/email-callback.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const code = '6f1c2f9e-0b1a-4c57-9c0e-3f6a1c2d4e5f';
const hash = 'pkce_3c9d1f0a7b2e4d6c8a1f0b3e5d7c9a2b4e6f8a0c';

// --- Reading the link that opened the app ------------------------------------------

test('a confirmation or recovery link with a code is exchanged', () => {
  assert.deepEqual(readEmailCallback({ code }), { kind: 'code', code });
  // Supabase may add other parameters; they do not change the outcome.
  assert.deepEqual(readEmailCallback({ code, type: 'signup' }), { kind: 'code', code });
});

test('a recovery hash is accepted only for the recovery type', () => {
  assert.deepEqual(readEmailCallback({ token_hash: hash, type: 'recovery' }), { kind: 'recovery-token', tokenHash: hash });
  for (const type of [undefined, 'signup', 'email', 'magiclink', 'invite', ['recovery'], 'RECOVERY']) {
    assert.deepEqual(readEmailCallback({ token_hash: hash, type }), { kind: 'failed', reason: 'malformed' });
  }
});

test('an expired or already used link is reported as expired', () => {
  assert.deepEqual(
    readEmailCallback({ error: 'access_denied', error_code: 'otp_expired', error_description: 'Email link is invalid or has expired' }),
    { kind: 'failed', reason: 'expired' },
  );
  // An error always wins, even if a code is also present.
  assert.deepEqual(readEmailCallback({ code, error_code: 'otp_expired' }), { kind: 'failed', reason: 'expired' });
});

test('any other server error is a refused link', () => {
  assert.deepEqual(readEmailCallback({ error: 'access_denied' }), { kind: 'failed', reason: 'denied' });
  assert.deepEqual(readEmailCallback({ error: 'server_error', error_code: 'unexpected_failure' }), { kind: 'failed', reason: 'denied' });
  assert.deepEqual(readEmailCallback({ error_description: 'anything' }), { kind: 'failed', reason: 'denied' });
});

test('a link with no credential is missing, and a damaged one is malformed', () => {
  assert.deepEqual(readEmailCallback({}), { kind: 'failed', reason: 'missing' });
  assert.deepEqual(readEmailCallback({ type: 'recovery' }), { kind: 'failed', reason: 'missing' });
  for (const value of ['', 'short', 'has space in it', `${code}&next=/home`, `${code}#fragment`, '../../etc/passwd',
    'x'.repeat(513), [code, code], `${code}'--`, `<script>${code}`]) {
    assert.deepEqual(readEmailCallback({ code: value }), { kind: 'failed', reason: 'malformed' }, String(value));
    assert.deepEqual(readEmailCallback({ token_hash: value, type: 'recovery' }), { kind: 'failed', reason: 'malformed' }, String(value));
  }
  assert.deepEqual(readEmailCallback({ code, token_hash: hash, type: 'recovery' }), { kind: 'failed', reason: 'malformed' });
});

test('the same link gives the same key and different links give different keys', () => {
  assert.equal(emailCallbackKey(readEmailCallback({ code })), emailCallbackKey(readEmailCallback({ code })));
  assert.notEqual(emailCallbackKey(readEmailCallback({ code })), emailCallbackKey(readEmailCallback({ code: `${code}0` })));
  assert.notEqual(emailCallbackKey({ kind: 'code', code: hash }), emailCallbackKey({ kind: 'recovery-token', tokenHash: hash }));
  assert.equal(emailCallbackKey(readEmailCallback({})), 'failed:missing');
});

test('each problem has its own guidance and none repeats server text', () => {
  const texts = ['expired', 'exchange', 'missing', 'malformed', 'denied'].map(emailCallbackProblemText);
  assert.match(texts[0], /expired or was already used/);
  assert.match(texts[1], /most recent email/);
  assert.match(texts[1], /may already be confirmed: try logging in/);
  assert.match(texts[2], /incomplete/);
  assert.equal(texts[2], texts[3]);
  for (const text of texts) assert.doesNotMatch(text, /otp_|access_denied|pkce|verifier|token|code\b/i);
});

// --- Error messages, including a failing mail provider ------------------------------

test('a mail-provider failure is recognised and explained without blaming the student', () => {
  const smtp = { status: 500, code: 'unexpected_failure', message: 'Error sending confirmation email' };
  const recovery = { status: 500, code: 'unexpected_failure', message: 'Error sending recovery email' };
  assert.equal(isEmailDeliveryFailure(smtp), true);
  assert.equal(isEmailDeliveryFailure(recovery), true);
  assert.equal(isEmailDeliveryFailure({ code: 'email_provider_disabled' }), true);
  assert.match(authErrorMessage(smtp), /couldn’t send the email right now/);
  // The raw server text, which can carry provider details, is never shown.
  assert.doesNotMatch(authErrorMessage({ status: 500, message: 'Error sending confirmation email: 535 Username and Password not accepted' }),
    /535|Username|Password not accepted/);
});

test('other failures are not mistaken for a mail-provider failure', () => {
  for (const error of [null, undefined, 'x', new Error('Network request failed'), { status: 500, message: 'Database error' },
    { status: 400, code: 'validation_failed', message: 'Unable to send email to invalid address' },
    { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' }]) {
    assert.equal(isEmailDeliveryFailure(error), false);
  }
  assert.equal(authErrorMessage(new Error('Network request failed')), 'We could not complete this request. Check your connection and try again.');
});

test('known authentication errors keep their messages', () => {
  assert.equal(authErrorMessage({ code: 'invalid_credentials' }), 'The email or password is incorrect.');
  assert.match(authErrorMessage({ code: 'email_not_confirmed' }), /Confirm your email before signing in/);
  assert.match(authErrorMessage({ code: 'same_password' }), /different from your current password/);
  assert.match(authErrorMessage({ code: 'weak_password' }), /stronger password/);
  assert.equal(authErrorMessage({ code: 'signup_disabled' }), 'Account registration is currently unavailable.');
  for (const error of [{ code: 'over_email_send_rate_limit' }, { code: 'over_request_rate_limit' }, { status: 429 }]) {
    assert.equal(isEmailRateLimited(error), true);
    assert.equal(authErrorMessage(error), 'Too many attempts. Please try again later.');
  }
});

// --- Wiring (source checks) ---------------------------------------------------------

test('every email request carries the app callback and uses PKCE without URL auto-detection', () => {
  const service = read('../src/features/auth/service.ts');
  assert.match(service, /export const authCallbackUrl = \(\) => resolveAuthCallbackUrl\(\{/);
  assert.match(service, /expoGo: Constants\.executionEnvironment === ExecutionEnvironment\.StoreClient,/);
  assert.match(service, /generated: \(\) => createURL\(AUTH_CALLBACK_PATH\),/);
  assert.match(service, /auth\.signUp\(\{ email: email\.trim\(\), password, options: \{ emailRedirectTo: authCallbackUrl\(\) \} \}\)/);
  assert.match(service, /auth\.resend\(\{ type: 'signup', email: email\.trim\(\), options: \{ emailRedirectTo: authCallbackUrl\(\) \} \}\)/);
  assert.ok(service.includes('auth.resetPasswordForEmail(email.trim(), { redirectTo: authCallbackUrl() })'));
  // One address function serves sign-up, resend and password reset; nothing is hard-coded.
  assert.equal(service.split('authCallbackUrl()').length - 1, 3);
  assert.ok(!service.includes('localhost'));
  const client = read('../src/lib/supabase.ts');
  assert.match(client, /flowType: 'pkce'/);
  assert.match(client, /detectSessionInUrl: false/);
  assert.match(read('../app.json'), /"scheme": "penguin"/);
});

test('a link is completed once and recovery is decided by Supabase, not by the URL', () => {
  const service = read('../src/features/auth/service.ts');
  assert.match(service, /if \(lastExchange\?\.code === code && lastExchange\.expires > Date\.now\(\)\) return lastExchange\.result;/);
  assert.match(service, /if \(event === 'PASSWORD_RECOVERY'\) recoveredUser = session\?\.user\.id \?\? null;/);
  assert.match(service, /return recoveredUser === data\.session\.user\.id \? 'recovery' : 'confirmation';/);
  assert.match(service, /verifyOtp\(\{ token_hash: tokenHash, type: 'recovery' \}\)/);
  assert.match(service, /if \(error \|\| !data\.session\) throw new Error\('Invalid or expired email link'\);/);
  // Nothing about a link or a request is written to the console.
  assert.ok(!service.includes('console.'));
});

test('the callback screen uses the parsed link, a fixed destination, and offers a way forward', () => {
  const screen = read('../src/app/auth/callback.tsx');
  assert.match(screen, /const request = readEmailCallback\(params\);/);
  assert.match(screen, /key=\{emailCallbackKey\(request\)\}/);
  assert.match(screen, /if \(kind === 'recovery'\) router\.replace\('\/reset-password'\);/);
  assert.match(screen, /setState\(\{ status: 'error', problem: 'exchange' \}\)/);
  assert.match(screen, /\{session \? null : <Link href="\/login" replace asChild>/);
  assert.match(screen, /href="\/check-email"/);
  assert.match(screen, /href="\/forgot-password"/);
  // Never a destination taken from the link, and nothing from the link is logged.
  assert.doesNotMatch(screen, /params\.(next|redirect|returnTo)|console\./);
});

test('recovery stays neutral for the student and is bound to the recovered account', () => {
  const service = read('../src/features/auth/service.ts');
  assert.match(service, /Promise<\{ deliveryFailed: boolean \}>/);
  const request = read('../src/features/auth/email-request-screen.tsx');
  assert.match(request, /\{__DEV__ && recovery && deliveryFailed \?/);
  assert.match(request, /If an account exists for that address, you may receive a reset link\./);
  const reset = read('../src/app/reset-password.tsx');
  assert.match(reset, /const allowed = Boolean\(session && recovery\?\.userId === session\.user\.id && recovery\.expiresAt > now\);/);
  const provider = read('../src/features/auth/provider.tsx');
  assert.match(provider, /if \(event === 'PASSWORD_RECOVERY' && nextSession\) setRecovery\(\{ userId: nextSession\.user\.id, expiresAt: Date\.now\(\) \+ 15 \* 60_000 \}\);/);
  assert.match(provider, /else if \(event === 'SIGNED_OUT' \|\| event === 'SIGNED_IN'\) setRecovery\(null\);/);
  const layout = read('../src/app/_layout.tsx');
  assert.match(layout, /guard=\{destination === 'main' && !recovery\}/);
  assert.match(layout, /<Stack\.Screen name="auth\/callback" \/>/);
});

// --- Deep-link address and Android build configuration ------------------------------

test('an installed build always returns to penguin://auth/callback', () => {
  const generated = () => 'penguin://192.168.1.20:8081auth/callback';
  assert.equal(INSTALLED_AUTH_CALLBACK_URL, 'penguin://auth/callback');
  // Development build, preview APK or release: never derived from the dev server.
  assert.equal(resolveAuthCallbackUrl({ platform: 'android', expoGo: false, generated }), 'penguin://auth/callback');
  assert.equal(resolveAuthCallbackUrl({ platform: 'ios', expoGo: false, generated }), 'penguin://auth/callback');
});

test('Expo Go and the web keep an address for their own environment', () => {
  assert.equal(resolveAuthCallbackUrl({ platform: 'android', expoGo: true, generated: () => 'exp://192.168.1.20:8081/--/auth/callback' }),
    'exp://192.168.1.20:8081/--/auth/callback');
  assert.equal(resolveAuthCallbackUrl({ platform: 'web', expoGo: false, generated: () => 'https://penguin.example/auth/callback' }),
    'https://penguin.example/auth/callback');
});

test('the scheme, package and callback route agree across app config and code', () => {
  const config = JSON.parse(read('../app.json')).expo;
  assert.equal(config.scheme, APP_SCHEME);
  assert.match(config.android.package, /^[a-z][a-z0-9_]*(.[a-z][a-z0-9_]*)+$/);
  assert.ok(config.plugins.includes('expo-router'));
  // The callback route file that penguin://auth/callback resolves to.
  assert.ok(read('../src/app/auth/callback.tsx').includes('export default function EmailCallback()'));
});

test('EAS has development and preview APK profiles and no production release profile', () => {
  const eas = JSON.parse(read('../eas.json'));
  assert.deepEqual(Object.keys(eas.build).sort(), ['development', 'preview']);
  assert.equal(eas.build.development.developmentClient, true);
  for (const profile of Object.values(eas.build)) {
    assert.equal(profile.distribution, 'internal');
    assert.equal(profile.android.buildType, 'apk');
    assert.equal(profile.env, undefined, 'no values are stored in eas.json');
  }
  const dependencies = JSON.parse(read('../package.json')).dependencies;
  assert.ok(dependencies['expo-dev-client']);
  assert.doesNotMatch(read('../eas.json'), /sb_|supabase.co|secret|password/i);
});

test('no temporary diagnostics remain in the auth code', () => {
  const sources = ['../src/features/auth/service.ts', '../src/features/auth/auth-redirect.ts',
    '../src/features/auth/email-request-screen.tsx', '../src/features/auth/email-callback.ts',
    '../src/features/auth/auth-errors.ts', '../src/app/auth/callback.tsx'].map(read).join(' ');
  for (const marker of ['console.', 'AUTH_REDIRECT_REVISION', 'describeAuthRedirect', 'authRequestLogEntry', 'authRedirectDiagnostics', "'r3'", "'r2'"]) {
    assert.ok(!sources.includes(marker), marker);
  }
});
