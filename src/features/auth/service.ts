import { supabase } from '@/lib/supabase';
import { createURL } from 'expo-linking';

export const authCallbackUrl = () => createURL('auth/callback');

function client() {
  if (!supabase) throw new Error('Authentication is not configured.');
  return supabase;
}
export async function signIn(email: string, password: string) {
  const { error } = await client().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}
export async function signUp(email: string, password: string) {
  const { data, error } = await client().auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: authCallbackUrl() } });
  if (error) throw error;
  return { hasSession: Boolean(data.session) };
}
export async function signOut() {
  const { error } = await client().auth.signOut({ scope: 'local' });
  if (error) throw error;
}
export function authErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  if (code === 'invalid_credentials') return 'The email or password is incorrect.';
  if (code === 'email_not_confirmed') return 'Confirm your email before signing in. Use “Resend verification” if you need a new link.';
  if (code === 'same_password') return 'Choose a password different from your current password.';
  if (code === 'weak_password') return 'Choose a stronger password that meets the server’s password policy.';
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') return 'Too many attempts. Please try again later.';
  if (code === 'signup_disabled') return 'Account registration is currently unavailable.';
  return 'We could not complete this request. Check your connection and try again.';
}

export async function resendVerification(email: string) {
  const { error } = await client().auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: authCallbackUrl() } });
  if (error) throw error;
}

export async function requestPasswordRecovery(email: string) {
  // Never surface account-specific server responses or existence information.
  try { await client().auth.resetPasswordForEmail(email.trim(), { redirectTo: authCallbackUrl() }); }
  catch { /* Same neutral response for transport and account errors. */ }
}

// Coalesce StrictMode/remount delivery of the same one-use code. No tokens/logging.
let lastExchange: { code: string; expires: number; result: Promise<'recovery' | 'confirmation'> } | null = null;
export function completeEmailCallback(code: string) {
  if (lastExchange?.code === code && lastExchange.expires > Date.now()) return lastExchange.result;
  const result = (async (): Promise<'recovery' | 'confirmation'> => {
    const auth = client().auth;
    let recoveredUser: string | null = null;
    const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') recoveredUser = session?.user.id ?? null;
    });
    try {
      const { data, error } = await auth.exchangeCodeForSession(code);
      if (error || !data.session) throw new Error('Invalid or expired email link');
      return recoveredUser === data.session.user.id ? 'recovery' : 'confirmation';
    } finally { subscription.unsubscribe(); }
  })();
  lastExchange = { code, expires: Date.now() + 30_000, result };
  // Do not retain a callback credential indefinitely in application memory.
  setTimeout(() => { if (lastExchange?.result === result) lastExchange = null; }, 30_000);
  return result;
}

// Coalesce remounts so a one-use recovery hash is verified only once.
let lastRecovery: { tokenHash: string; result: Promise<'recovery'> } | null = null;
export function completeRecoveryCallback(tokenHash: string) {
  if (lastRecovery?.tokenHash === tokenHash) return lastRecovery.result;
  const result = (async (): Promise<'recovery'> => {
    const { data, error } = await client().auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
    if (error || !data.session) throw new Error('Invalid or expired recovery link');
    // verifyOtp persists the session and emits PASSWORD_RECOVERY to AuthProvider.
    return 'recovery';
  })();
  lastRecovery = { tokenHash, result };
  setTimeout(() => { if (lastRecovery?.result === result) lastRecovery = null; }, 30_000);
  return result;
}

export async function updateRecoveredPassword(password: string) {
  const { error } = await client().auth.updateUser({ password });
  if (error) throw error;
}
