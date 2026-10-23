// A connection changed for this profile id: its header counts reload.
type Listener = (profileId: string) => void;
const listeners = new Set<Listener>();
export const profileStatsEvents = {
  subscribe(listener: Listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  emit(profileId: string) { for (const listener of listeners) listener(profileId); },
};
