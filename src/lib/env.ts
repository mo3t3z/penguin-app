const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

function configurationError(): string | null {
  if (!url || !publishableKey || url.includes('your-project') || publishableKey.includes('replace_me')) {
    return 'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env, then restart Expo.';
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !publishableKey.startsWith('sb_publishable_')) {
      return 'Use an HTTPS Supabase URL and a client-safe sb_publishable_ key.';
    }
  } catch {
    return 'EXPO_PUBLIC_SUPABASE_URL must be a valid HTTPS URL.';
  }
  return null;
}

export const authConfigurationError = configurationError();
export const authEnvironment = !authConfigurationError && url && publishableKey ? { url, publishableKey } : null;
