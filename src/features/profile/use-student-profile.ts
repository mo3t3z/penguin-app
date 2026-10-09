import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/provider';
import { getProfileById, type PublicProfile } from './service';

type StudentProfileState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'missing' }
  | { status: 'ready'; profile: PublicProfile };

// Loads another student's public profile for the signed-in viewer. The result is
// keyed by viewer and profile, so a response for a previous account or profile is
// never shown.
export function useStudentProfile(profileId: string | null) {
  const { session } = useAuth();
  const viewerId = session?.user.id ?? null;
  const [attempt, setAttempt] = useState(0);
  const key = `${viewerId}:${profileId}:${attempt}`;
  const [result, setResult] = useState<{ key: string; state: StudentProfileState } | null>(null);
  useEffect(() => {
    if (!viewerId || !profileId) return;
    let active = true;
    void getProfileById(profileId).then((profile) => {
      if (active) setResult({ key, state: profile ? { status: 'ready', profile } : { status: 'missing' } });
    }).catch(() => { if (active) setResult({ key, state: { status: 'failed' } }); });
    return () => { active = false; };
  }, [key, profileId, viewerId]);
  const state: StudentProfileState = !profileId ? { status: 'missing' }
    : result?.key === key ? result.state : { status: 'loading' };
  return { state, retry: () => setAttempt((value) => value + 1) };
}
