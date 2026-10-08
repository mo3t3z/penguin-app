import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import { createClient, processLock } from '@supabase/supabase-js';
import { authEnvironment } from './env';
import { nativeAuthStorage } from './auth-storage';
import type { Database } from './database.types';

export const supabase = authEnvironment ? createClient<Database>(authEnvironment.url, authEnvironment.publishableKey, {
  auth: {
    ...(Platform.OS !== 'web' ? { storage: nativeAuthStorage, lock: processLock } : {}),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
}) : null;
