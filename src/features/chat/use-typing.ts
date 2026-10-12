import { useCallback, useEffect, useRef, useState } from 'react';
import { liveClient } from './realtime-service';
import { openTypingChannel, shouldSendTyping, TYPING_EXPIRY_MS, TYPING_IDLE_MS } from './realtime';

// Typing and "just read" signals for one open conversation. `enabled` is false whenever the
// composer is not open (blocked either way, deleted account), the screen is not in
// view or the app is in the background: the channel is closed and nothing is sent.
// Nothing is stored anywhere.
export function useTyping({ conversationId, userId, otherId, enabled, onPeerRead }: {
  conversationId: string | null;
  userId: string | null;
  otherId: string | null;
  enabled: boolean;
  // The other student signalled that they read the conversation.
  onPeerRead: () => void;
}) {
  const [otherTyping, setOtherTyping] = useState(false);
  const channel = useRef<ReturnType<typeof openTypingChannel> | null>(null);
  const lastSent = useRef<number | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A read to announce as soon as the channel has joined.
  const readPending = useRef(false);

  const stop = useCallback(() => {
    if (idleTimer.current) { clearTimeout(idleTimer.current); idleTimer.current = null; }
    if (lastSent.current !== null) channel.current?.send(false);
    lastSent.current = null;
  }, []);

  useEffect(() => {
    const client = liveClient();
    if (!enabled || !client || !conversationId || !userId || !otherId) return;
    const clearExpiry = () => {
      if (expiryTimer.current) { clearTimeout(expiryTimer.current); expiryTimer.current = null; }
    };
    let opened: ReturnType<typeof openTypingChannel> | null = null;
    let joined = false;
    try {
      opened = openTypingChannel(client, conversationId, userId, otherId, {
        onTyping: (typing) => {
          clearExpiry();
          setOtherTyping(typing);
          // Forgotten if "stopped" never arrives.
          if (typing) expiryTimer.current = setTimeout(() => setOtherTyping(false), TYPING_EXPIRY_MS);
        },
        onPeerRead,
        onState: (state) => {
          if (state === 'joined') {
            joined = true;
            if (readPending.current && opened?.sendRead()) readPending.current = false;
            return;
          }
          clearExpiry();
          setOtherTyping(false);
          // Refused before ever joining (no permission, or the server has no typing
          // policy yet): give up for this visit instead of asking again and again.
          if (!joined) opened?.close();
        },
      });
    } catch {
      // The channel could not be created; the conversation works without it.
    }
    channel.current = opened;
    return () => {
      stop();
      clearExpiry();
      setOtherTyping(false);
      opened?.close();
      if (channel.current === opened) channel.current = null;
    };
  }, [conversationId, enabled, onPeerRead, otherId, stop, userId]);

  // Called on every change of the draft.
  const draftChanged = useCallback((hasText: boolean) => {
    if (!hasText) { stop(); return; }
    const now = Date.now();
    if (shouldSendTyping(lastSent.current, now) && channel.current?.send(true)) lastSent.current = now;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(stop, TYPING_IDLE_MS);
  }, [stop]);

  // An arriving message ends the indicator at once.
  const clearOtherTyping = useCallback(() => setOtherTyping(false), []);

  // Tells the other student's device to ask the server for the receipt again.
  const signalRead = useCallback(() => {
    readPending.current = !channel.current?.sendRead();
  }, []);

  return { otherTyping: enabled && otherTyping, draftChanged, clearOtherTyping, signalRead };
}
