// Where an email link returns to. Pure, so it can be unit tested.
//
// An installed build (development build, APK or release) always uses the fixed
// address below: it is the one registered with Android through `scheme` in app.json
// and the one allowlisted in Supabase. It must not be derived from the development
// server, whose host would otherwise leak into the address and change between runs.
//
// Expo Go cannot register the app's own scheme, and the web uses its own origin, so
// those two keep an address generated for the running environment.
export const APP_SCHEME = 'penguin';
export const AUTH_CALLBACK_PATH = 'auth/callback';
export const INSTALLED_AUTH_CALLBACK_URL = `${APP_SCHEME}://${AUTH_CALLBACK_PATH}`;

export function resolveAuthCallbackUrl(environment: {
  platform: string;
  expoGo: boolean;
  generated: () => string;
}) {
  if (environment.platform === 'web' || environment.expoGo) return environment.generated();
  return INSTALLED_AUTH_CALLBACK_URL;
}
