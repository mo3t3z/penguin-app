import { useCallback, useEffect, useState } from 'react';
import { profileStatsEvents } from './events';
import { getIncomingRequests, type ConnectionRequest } from './service';

// Requests waiting for the viewer. Reloads when a connection changes in the app.
export function useIncomingRequests(viewerId: string | null) {
  const [requests, setRequests] = useState<ConnectionRequest[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => { setFailed(false); setVersion(value => value + 1); }, []);
  useEffect(() => profileStatsEvents.subscribe(reload), [reload]);
  useEffect(() => {
    if (!viewerId) return;
    let active = true;
    void getIncomingRequests(viewerId).then(next => { if (active) { setFailed(false); setRequests(next); } })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [viewerId, version]);
  return { requests, failed, reload };
}
