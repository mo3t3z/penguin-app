import { useEffect, useState } from 'react';
import { profileStatsEvents } from './events';
import { getProfileStats } from './service';

// Post and connection counts for a profile header; null while loading or failed.
export function useProfileStats(profileId: string) {
  const [stats, setStats] = useState<{ id: string; posts: number; connections: number } | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => profileStatsEvents.subscribe(id => { if (id === profileId) setVersion(value => value + 1); }), [profileId]);
  useEffect(() => {
    let active = true;
    void getProfileStats(profileId).then(next => { if (active) setStats({ id: profileId, ...next }); }).catch(() => undefined);
    return () => { active = false; };
  }, [profileId, version]);
  return stats?.id === profileId ? stats : null;
}
