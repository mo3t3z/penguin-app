import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { useAuth } from '@/features/auth/provider';
import type { Profile } from '@/lib/database.types';
import type { ProfileState } from './onboarding';
import { getCurrentProfile } from './service';

type ProfileContextValue = { state: ProfileState; refresh: () => Promise<Profile | null> };
const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: PropsWithChildren) {
  const { session, loading, recovery } = useAuth();
  const userId = session?.user.id ?? null;
  const enabled = Boolean(userId) && !loading && !recovery;
  const [snapshot, setSnapshot] = useState<{ userId: string | null; state: ProfileState }>({ userId: null, state: { status: 'loading' } });
  const generation = useRef(0);
  const active = useRef(false);
  const refresh = useCallback(async () => {
    if (!enabled || !userId) return null;
    const request = ++generation.current;
    try {
      const profile = await getCurrentProfile();
      if (!active.current || request !== generation.current) return null;
      if (profile && profile.id !== userId) throw new Error('Session changed.');
      setSnapshot({ userId, state: profile ? { status: 'ready', profile } : { status: 'missing' } });
      return profile;
    } catch {
      if (active.current && request === generation.current) {
        // Keep a mounted onboarding draft during a failed final refresh.
        setSnapshot(previous => previous.userId === userId && previous.state.status === 'ready' ? previous : {
          userId, state: { status: 'error', error: new Error('Unable to load your profile. Check your connection and try again.') },
        });
      }
      throw new Error('Unable to refresh your profile. Please try again.');
    }
  }, [enabled, userId]);

  useEffect(() => {
    active.current = true;
    if (enabled) void refresh().catch(() => {});
    return () => {
      active.current = false; generation.current += 1;
      // A later login to the same account must load afresh, not reuse its old gate.
      setSnapshot({ userId: null, state: { status: 'loading' } });
    };
  }, [enabled, refresh]);

  // Mask previous-account data synchronously without remounting the callback/reset routes.
  const state: ProfileState = enabled && snapshot.userId === userId ? snapshot.state : { status: 'loading' };
  return <ProfileContext.Provider value={{ state, refresh }}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const value = useContext(ProfileContext);
  if (!value) throw new Error('useProfile must be used within ProfileProvider');
  return value;
}
