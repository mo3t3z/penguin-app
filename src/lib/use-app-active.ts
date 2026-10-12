import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

// "inactive" is a brief iOS state (app switcher, a system dialog), not a reason to
// drop a connection, so only "background" counts as away.
const isActive = (state: AppStateStatus) => state !== 'background';

// False while the app is in the background. Live connections are closed then and
// reopened, with a reload of what was missed, when the app returns.
export function useAppActive() {
  const [active, setActive] = useState(() => isActive(AppState.currentState));
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => setActive(isActive(state)));
    return () => listener.remove();
  }, []);
  return active;
}
