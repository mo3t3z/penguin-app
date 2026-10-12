import 'react-native-url-polyfill/auto';
// Must stay above the Supabase import: it provides the secure random source and
// SHA-256 that PKCE needs before the client exists.
import './webcrypto';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { authEnvironment } from './env';
import { nativeAuthStorage } from './auth-storage';
import type { Database } from './database.types';

export const supabase = authEnvironment ? createClient<Database>(authEnvironment.url, authEnvironment.publishableKey, {
  auth: {
    // No `lock`: the auth client coordinates session refreshes itself, and the option
    // is deprecated.
    ...(Platform.OS !== 'web' ? { storage: nativeAuthStorage } : {}),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
}) : null;
