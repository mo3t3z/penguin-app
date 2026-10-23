import { useCallback, useEffect, useRef, useState } from 'react';
import { profileStatsEvents } from './events';
import type { ConnectionState } from './connection-state';
import { getConnectionState, removeConnection, requestConnection, respondToConnection } from './service';

const actionError = 'Penguin couldn’t update this connection. Try again.';

// The viewer's connection with one student, and the actions that change it. A
// second tap while one is in flight does nothing.
export function useConnection(viewerId: string, otherId: string) {
  const [state, setState] = useState<ConnectionState | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const inFlight = useRef(false);
  useEffect(() => {
    let active = true;
    void getConnectionState(viewerId, otherId)
      .then(next => { if (active) { setFailed(false); setState(next); } })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [viewerId, otherId, attempt]);
  const run = useCallback(async (action: () => Promise<ConnectionState>) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      setState(await action());
      profileStatsEvents.emit(otherId);
    } catch { setError(actionError); }
    finally { inFlight.current = false; setBusy(false); }
  }, [otherId]);
  return {
    state, failed, busy, error,
    retry: () => { setFailed(false); setAttempt(value => value + 1); },
    connect: () => run(() => requestConnection(otherId)),
    accept: () => run(() => respondToConnection(otherId, true)),
    decline: () => run(() => respondToConnection(otherId, false)),
    remove: () => run(() => removeConnection(otherId)),
  };
}
