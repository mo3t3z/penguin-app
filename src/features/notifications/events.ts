// The unread count may have changed (notices were read): the bell reloads.
type Listener = () => void;
const listeners = new Set<Listener>();
export const notificationEvents = {
  subscribe(listener: Listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  emit() { for (const listener of listeners) listener(); },
};
