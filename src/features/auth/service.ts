import { supabase } from '@/lib/supabase';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { createURL } from 'expo-linking';
import { Platform } from 'react-native';
import { AUTH_CALLBACK_PATH, resolveAuthCallbackUrl } from './auth-redirect';
import { isEmailDeliveryFailure } from './auth-errors';

export { authErrorMessage } from './auth-errors';

// penguin://auth/callback in any installed build; an environment address only in
// Expo Go and on the web.
export const authCallbackUrl = () => resolveAuthCallbackUrl({
  platform: Platform.OS,
  expoGo: Constants.executionEnvironment === ExecutionEnvironment.StoreClient,
  generated: () => createURL(AUTH_CALLBACK_PATH),
});

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
export async function resendVerification(email: string) {
  const { error } = await client().auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: authCallbackUrl() } });
  if (error) throw error;
}

// The student always gets the same neutral answer, so the screen cannot reveal
// whether an account exists. The return value only says whether the server's mail
// provider refused to send, which the screen shows in development builds to make a
// broken SMTP setup visible; it is never shown in production.
export async function requestPasswordRecovery(email: string): Promise<{ deliveryFailed: boolean }> {
  try {
    const { error } = await client().auth.resetPasswordForEmail(email.trim(), { redirectTo: authCallbackUrl() });
    return { deliveryFailed: isEmailDeliveryFailure(error) };
  } catch (cause) {
    return { deliveryFailed: isEmailDeliveryFailure(cause) };
  }
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
