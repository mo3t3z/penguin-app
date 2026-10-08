import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { authConfigurationError } from '@/lib/env';

type AuthState = { session: Session | null; loading: boolean; error: string | null; retry: () => void;
  recovery: { userId: string; expiresAt: number } | null; finishRecovery: () => void };
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(authConfigurationError);
  const [attempt, setAttempt] = useState(0);
  const [recovery, setRecovery] = useState<AuthState['recovery']>(null);
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    let revision = 0;
    const { data: { subscription } } = client.auth.onAuthStateChange((event, nextSession) => {
      // Synchronous only: never await Supabase calls inside this callback.
      revision += 1;
      if (active) {
        if (event === 'PASSWORD_RECOVERY' && nextSession) setRecovery({ userId: nextSession.user.id, expiresAt: Date.now() + 15 * 60_000 });
        else if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') setRecovery(null);
        setSession(nextSession); setLoading(false);
      }
    });
    const initialRevision = revision;
    void client.auth.getSession().then(({ data, error: restoreError }) => {
      if (!active) return;
      if (restoreError) throw restoreError;
      if (revision === initialRevision) setSession(data.session);
      setLoading(false);
    }).catch(() => {
      if (active) { setSession(null); setError('Unable to restore your saved session. Please retry.'); setLoading(false); }
    });
    const updateRefresh = (state: string) => {
      if (state === 'active') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    };
    const listener = Platform.OS !== 'web' ? AppState.addEventListener('change', updateRefresh) : null;
    if (Platform.OS !== 'web') updateRefresh(AppState.currentState);
    return () => { active = false; subscription.unsubscribe(); listener?.remove(); if (Platform.OS !== 'web') client.auth.stopAutoRefresh(); };
  }, [attempt]);
  const retry = () => {
    setLoading(Boolean(supabase));
    setError(authConfigurationError);
    setAttempt(value => value + 1);
  };
  return <AuthContext.Provider value={{ session, loading, error, retry, recovery, finishRecovery: () => setRecovery(null) }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
